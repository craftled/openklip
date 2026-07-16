// Generic durable job-registry helper, mirroring src/agent-tasks.ts's
// write-through / hydrate-and-reconcile / retention-cap / corruption-backup
// pattern for any long-running background job registry that keeps an
// in-memory Map<id, J> as its fast read cache. Two current users:
// src/ingest-jobs.ts (one workspace-level file) and src/silences-jobs.ts
// (one file per project). Each configures its own file path, status set,
// and reconciliation patch; this module owns the disk I/O, the retention
// cap, and the once-per-process restart reconciliation.
//
// Unlike tasks.json (src/agent-tasks.ts), these job files are written ONLY
// by the single Next server process: no spawned agent/MCP process ever
// writes ingest-jobs.json or silences-jobs.json, so there is no
// cross-process race to guard against with an advisory lockfile. That
// removes the one reason agent-tasks.ts's I/O has to be async: everything
// here uses synchronous fs calls instead. This matters because the poll
// routes call getIngestJob/getSilencesJob synchronously (no await) and
// return the result straight into Response.json — those read paths are
// intentionally NOT touched by this durability work, so hydration has to be
// able to run to completion before a synchronous read can see it. Sync fs
// calls make that trivial: within one process nothing else runs while a
// sync read/write is in flight, so there's no interleaving to guard against
// either.
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

export interface JobStoreRecord {
  createdAt: number;
  id: string;
  status: string;
  updatedAt: number;
}

interface JobStoreFile<J extends JobStoreRecord> {
  jobs: J[];
}

export interface JobStoreConfig<J extends JobStoreRecord> {
  /** Max terminal records retained; oldest terminal (by array position,
   * newest-first) dropped first once the cap is exceeded. A non-terminal
   * (still "running") record is never dropped: there is no way to recover
   * its live progress once its record is gone. */
  cap: number;
  /** Absolute path to the JSON store file. */
  filePath: string;
  /** Shape guard for one record, applied when reading untrusted disk JSON.
   * A row that fails this check is filtered out silently (a hand edit or a
   * future format change shouldn't corrupt the whole file the way a
   * non-array `jobs` does). */
  isRecord: (value: unknown) => value is J;
  /** Patches a record found still "running" on first load after a restart
   * into its terminal interrupted state. Called with the current wall-clock
   * time to stamp updatedAt. */
  reconcileRunning: (record: J, now: number) => J;
  /** Statuses that mean "still in progress" as of the last write: any
   * record in one of these states on first load after a restart is
   * reconciled via `reconcileRunning`. */
  runningStatuses: ReadonlySet<string>;
  /** Statuses that will never change again. Only these are droppable by the
   * retention cap. */
  terminalStatuses: ReadonlySet<string>;
}

// Gates the once-per-process restart reconciliation, keyed by absolute file
// path (mirrors agent-tasks.ts's per-slug STARTUP_RECONCILED set: here the
// natural key is the file, since a job store isn't always slug-scoped).
const RECONCILED = new Set<string>();

/** Test-only: clear the reconciliation gate so a subsequent loadJobRecords
 * call re-runs restart reconciliation against the given file (or every file,
 * if none is given). Production code never calls this. */
export function resetJobStoreReconciliationForTests(filePath?: string): void {
  if (filePath) {
    RECONCILED.delete(filePath);
  } else {
    RECONCILED.clear();
  }
}

function backupCorruptFile(filePath: string): void {
  try {
    renameSync(filePath, `${filePath}.bad-${Date.now()}`);
  } catch {
    // Best effort: a concurrent reader in this same process may have
    // already moved it (two entry points hydrating the same file back to
    // back). Nothing to do either way.
  }
}

function readRecordsSync<J extends JobStoreRecord>(
  config: JobStoreConfig<J>
): J[] {
  const fp = config.filePath;
  if (!existsSync(fp)) {
    return [];
  }
  let raw: string;
  try {
    raw = readFileSync(fp, "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A corrupt store must not be silently treated as "just empty" without
    // a trace: back the bad file aside (recoverable) and start fresh rather
    // than throwing, since unlike tasks.json this file is never the only
    // copy of anything a user directly authored (it's job bookkeeping the
    // app itself produced) — losing a snapshot of in-flight job status is
    // far cheaper than wedging every poll route that reads through here.
    backupCorruptFile(fp);
    return [];
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as JobStoreFile<J>).jobs)
  ) {
    backupCorruptFile(fp);
    return [];
  }
  return (parsed as JobStoreFile<J>).jobs.filter(config.isRecord);
}

/** Cap terminal records at config.cap: drop the oldest terminal records past
 * the cap. `records` is newest-first (callers prepend on create), so the
 * oldest entries sit at the end. A non-terminal record is never dropped. */
function capRecords<J extends JobStoreRecord>(
  records: J[],
  config: JobStoreConfig<J>
): J[] {
  if (records.length <= config.cap) {
    return records;
  }
  const kept = [...records];
  for (let i = kept.length - 1; i >= 0 && kept.length > config.cap; i -= 1) {
    const record = kept[i];
    if (record && config.terminalStatuses.has(record.status)) {
      kept.splice(i, 1);
    }
  }
  return kept;
}

function writeRecordsSync<J extends JobStoreRecord>(
  config: JobStoreConfig<J>,
  records: J[]
): void {
  const fp = config.filePath;
  mkdirSync(dirname(fp), { recursive: true });
  const capped = capRecords(records, config);
  const json = JSON.stringify({ jobs: capped }, null, 2);
  // Atomic tmp+rename write with fsync durability, mirroring
  // src/projectStore.ts's saveProject: fsync before rename so the tmp
  // file's bytes are actually on disk (not just buffered) before it's
  // linked in under the real name, and a crash mid-write leaves the old
  // file intact instead of a truncated half-file the next read would treat
  // as corrupt.
  const tmp = `${fp}.tmp-${process.pid}`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, json);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, fp);
}

/** Load persisted records, reconciling any record still in a "running"
 * status left over from a crashed/restarted process into its interrupted
 * terminal state, exactly once per (process, filePath). Callers hydrate
 * their in-memory Map from this on first access after a restart; subsequent
 * reads should come from the Map, not from calling this again (it always
 * re-reads the file, so it must never sit on the hot poll-read path). */
export function loadJobRecords<J extends JobStoreRecord>(
  config: JobStoreConfig<J>
): J[] {
  const records = readRecordsSync(config);
  if (RECONCILED.has(config.filePath)) {
    return records;
  }
  RECONCILED.add(config.filePath);
  const now = Date.now();
  let changed = false;
  const reconciled = records.map((record) => {
    if (!config.runningStatuses.has(record.status)) {
      return record;
    }
    changed = true;
    return config.reconcileRunning(record, now);
  });
  if (changed) {
    writeRecordsSync(config, reconciled);
  }
  return reconciled;
}

/** Write-through insert-or-replace: upsert one record by id and persist the
 * whole (capped) file atomically. Call this on job CREATE and on every
 * status transition — never on fine-grained progress ticks, which stay
 * in-memory only. New records are prepended (newest-first), matching the
 * retention cap's eviction-from-the-end assumption. */
export function saveJobRecord<J extends JobStoreRecord>(
  config: JobStoreConfig<J>,
  record: J
): void {
  const current = readRecordsSync(config);
  const idx = current.findIndex((r) => r.id === record.id);
  const next =
    idx === -1
      ? [record, ...current]
      : current.map((r, i) => (i === idx ? record : r));
  writeRecordsSync(config, next);
}

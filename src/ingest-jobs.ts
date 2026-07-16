// In-memory ingest job registry. Ingest is minutes-long (transcode + Whisper),
// so the GUI can't block on it: it starts a job and polls its progress. Both the
// upload flow and the folder-watch share this one registry. The in-memory Map
// stays the fast read cache (polls read it every ~700ms) — reads never touch
// disk. Status transitions are write-through persisted to a workspace-level
// store (ingestJobsStorePath, see src/paths.ts and src/job-store.ts) so a job
// record survives an app restart instead of vanishing with the process: a
// poller that was watching a job when the server restarted sees "interrupted"
// (a new terminal status) rather than a 404. Ingest CREATES the project the
// job is for, so this can't be a per-project store the way silences-jobs.ts's
// is: the project dir may not exist yet, or ever, if ingest fails outright.
import { randomUUID } from "node:crypto";
import { isIngestPersistError } from "./ingest-persist-error.ts";
import type { IngestProgress } from "./ingest-types.ts";
import {
  type JobStoreConfig,
  loadJobRecords,
  saveJobRecord,
} from "./job-store.ts";
import { ingestJobsStorePath } from "./paths.ts";

export type IngestJobStatus =
  | "running"
  | "done"
  | "error"
  | "partial"
  | "interrupted";

export interface IngestJob {
  createdAt: number;
  error?: string;
  /** Source filename being ingested (for display). */
  filename: string;
  id: string;
  progress?: IngestProgress;
  /** Target/created project slug. */
  slug: string;
  status: IngestJobStatus;
  updatedAt: number;
  /** Set when ingest finished but a follow-up step failed (e.g. source persist). */
  warning?: string;
}

const TERMINAL_STATUSES: ReadonlySet<IngestJobStatus> = new Set([
  "done",
  "error",
  "partial",
  "interrupted",
]);
const RUNNING_STATUSES: ReadonlySet<IngestJobStatus> = new Set(["running"]);

// Cap persisted terminal records at 100 (mirrors agent-tasks.ts's task cap):
// a long-lived workspace accumulates ingest history forever otherwise. A
// still-"running" record is never evicted regardless of the cap.
const JOBS_CAP = 100;

const INTERRUPTED_MESSAGE = "Server restarted while ingest was running";

function isIngestJob(value: unknown): value is IngestJob {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.slug !== "string" ||
    typeof row.filename !== "string"
  ) {
    return false;
  }
  if (
    typeof row.status !== "string" ||
    !(
      TERMINAL_STATUSES.has(row.status as IngestJobStatus) ||
      RUNNING_STATUSES.has(row.status as IngestJobStatus)
    )
  ) {
    return false;
  }
  if (typeof row.createdAt !== "number" || typeof row.updatedAt !== "number") {
    return false;
  }
  if (row.error !== undefined && typeof row.error !== "string") {
    return false;
  }
  if (row.warning !== undefined && typeof row.warning !== "string") {
    return false;
  }
  if (
    row.progress !== undefined &&
    (typeof row.progress !== "object" || row.progress === null)
  ) {
    return false;
  }
  return true;
}

function storeConfig(): JobStoreConfig<IngestJob> {
  return {
    filePath: ingestJobsStorePath(),
    cap: JOBS_CAP,
    terminalStatuses: TERMINAL_STATUSES,
    runningStatuses: RUNNING_STATUSES,
    isRecord: isIngestJob,
    reconcileRunning: (record, now) => ({
      ...record,
      status: "interrupted",
      error: INTERRUPTED_MESSAGE,
      updatedAt: now,
    }),
  };
}

const jobs = new Map<string, IngestJob>();
const inFlightSlugs = new Set<string>();

// Gates hydrating persisted history into `jobs` once per process (mirrors
// agent-tasks.ts's STARTUP_RECONCILED). Newly created jobs are always added
// to the Map directly regardless of this flag; it only controls whether OLD
// on-disk records (from before this process started) get pulled in.
let hydrated = false;

function ensureHydrated(): void {
  if (hydrated) {
    return;
  }
  hydrated = true;
  for (const record of loadJobRecords(storeConfig())) {
    jobs.set(record.id, record);
  }
}

export function resetIngestJobsForTests(): void {
  jobs.clear();
  inFlightSlugs.clear();
  hydrated = false;
}

function persist(job: IngestJob): void {
  saveJobRecord(storeConfig(), job);
}

export function isSlugInFlight(slug: string): boolean {
  return inFlightSlugs.has(slug);
}

// Atomically claim a slug before any await point. The upload route has
// several awaits (form parsing, temp writes) between checking the slug and
// starting the job; two same-name uploads could both pass a bare
// isSlugInFlight check inside that window and race two ingests over the same
// project dir. Reserving synchronously closes the gap: exactly one caller
// wins. Release with releaseIngestSlug on early-error paths; a started job
// releases via startIngestJob's finally.
export function reserveIngestSlug(slug: string): boolean {
  if (inFlightSlugs.has(slug)) {
    return false;
  }
  inFlightSlugs.add(slug);
  return true;
}

export function releaseIngestSlug(slug: string): void {
  inFlightSlugs.delete(slug);
}

export function getIngestJob(id: string): IngestJob | undefined {
  ensureHydrated();
  return jobs.get(id);
}

export function listIngestJobs(): IngestJob[] {
  ensureHydrated();
  return [...jobs.values()];
}

// Start an ingest job. `run` performs the actual ingest and resolves to the
// created slug; it receives an onProgress callback to report phases. Returns the
// job immediately (status "running"); the same object is mutated in place as the
// job progresses, so a poller reading getIngestJob sees live updates.
//
// Persistence is write-through on CREATE and on every status transition
// (running -> done/error/partial). Progress ticks (the onProgress callback
// below) intentionally never call persist(): the durability requirement is
// the STATUS surviving a restart, not every fine-grained progress update,
// and persisting on every tick would mean a disk write roughly every few
// hundred milliseconds for the whole ingest duration.
export function startIngestJob(input: {
  filename: string;
  slug: string;
  run: (onProgress: (p: IngestProgress) => void) => Promise<string>;
}): IngestJob {
  ensureHydrated();
  const now = Date.now();
  const job: IngestJob = {
    id: randomUUID(),
    filename: input.filename,
    slug: input.slug,
    status: "running",
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  inFlightSlugs.add(input.slug);
  persist(job);
  void input
    .run((p) => {
      job.progress = p;
    })
    .then(
      (slug) => {
        job.slug = slug;
        job.status = "done";
        job.updatedAt = Date.now();
        persist(job);
      },
      (e: unknown) => {
        if (isIngestPersistError(e)) {
          job.slug = e.slug;
          job.status = "partial";
          job.warning = e.message;
          job.updatedAt = Date.now();
          persist(job);
          return;
        }
        job.status = "error";
        job.error = (e as Error).message;
        job.updatedAt = Date.now();
        persist(job);
      }
    )
    .finally(() => {
      inFlightSlugs.delete(input.slug);
    });
  return job;
}

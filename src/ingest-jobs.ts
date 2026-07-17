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
import { existsSync } from "node:fs";
import { ingest } from "./ingest.ts";
import { isIngestPersistError } from "./ingest-persist-error.ts";
import type { IngestProgress } from "./ingest-types.ts";
import {
  deleteJobRecord,
  type JobStoreConfig,
  loadJobRecords,
  saveJobRecord,
} from "./job-store.ts";
import { assertValidSlug, ingestJobsStorePath, projectPaths } from "./paths.ts";

export type IngestJobStatus =
  | "running"
  | "done"
  | "error"
  | "partial"
  | "interrupted"
  | "cancelled";

export interface IngestJob {
  createdAt: number;
  error?: string;
  /** Source filename being ingested (for display). */
  filename: string;
  /** Whether the original ingest ran with force (overwrite an existing
   * project). Persisted so retryIngestJob replays the run with the same
   * overwrite semantics instead of failing on its own half-written project
   * (or, worse, being granted force it never had). Optional for the same
   * pre-upgrade-records reason as sourcePath. */
  force?: boolean;
  id: string;
  progress?: IngestProgress;
  /** Target/created project slug. */
  slug: string;
  /** Original source file path this ingest ran (or will retry) against.
   * Set once at job creation; not touched by status transitions. Used by
   * retryIngestJob to reconstruct the ingest() call. Note: for the
   * upload-based routes (post.ts/folder/url/takes/cams) the caller's `run`
   * closure deletes its temp source in a `finally` block on EVERY settle
   * path (success and failure) — see those routes' own comments — so this
   * path is typically already gone by the time a failed job could be
   * retried. Retry is most useful for scan-inbox jobs (a durable inbox
   * file) and jobs interrupted by a server restart before their temp dir
   * was reaped.
   *
   * Optional because records written by releases before this field existed
   * don't have it: requiring it in isIngestJob would silently drop all
   * pre-upgrade history at hydration (and the next store write would then
   * permanently erase it). Jobs missing it simply aren't retryable. */
  sourcePath?: string;
  status: IngestJobStatus;
  updatedAt: number;
  /** Set when ingest finished but a follow-up step failed (e.g. source persist). */
  warning?: string;
}

export interface IngestJobRetryResult {
  error?: string;
  ok: boolean;
}

const TERMINAL_STATUSES: ReadonlySet<IngestJobStatus> = new Set([
  "done",
  "error",
  "partial",
  "interrupted",
  "cancelled",
]);
const RUNNING_STATUSES: ReadonlySet<IngestJobStatus> = new Set(["running"]);
const CANCELLED_MESSAGE = "Cancelled by user";

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
  // Absent on records written before these fields existed (see the field
  // docs): tolerate undefined so hydration keeps pre-upgrade history.
  if (row.sourcePath !== undefined && typeof row.sourcePath !== "string") {
    return false;
  }
  if (row.force !== undefined && typeof row.force !== "boolean") {
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

// Process-local live-job registry (NOT persisted): a restarted process has
// no live subprocess to abort, and CRAFT-6183's existing reconciliation
// already turns an orphaned "running" record into "interrupted" on restart,
// which is the correct outcome for that case. This Map exists purely to
// let cancelIngestJob find the AbortController for a job that's live IN
// THIS PROCESS.
const liveControllers = new Map<string, AbortController>();

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
  liveControllers.clear();
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

// Shared settle logic for both a freshly-started job (startIngestJob) and a
// retried one (retryIngestJob): resolve -> "done", IngestPersistError ->
// "partial", our own controller's signal already aborted -> "cancelled"
// (only reachable by actually running this catch path — a process
// restart mid-cancel reconciles to "interrupted" via job-store.ts instead,
// never "cancelled"), anything else -> "error".
//
// Persistence is write-through on CREATE and on every status transition
// (running -> done/error/partial/cancelled). Progress ticks (the onProgress
// callback passed into `run`) intentionally never call persist(): the
// durability requirement is the STATUS surviving a restart, not every
// fine-grained progress update, and persisting on every tick would mean a
// disk write roughly every few hundred milliseconds for the whole ingest
// duration.
function attachRunLifecycle(
  job: IngestJob,
  originalSlug: string,
  controller: AbortController,
  runPromise: Promise<string>
): Promise<void> {
  liveControllers.set(job.id, controller);
  return runPromise
    .then(
      (slug) => {
        job.slug = slug;
        // A cancel can land while the run is inside post-ingest work that
        // doesn't consume the signal (source persist, folder-asset copy in
        // the route closures) and the run then resolves anyway. The caller
        // of cancelIngestJob was already told true — landing this record on
        // "done" would contradict that, so the abort flag wins over the
        // resolution. The produced project is left on disk either way (same
        // as a mid-pipeline cancel); "cancelled" describes the user's
        // decision, not a guarantee that no artifacts exist.
        if (controller.signal.aborted) {
          job.status = "cancelled";
          job.error = CANCELLED_MESSAGE;
          job.updatedAt = Date.now();
          persist(job);
          return;
        }
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
        if (controller.signal.aborted) {
          job.status = "cancelled";
          job.error = CANCELLED_MESSAGE;
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
      inFlightSlugs.delete(originalSlug);
      liveControllers.delete(job.id);
    });
}

// Start an ingest job. `run` performs the actual ingest and resolves to the
// created slug; it receives an onProgress callback to report phases, and an
// AbortSignal it should thread into the real work so cancelIngestJob can
// stop it. Returns the job immediately (status "running"); the same object
// is mutated in place as the job progresses, so a poller reading
// getIngestJob sees live updates.
export function startIngestJob(input: {
  filename: string;
  slug: string;
  /** Original source file path for this ingest; stored for retryIngestJob.
   * See the IngestJob.sourcePath field doc for the upload-route caveat. */
  sourcePath: string;
  /** Whether this ingest runs with force (overwrite an existing project);
   * stored so a retry replays the same overwrite semantics. */
  force?: boolean;
  run: (
    onProgress: (p: IngestProgress) => void,
    signal: AbortSignal
  ) => Promise<string>;
}): IngestJob {
  ensureHydrated();
  const now = Date.now();
  const job: IngestJob = {
    id: randomUUID(),
    filename: input.filename,
    slug: input.slug,
    sourcePath: input.sourcePath,
    force: input.force,
    status: "running",
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  inFlightSlugs.add(input.slug);
  persist(job);
  const controller = new AbortController();
  void attachRunLifecycle(
    job,
    input.slug,
    controller,
    input.run((p) => {
      job.progress = p;
    }, controller.signal)
  );
  return job;
}

// Aborts the live subprocess/pipeline behind a running job, if any is found
// in THIS process's liveControllers Map. Returns whether a live job was
// found and cancelled; the actual "cancelled" status transition happens
// asynchronously once the aborted run() promise settles (see
// attachRunLifecycle above), not synchronously here. Cancellation is only as
// effective as the `run` closure's own signal-handling: the whole-project
// ingest routes (post/folder/url/scan-inbox) thread this signal all the way
// into ingest()'s ffmpeg/Whisper/CLIP spawns, and (CRAFT-6253) the
// takes/cams routes' ingestTake/ingestCam pipelines (src/assembly.ts,
// src/cams.ts) now consume it too, so a composite-slug take/cam job.slug is
// no longer refused here — controller.abort() is kind-agnostic and every
// run closure now has something listening on the signal.
export function cancelIngestJob(id: string): boolean {
  ensureHydrated();
  const job = jobs.get(id);
  if (job?.status !== "running") {
    return false;
  }
  const controller = liveControllers.get(id);
  if (!controller) {
    return false;
  }
  controller.abort();
  return true;
}

// Retry a terminal, non-"done" ingest job exactly once: re-runs the full
// ingest() pipeline against the job's stored sourcePath, flipping the
// EXISTING record back to "running" (not a new job id) so the GUI keeps
// polling the same jobId. Only whole-project ingest jobs are retryable this
// way (checked via assertValidSlug on job.slug): the takes/cams routes key
// their jobs with a composite `${slug}/takes/${id}` / `${slug}/cams/${id}`
// string (never a bare valid slug, see paths.ts's SLUG_PATTERN), and those
// pipelines don't go through generic ingest() at all, so blindly retrying
// one through ingest() would wipe/rebuild an unrelated top-level project
// from that take/cam's video file instead of redoing the take/cam.
// Not declared `async`: every branch here is synchronous (the retried
// ingest() run is deliberately fire-and-forgotten via attachRunLifecycle,
// not awaited), and that synchronicity up to the status-flip below is the
// exactly-once guard's whole basis (see the comment on it). Returning
// Promise.resolve(...) keeps the same Promise<IngestJobRetryResult> call
// contract for callers.
export function retryIngestJob(id: string): Promise<IngestJobRetryResult> {
  ensureHydrated();
  const job = jobs.get(id);
  if (!job) {
    return Promise.resolve({ ok: false, error: `job not found: ${id}` });
  }
  if (job.status === "running") {
    return Promise.resolve({ ok: false, error: "job is already running" });
  }
  if (job.status === "done") {
    return Promise.resolve({
      ok: false,
      error: "job already completed successfully",
    });
  }
  if (!TERMINAL_STATUSES.has(job.status)) {
    return Promise.resolve({
      ok: false,
      error: "job is not in a retryable state",
    });
  }
  try {
    assertValidSlug(job.slug);
  } catch {
    return Promise.resolve({
      ok: false,
      error: "retry is only supported for whole-project ingest jobs",
    });
  }
  const sourcePath = job.sourcePath;
  if (!sourcePath) {
    // Records persisted before sourcePath existed (see the field doc) carry
    // nothing to re-run against.
    return Promise.resolve({
      ok: false,
      error: "job predates retry support; re-ingest manually",
    });
  }
  if (!existsSync(sourcePath)) {
    return Promise.resolve({
      ok: false,
      error: "original source no longer available; re-ingest manually",
    });
  }
  // Fail fast, synchronously and honestly, on the case ingest() would only
  // reject later: a non-force job whose project dir already exists — either
  // this job's own half-written output (interrupted after project.json) or
  // a pre-existing project the original run was refused over. Granting
  // force here implicitly could wipe a project the user never agreed to
  // overwrite, so retry never escalates beyond the run's original setting.
  if (!job.force && existsSync(projectPaths(job.slug).project)) {
    return Promise.resolve({
      ok: false,
      error: `project already exists: ${job.slug}; delete it or re-ingest with force`,
    });
  }

  // Exactly-once claim (mirrors web/lib/save-queue.ts's beginPersisting:
  // check state, transition, THEN act): everything above this point is
  // synchronous with no await, so a concurrent second retryIngestJob call
  // for the same id sees status "running" already and refuses at the check
  // above instead of racing a second ingest() run.
  const originalSlug = job.slug;
  job.status = "running";
  job.error = undefined;
  job.warning = undefined;
  job.updatedAt = Date.now();
  persist(job);
  inFlightSlugs.add(originalSlug);

  const controller = new AbortController();
  void attachRunLifecycle(
    job,
    originalSlug,
    controller,
    ingest(sourcePath, {
      onProgress: (p) => {
        job.progress = p;
      },
      signal: controller.signal,
      force: job.force,
    })
  );
  return Promise.resolve({ ok: true });
}

// Delete a terminal job's record from both the in-memory Map and the
// persisted store file. Refuses (throws) on a still-"running" job: cancel
// it first. This never touches the project directory itself; that is an
// existing, separately-reviewed flow (force-reingest / project delete), not
// this task. Returns false when the job id is simply not found.
export function deleteIngestJobRecord(id: string): boolean {
  ensureHydrated();
  const job = jobs.get(id);
  if (!job) {
    return false;
  }
  if (job.status === "running") {
    throw new Error("job is still running; cancel it first");
  }
  jobs.delete(id);
  liveControllers.delete(id);
  deleteJobRecord(storeConfig(), id);
  return true;
}

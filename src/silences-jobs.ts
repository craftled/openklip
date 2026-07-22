// In-memory silences-analysis job registry. Cold audio analysis over the full
// ingest-time PCM can block for minutes on multi-hour footage, so the Cleanup
// tab starts a job and polls progress instead of holding a single GET open.
// The in-memory Map stays the fast read cache (polls read it every ~700ms);
// reads never touch disk. Status transitions are write-through persisted per
// project (projectPaths(slug).silencesJobs, see src/paths.ts and
// src/job-store.ts) so a job record survives an app restart: a poller
// watching a job when the server restarted sees "interrupted" (a new
// terminal status) instead of a 404.
//
// getSilencesJob(id) is called by the poll route with ONLY the job id (no
// slug) — see app/api/projects/[slug]/silences/[jobId]/route.ts — so a job
// id must be self-describing enough to find its project's store file on a
// cold Map miss after a restart. The id therefore embeds the slug as a
// prefix (`${slug}~${uuid}`; "~" can never appear in a valid slug, see
// paths.ts's SLUG_PATTERN, so the split is unambiguous).
import { randomUUID } from "node:crypto";
import {
  type AudioAnalysisProgress,
  computeAudioAnalysis,
} from "./audio-analysis.ts";
import type { SilenceSpan } from "./audio-analysis-core.ts";
import {
  deleteJobRecord,
  type JobStoreConfig,
  loadJobRecords,
  saveJobRecord,
} from "./job-store.ts";
import { assertValidSlug, projectPaths } from "./paths.ts";

export type SilencesJobStatus =
  | "running"
  | "done"
  | "error"
  | "interrupted"
  | "cancelled";

export type SilencesJobRetryResult =
  | { error: string; ok: false }
  | { job: SilencesJob; ok: true };

export interface SilencesJobProgress {
  message: string;
  phase: AudioAnalysisProgress["phase"];
  step: number;
  total: number;
}

export interface SilencesJob {
  createdAt: number;
  error?: string;
  id: string;
  progress?: SilencesJobProgress;
  silences?: SilenceSpan[];
  slug: string;
  status: SilencesJobStatus;
  updatedAt: number;
}

const TERMINAL_STATUSES: ReadonlySet<SilencesJobStatus> = new Set([
  "done",
  "error",
  "interrupted",
  "cancelled",
]);
const RUNNING_STATUSES: ReadonlySet<SilencesJobStatus> = new Set(["running"]);
const CANCELLED_MESSAGE = "Cancelled by user";

// Cap persisted terminal records per project at 100 (mirrors agent-tasks.ts's
// task cap). A still-"running" record is never evicted regardless of cap.
const JOBS_CAP = 100;

const INTERRUPTED_MESSAGE = "Server restarted while analysis was running";
const ID_SEPARATOR = "~";

function safeAnalysisError(): string {
  // Do not echo raw fs errors (e.g. EACCES) which embed absolute paths.
  return "failed to analyze audio";
}

function isSilencesJob(value: unknown): value is SilencesJob {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.slug !== "string") {
    return false;
  }
  if (
    typeof row.status !== "string" ||
    !(
      TERMINAL_STATUSES.has(row.status as SilencesJobStatus) ||
      RUNNING_STATUSES.has(row.status as SilencesJobStatus)
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
  if (row.progress !== undefined && typeof row.progress !== "object") {
    return false;
  }
  if (row.silences !== undefined && !Array.isArray(row.silences)) {
    return false;
  }
  return true;
}

function storeConfig(slug: string): JobStoreConfig<SilencesJob> {
  return {
    filePath: projectPaths(slug).silencesJobs,
    cap: JOBS_CAP,
    terminalStatuses: TERMINAL_STATUSES,
    runningStatuses: RUNNING_STATUSES,
    isRecord: isSilencesJob,
    reconcileRunning: (record, now) => ({
      ...record,
      status: "interrupted",
      error: INTERRUPTED_MESSAGE,
      updatedAt: now,
    }),
  };
}

const jobs = new Map<string, SilencesJob>();
const inFlightSlugs = new Set<string>();

// Process-local live-job registry (NOT persisted): mirrors src/ingest-jobs.ts's
// liveControllers Map. A restarted process has no live analysis to abort,
// and the existing restart reconciliation already turns an orphaned
// "running" record into "interrupted", which is correct for that case.
const liveControllers = new Map<string, AbortController>();

// Gates hydrating a project's persisted history into `jobs` once per
// (process, slug) — mirrors agent-tasks.ts's per-slug STARTUP_RECONCILED.
const hydratedSlugs = new Set<string>();

function ensureHydrated(slug: string): void {
  if (hydratedSlugs.has(slug)) {
    return;
  }
  hydratedSlugs.add(slug);
  for (const record of loadJobRecords(storeConfig(slug))) {
    jobs.set(record.id, record);
  }
}

export function resetSilencesJobsForTests(): void {
  jobs.clear();
  inFlightSlugs.clear();
  liveControllers.clear();
  hydratedSlugs.clear();
}

function persist(job: SilencesJob): void {
  saveJobRecord(storeConfig(job.slug), job);
}

function slugFromJobId(id: string): string | undefined {
  const i = id.indexOf(ID_SEPARATOR);
  if (i <= 0) {
    return;
  }
  return id.slice(0, i);
}

export function getSilencesJob(id: string): SilencesJob | undefined {
  const cached = jobs.get(id);
  if (cached) {
    return cached;
  }
  // Cold Map miss: this may be a job from before a restart. Recover the
  // project it belongs to from the id itself (see module docstring) and
  // hydrate that project's store, then retry.
  const slug = slugFromJobId(id);
  if (!slug) {
    return;
  }
  try {
    assertValidSlug(slug);
  } catch {
    return;
  }
  ensureHydrated(slug);
  return jobs.get(id);
}

// All of one project's silences jobs (running + terminal history), for the
// Job Center UI. Hydrates that project's store on a cold Map miss the same
// way getSilencesJob does, so this also works right after a restart before
// any other silences-jobs call has touched this slug.
export function listSilencesJobs(slug: string): SilencesJob[] {
  ensureHydrated(slug);
  return [...jobs.values()].filter((job) => job.slug === slug);
}

export function getRunningSilencesJobForSlug(
  slug: string
): SilencesJob | undefined {
  ensureHydrated(slug);
  for (const job of jobs.values()) {
    if (job.slug === slug && job.status === "running") {
      return job;
    }
  }
}

export function isSlugSilencesAnalysisInFlight(slug: string): boolean {
  return inFlightSlugs.has(slug);
}

// Start a silences-analysis job for a slug, or return the already-running job
// for that slug. Returns immediately (status "running"); the same object is
// mutated in place as the job progresses.
//
// Persistence is write-through on CREATE and on every status transition
// (running -> done/error). The onProgress callback below intentionally never
// calls persist(): the durability requirement is the STATUS surviving a
// restart, not every fine-grained progress update.
export function startSilencesJob(slug: string): SilencesJob {
  ensureHydrated(slug);
  const existing = getRunningSilencesJobForSlug(slug);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const job: SilencesJob = {
    id: `${slug}${ID_SEPARATOR}${randomUUID()}`,
    slug,
    status: "running",
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  inFlightSlugs.add(slug);
  persist(job);

  const controller = new AbortController();
  liveControllers.set(job.id, controller);

  void computeAudioAnalysis(
    slug,
    {},
    (p) => {
      job.progress = p;
    },
    controller.signal
  )
    .then((analysis) => {
      job.silences = analysis.silences;
      job.status = "done";
      job.updatedAt = Date.now();
      persist(job);
    })
    .catch(() => {
      // computeAudioAnalysis's cooperative cancellation throws a
      // ProcessCancelledError when our own controller's signal is the
      // reason it stopped; checking the controller (not the error's type)
      // keeps this consistent with src/ingest-jobs.ts's attachRunLifecycle
      // and doesn't require re-exporting that error type here. A crash
      // mid-cancel (process restart) never reaches this catch at all, so
      // "cancelled" is only ever set by an explicit cancel that actually
      // ran this handler, matching src/ingest-jobs.ts's contract.
      if (controller.signal.aborted) {
        job.status = "cancelled";
        job.error = CANCELLED_MESSAGE;
      } else {
        job.status = "error";
        job.error = safeAnalysisError();
      }
      job.updatedAt = Date.now();
      persist(job);
    })
    .finally(() => {
      inFlightSlugs.delete(slug);
      liveControllers.delete(job.id);
    });

  return job;
}

// Aborts the live analysis behind a running job, if this process has it in
// liveControllers. Returns whether a live job was found and cancelled; the
// actual "cancelled" status transition happens once the aborted
// computeAudioAnalysis promise settles (see startSilencesJob's .catch
// above), not synchronously here.
export function cancelSilencesJob(id: string): boolean {
  const job = getSilencesJob(id);
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

// Retry a terminal silences job. Unlike ingest retry, this does not need to
// reconstruct anything (re-analysis just needs the slug, and the ingested
// audio is always available once a project exists), so it delegates
// straight to startSilencesJob(slug) rather than duplicating its run/settle
// logic. startSilencesJob's own getRunningSilencesJobForSlug check already
// gives this exactly-once behavior for free: every check below happens
// synchronously with no await before calling startSilencesJob, so a
// concurrent second retrySilencesJob call for the same slug either still
// sees the ORIGINAL job's terminal status (a different job id, harmless: it
// just also calls startSilencesJob and finds the first call's job already
// running for that slug) or, once hydrated, sees it running and refuses
// above. Either way only one computeAudioAnalysis actually runs.
// Not declared `async`: every branch is synchronous, matching
// src/ingest-jobs.ts's retryIngestJob (see its comment for why that
// synchronicity is exactly what makes the exactly-once behavior work).
export function retrySilencesJob(id: string): Promise<SilencesJobRetryResult> {
  const job = getSilencesJob(id);
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
  const retried = startSilencesJob(job.slug);
  return Promise.resolve({ ok: true, job: retried });
}

// Delete a terminal job's record from both the in-memory Map and the
// per-project persisted store file. Refuses (throws) on a still-"running"
// job: cancel it first. Returns false when the job id is simply not found.
export function deleteSilencesJobRecord(id: string): boolean {
  const job = getSilencesJob(id);
  if (!job) {
    return false;
  }
  if (job.status === "running") {
    throw new Error("job is still running; cancel it first");
  }
  jobs.delete(id);
  liveControllers.delete(id);
  deleteJobRecord(storeConfig(job.slug), id);
  return true;
}

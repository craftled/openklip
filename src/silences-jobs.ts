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
  type JobStoreConfig,
  loadJobRecords,
  saveJobRecord,
} from "./job-store.ts";
import { assertValidSlug, projectPaths } from "./paths.ts";

export type SilencesJobStatus = "running" | "done" | "error" | "interrupted";

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
]);
const RUNNING_STATUSES: ReadonlySet<SilencesJobStatus> = new Set(["running"]);

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

export function getRunningSilencesJobForSlug(
  slug: string
): SilencesJob | undefined {
  ensureHydrated(slug);
  for (const job of jobs.values()) {
    if (job.slug === slug && job.status === "running") {
      return job;
    }
  }
  return;
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

  void computeAudioAnalysis(slug, {}, (p) => {
    job.progress = p;
  })
    .then((analysis) => {
      job.silences = analysis.silences;
      job.status = "done";
      job.updatedAt = Date.now();
      persist(job);
    })
    .catch(() => {
      job.status = "error";
      job.error = safeAnalysisError();
      job.updatedAt = Date.now();
      persist(job);
    })
    .finally(() => {
      inFlightSlugs.delete(slug);
    });

  return job;
}

// In-memory silences-analysis job registry. Cold audio analysis over the full
// ingest-time PCM can block for minutes on multi-hour footage, so the Cleanup
// tab starts a job and polls progress instead of holding a single GET open.
// State is per-process in memory, matching src/ingest-jobs.ts.
import { randomUUID } from "node:crypto";
import {
  type AudioAnalysisProgress,
  computeAudioAnalysis,
} from "./audio-analysis.ts";
import type { SilenceSpan } from "./audio-analysis-core.ts";

export type SilencesJobStatus = "running" | "done" | "error";

export interface SilencesJobProgress {
  message: string;
  phase: AudioAnalysisProgress["phase"];
  step: number;
  total: number;
}

export interface SilencesJob {
  error?: string;
  id: string;
  progress?: SilencesJobProgress;
  silences?: SilenceSpan[];
  slug: string;
  status: SilencesJobStatus;
}

const jobs = new Map<string, SilencesJob>();
const inFlightSlugs = new Set<string>();

function safeAnalysisError(): string {
  // Do not echo raw fs errors (e.g. EACCES) which embed absolute paths.
  return "failed to analyze audio";
}

export function getSilencesJob(id: string): SilencesJob | undefined {
  return jobs.get(id);
}

export function getRunningSilencesJobForSlug(
  slug: string
): SilencesJob | undefined {
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
export function startSilencesJob(slug: string): SilencesJob {
  const existing = getRunningSilencesJobForSlug(slug);
  if (existing) {
    return existing;
  }

  const job: SilencesJob = {
    id: randomUUID(),
    slug,
    status: "running",
  };
  jobs.set(job.id, job);
  inFlightSlugs.add(slug);

  void computeAudioAnalysis(slug, {}, (p) => {
    job.progress = p;
  })
    .then((analysis) => {
      job.silences = analysis.silences;
      job.status = "done";
    })
    .catch(() => {
      job.status = "error";
      job.error = safeAnalysisError();
    })
    .finally(() => {
      inFlightSlugs.delete(slug);
    });

  return job;
}

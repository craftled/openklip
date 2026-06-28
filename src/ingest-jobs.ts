// In-memory ingest job registry. Ingest is minutes-long (transcode + Whisper),
// so the GUI can't block on it: it starts a job and polls its progress. Both the
// upload flow and the folder-watch share this one registry. State is per-process
// in memory, which fits OpenKlip's local single-process server (the running
// `serve` / dev process owns it); it is not durable across restarts.
import { randomUUID } from "node:crypto";
import type { IngestProgress } from "./ingest.ts";

export type IngestJobStatus = "running" | "done" | "error";

export interface IngestJob {
  error?: string;
  /** Source filename being ingested (for display). */
  filename: string;
  id: string;
  progress?: IngestProgress;
  /** Target/created project slug. */
  slug: string;
  status: IngestJobStatus;
}

const jobs = new Map<string, IngestJob>();
const inFlightSlugs = new Set<string>();

export function isSlugInFlight(slug: string): boolean {
  return inFlightSlugs.has(slug);
}

export function getIngestJob(id: string): IngestJob | undefined {
  return jobs.get(id);
}

export function listIngestJobs(): IngestJob[] {
  return [...jobs.values()];
}

// Start an ingest job. `run` performs the actual ingest and resolves to the
// created slug; it receives an onProgress callback to report phases. Returns the
// job immediately (status "running"); the same object is mutated in place as the
// job progresses, so a poller reading getIngestJob sees live updates.
export function startIngestJob(input: {
  filename: string;
  slug: string;
  run: (onProgress: (p: IngestProgress) => void) => Promise<string>;
}): IngestJob {
  const job: IngestJob = {
    id: randomUUID(),
    filename: input.filename,
    slug: input.slug,
    status: "running",
  };
  jobs.set(job.id, job);
  inFlightSlugs.add(input.slug);
  void input
    .run((p) => {
      job.progress = p;
    })
    .then(
      (slug) => {
        job.slug = slug;
        job.status = "done";
      },
      (e: unknown) => {
        job.status = "error";
        job.error = (e as Error).message;
      }
    )
    .finally(() => {
      inFlightSlugs.delete(input.slug);
    });
  return job;
}

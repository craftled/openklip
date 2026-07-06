// In-memory ingest job registry. Ingest is minutes-long (transcode + Whisper),
// so the GUI can't block on it: it starts a job and polls its progress. Both the
// upload flow and the folder-watch share this one registry. State is per-process
// in memory, which fits OpenKlip's local single-process server (the running
// `serve` / dev process owns it); it is not durable across restarts.
import { randomUUID } from "node:crypto";
import { isIngestPersistError } from "./ingest-persist-error.ts";
import type { IngestProgress } from "./ingest-types.ts";

export type IngestJobStatus = "running" | "done" | "error" | "partial";

export interface IngestJob {
  error?: string;
  /** Source filename being ingested (for display). */
  filename: string;
  id: string;
  progress?: IngestProgress;
  /** Target/created project slug. */
  slug: string;
  status: IngestJobStatus;
  /** Set when ingest finished but a follow-up step failed (e.g. source persist). */
  warning?: string;
}

const jobs = new Map<string, IngestJob>();
const inFlightSlugs = new Set<string>();

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
        if (isIngestPersistError(e)) {
          job.slug = e.slug;
          job.status = "partial";
          job.warning = e.message;
          return;
        }
        job.status = "error";
        job.error = (e as Error).message;
      }
    )
    .finally(() => {
      inFlightSlugs.delete(input.slug);
    });
  return job;
}

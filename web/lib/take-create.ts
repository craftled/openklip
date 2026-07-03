// Upload a video to ingest as a NEW take under an existing project's
// takes/<id>/, then poll its background ingest job to completion. Mirrors
// project-create.ts's createProjectFromVideo shape (upload -> job -> poll
// the shared /api/projects/ingest/[jobId] route), adapted for takes.
//
// ingestTake (src/assembly.ts) has no phase-by-phase onProgress of its own
// (unlike the whole-project ingest()), so `progress` here typically stays
// unset until the job settles: callers get an honest "busy, no percentage"
// signal rather than a fabricated phase breakdown. onProgress is still
// accepted for forward compatibility if ingestTake grows phase reporting.
import type { IngestProgressView } from "./project-create";

const POLL_MS = 700;

interface TakeIngestJobView {
  error?: string;
  progress?: IngestProgressView;
  slug: string;
  status: "running" | "done" | "error";
}

export interface TakeIngestOptions {
  /** Take id (defaults server-side to a filename slug, matching `take-add`). */
  id?: string;
  label?: string;
}

// Resolves with the ingested take's id (the job's resolved `slug` field,
// repurposed here since the shared registry only ever promises a resolved
// string identifier, not specifically a project slug).
export async function ingestTakeFromVideo(
  slug: string,
  file: File,
  opts?: TakeIngestOptions,
  onProgress?: (p: IngestProgressView) => void
): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  if (opts?.id) {
    fd.append("id", opts.id);
  }
  if (opts?.label) {
    fd.append("label", opts.label);
  }
  const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/takes`, {
    method: "POST",
    body: fd,
  });
  const data = (await res.json()) as { error?: string; jobId?: string };
  if (!(res.ok && data.jobId)) {
    throw new Error(data.error ?? `Add take failed (${res.status})`);
  }
  return await pollTakeIngestJob(data.jobId, onProgress);
}

async function pollTakeIngestJob(
  jobId: string,
  onProgress?: (p: IngestProgressView) => void
): Promise<string> {
  for (;;) {
    const res = await fetch(`/api/projects/ingest/${jobId}`);
    if (!res.ok) {
      throw new Error(`Ingest job lost (${res.status})`);
    }
    const job = (await res.json()) as TakeIngestJobView;
    if (job.progress) {
      onProgress?.(job.progress);
    }
    if (job.status === "done") {
      return job.slug;
    }
    if (job.status === "error") {
      throw new Error(job.error ?? "Take ingest failed");
    }
    await new Promise((r) => {
      setTimeout(r, POLL_MS);
    });
  }
}

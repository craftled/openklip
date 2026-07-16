// Upload a video to ingest as a NEW cam under an existing project's
// cams/<id>/, then poll its background ingest job to completion. Mirrors
// take-create.ts's upload -> job -> poll shape.
import type { CamRole } from "@engine/cams";
import type { IngestProgressView } from "./project-create";

const POLL_MS = 700;

interface CamIngestJobView {
  error?: string;
  progress?: IngestProgressView;
  slug: string;
  status: "running" | "done" | "error" | "interrupted";
}

export interface CamIngestOptions {
  /** Cam id (defaults server-side to the next cam1/cam2 slot). */
  id?: string;
  name?: string;
  offsetMs?: number;
  role?: CamRole;
}

export async function ingestCamFromVideo(
  slug: string,
  file: File,
  opts?: CamIngestOptions,
  onProgress?: (p: IngestProgressView) => void
): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  if (opts?.id) {
    fd.append("id", opts.id);
  }
  if (opts?.name) {
    fd.append("name", opts.name);
  }
  if (opts?.role) {
    fd.append("role", opts.role);
  }
  if (opts?.offsetMs !== undefined) {
    fd.append("offsetMs", String(opts.offsetMs));
  }
  const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/cams`, {
    method: "POST",
    body: fd,
  });
  const data = (await res.json()) as { error?: string; jobId?: string };
  if (!(res.ok && data.jobId)) {
    throw new Error(data.error ?? `Add camera failed (${res.status})`);
  }
  return await pollCamIngestJob(data.jobId, onProgress);
}

async function pollCamIngestJob(
  jobId: string,
  onProgress?: (p: IngestProgressView) => void
): Promise<string> {
  for (;;) {
    const res = await fetch(`/api/projects/ingest/${jobId}`);
    if (!res.ok) {
      throw new Error(`Ingest job lost (${res.status})`);
    }
    const job = (await res.json()) as CamIngestJobView;
    if (job.progress) {
      onProgress?.(job.progress);
    }
    if (job.status === "done") {
      return job.slug;
    }
    if (job.status === "interrupted") {
      throw new Error(
        "Camera ingest was interrupted by an app restart. Please retry."
      );
    }
    if (job.status === "error") {
      throw new Error(job.error ?? "Camera ingest failed");
    }
    await new Promise((r) => {
      setTimeout(r, POLL_MS);
    });
  }
}

export interface IngestProgressView {
  message: string;
  phase: string;
  step: number;
  total: number;
}

interface IngestJobView {
  error?: string;
  progress?: IngestProgressView;
  slug: string;
  status: "running" | "done" | "error";
}

const POLL_MS = 700;

// Upload a video, then poll its ingest job to completion, reporting progress.
// Resolves with the created slug. A 409 (project already exists) throws so the
// dialog can offer a force re-ingest.
export async function createProjectFromVideo(
  file: File,
  onProgress?: (p: IngestProgressView) => void
): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/projects", { method: "POST", body: fd });
  const data = (await res.json()) as { error?: string; jobId?: string };
  if (!(res.ok && data.jobId)) {
    throw new Error(data.error ?? `Create project failed (${res.status})`);
  }
  return await pollIngestJob(data.jobId, onProgress);
}

async function pollIngestJob(
  jobId: string,
  onProgress?: (p: IngestProgressView) => void
): Promise<string> {
  for (;;) {
    const res = await fetch(`/api/projects/ingest/${jobId}`);
    if (!res.ok) {
      throw new Error(`Ingest job lost (${res.status})`);
    }
    const job = (await res.json()) as IngestJobView;
    if (job.progress) {
      onProgress?.(job.progress);
    }
    if (job.status === "done") {
      return job.slug;
    }
    if (job.status === "error") {
      throw new Error(job.error ?? "Ingest failed");
    }
    await new Promise((r) => {
      setTimeout(r, POLL_MS);
    });
  }
}

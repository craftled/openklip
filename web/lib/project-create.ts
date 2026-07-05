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

export interface ProjectCreateOptions {
  /** Re-ingest an existing slug (wipes the project dir). Server: ?force=1. */
  force?: boolean;
}

// A 409 from POST /api/projects: the slug already has a project and
// re-ingesting would wipe it. Callers catch this to offer an explicit
// overwrite confirmation; it must never be retried with force automatically.
export class ProjectExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectExistsError";
  }
}

const POLL_MS = 700;

// The route sends two kinds of 409: code "exists" (project already on disk;
// the caller may offer a destructive replace) and code "in-flight" (an ingest
// for this slug is still running; replacing after it finishes would wipe the
// just-created project, so it must fail plainly). Only "exists" maps to
// ProjectExistsError. An older server without `code` is treated as "exists"
// only when its message says so.
function conflictOffersOverwrite(data: {
  code?: string;
  error?: string;
}): boolean {
  if (data.code !== undefined) {
    return data.code === "exists";
  }
  return /already exists/.test(data.error ?? "");
}

// Upload a video, then poll its ingest job to completion, reporting progress.
// Resolves with the created slug. A 409 (project already exists) throws
// ProjectExistsError so the caller can confirm an overwrite and re-invoke
// with { force: true }.
export async function createProjectFromVideo(
  file: File,
  onProgress?: (p: IngestProgressView) => void,
  options?: ProjectCreateOptions
): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const url = options?.force ? "/api/projects?force=1" : "/api/projects";
  const res = await fetch(url, { method: "POST", body: fd });
  const data = (await res.json()) as {
    code?: string;
    error?: string;
    jobId?: string;
  };
  if (res.status === 409 && conflictOffersOverwrite(data)) {
    throw new ProjectExistsError(
      data.error ?? "A project for this video already exists"
    );
  }
  if (!(res.ok && data.jobId)) {
    throw new Error(data.error ?? `Create project failed (${res.status})`);
  }
  return await pollIngestJob(data.jobId, onProgress);
}

export async function createProjectFromFolder(
  files: File[],
  onProgress?: (p: IngestProgressView) => void,
  options?: ProjectCreateOptions
): Promise<string> {
  const fd = new FormData();
  for (const file of files) {
    fd.append("files", file);
  }
  const url = options?.force
    ? "/api/projects/folder?force=1"
    : "/api/projects/folder";
  const res = await fetch(url, { method: "POST", body: fd });
  const data = (await res.json()) as {
    code?: string;
    error?: string;
    jobId?: string;
  };
  if (res.status === 409 && conflictOffersOverwrite(data)) {
    throw new ProjectExistsError(
      data.error ?? "A project for this video already exists"
    );
  }
  if (!(res.ok && data.jobId)) {
    throw new Error(data.error ?? `Folder import failed (${res.status})`);
  }
  return await pollIngestJob(data.jobId, onProgress);
}

export async function createProjectFromUrl(
  videoUrl: string,
  onProgress?: (p: IngestProgressView) => void,
  options?: ProjectCreateOptions
): Promise<string> {
  const endpoint = options?.force
    ? "/api/projects/url?force=1"
    : "/api/projects/url";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: videoUrl }),
  });
  const data = (await res.json()) as {
    code?: string;
    error?: string;
    jobId?: string;
  };
  if (res.status === 409 && conflictOffersOverwrite(data)) {
    throw new ProjectExistsError(
      data.error ?? "A project for this URL already exists"
    );
  }
  if (res.status === 503) {
    throw new Error(data.error ?? "URL import unavailable (install yt-dlp)");
  }
  if (!(res.ok && data.jobId)) {
    throw new Error(data.error ?? `URL import failed (${res.status})`);
  }
  return await pollIngestJob(data.jobId, onProgress);
}

export async function createBlankProject(input?: {
  slug?: string;
  durationSec?: number;
  aspect?: "16:9" | "9:16" | "1:1";
  fps?: number;
  color?: string;
  force?: boolean;
}): Promise<string> {
  const res = await fetch("/api/projects/blank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  const data = (await res.json()) as { error?: string; slug?: string };
  if (!(res.ok && data.slug)) {
    throw new Error(data.error ?? `Blank project failed (${res.status})`);
  }
  return data.slug;
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

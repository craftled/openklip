import type { ProjectListing } from "@/lib/project-list";

export async function deleteProjectApi(
  slug: string
): Promise<{ projects: ProjectListing[] }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
  const data = (await res.json()) as {
    projects?: ProjectListing[];
    error?: string;
  };
  if (!(res.ok && data.projects)) {
    throw new Error(data.error ?? `Delete failed (${res.status})`);
  }
  return { projects: data.projects };
}

/** Whether a project's proxy is missing (compacted) and needs a rebuild
 * before it can play; see app/api/projects/[slug]/compact/route.ts GET. */
export async function getProjectCompactStatusApi(
  slug: string
): Promise<{ compacted: boolean }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/compact`);
  const data = (await res.json()) as { compacted?: boolean; error?: string };
  if (!(res.ok && typeof data.compacted === "boolean")) {
    throw new Error(data.error ?? `Status check failed (${res.status})`);
  }
  return { compacted: data.compacted };
}

/** Delete a project's regenerable derived media (proxy, frames, transcript,
 * moment index, output) to reclaim disk. The source video and the edit
 * (project.json) are untouched; call rebuildProjectApi to restore playback. */
export async function compactProjectApi(
  slug: string
): Promise<{ bytesFreed: number }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/compact`, {
    method: "POST",
  });
  const data = (await res.json()) as {
    bytesFreed?: number;
    error?: string;
    ok?: boolean;
  };
  if (!(res.ok && data.ok)) {
    throw new Error(data.error ?? `Compact failed (${res.status})`);
  }
  return { bytesFreed: data.bytesFreed ?? 0 };
}

/** Start a background job that rehydrates a compacted project's derived
 * media from its source video. The caller polls
 * /api/projects/ingest/[jobId] for progress (same route ingest jobs use). */
export async function rebuildProjectApi(
  slug: string
): Promise<{ jobId: string }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/rebuild`, {
    method: "POST",
  });
  const data = (await res.json()) as { error?: string; jobId?: string };
  if (!(res.ok && data.jobId)) {
    throw new Error(data.error ?? `Rebuild failed (${res.status})`);
  }
  return { jobId: data.jobId };
}

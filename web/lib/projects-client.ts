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

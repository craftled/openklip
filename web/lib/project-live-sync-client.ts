import type { Project } from "@engine/edl";

export async function fetchProjectRevision(slug: string): Promise<number> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(slug)}/revision`,
    { cache: "no-store" }
  );
  const data = (await res.json()) as { revision?: number; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Revision poll failed (${res.status})`);
  }
  if (typeof data.revision !== "number") {
    throw new Error("Revision poll returned no revision");
  }
  return data.revision;
}

export async function fetchProjectState(
  slug: string
): Promise<{ project: Project; revision: number }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  const data = (await res.json()) as {
    project?: Project;
    revision?: number;
    error?: string;
  };
  if (!(res.ok && data.project)) {
    throw new Error(data.error ?? `Project load failed (${res.status})`);
  }
  return {
    project: data.project,
    revision:
      typeof data.revision === "number"
        ? data.revision
        : (data.project.revision ?? 0),
  };
}

import type { ProjectListing } from "@/lib/project-list";

export interface WorkspaceInfo {
  configured: boolean;
  displayRoot: string;
  pickerSupported: boolean;
  root: string;
}

export async function fetchWorkspace(): Promise<WorkspaceInfo> {
  const res = await fetch("/api/workspace");
  const data = (await res.json()) as Partial<WorkspaceInfo> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `Workspace request failed (${res.status})`);
  }
  return {
    configured: data.configured ?? false,
    displayRoot: data.displayRoot ?? data.root ?? "",
    pickerSupported: data.pickerSupported ?? false,
    root: data.root ?? "",
  };
}

export async function pickWorkspaceFolder(): Promise<{
  cancelled: boolean;
  projects: ProjectListing[];
  root: string;
  displayRoot: string;
}> {
  const res = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pick" }),
  });
  const data = (await res.json()) as {
    cancelled?: boolean;
    displayRoot?: string;
    error?: string;
    projects?: ProjectListing[];
    root?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `Choose folder failed (${res.status})`);
  }
  const root = data.root ?? "";
  return {
    cancelled: data.cancelled ?? false,
    projects: data.projects ?? [],
    root,
    displayRoot: data.displayRoot ?? root,
  };
}

export async function setWorkspacePath(path: string): Promise<{
  projects: ProjectListing[];
  root: string;
  displayRoot: string;
}> {
  const res = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "set", path }),
  });
  const data = (await res.json()) as {
    displayRoot?: string;
    error?: string;
    projects?: ProjectListing[];
    root?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `Set workspace path failed (${res.status})`);
  }
  const root = data.root ?? "";
  return {
    projects: data.projects ?? [],
    root,
    displayRoot: data.displayRoot ?? root,
  };
}

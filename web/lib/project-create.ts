export async function createProjectFromVideo(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/projects", { method: "POST", body: fd });
  const data = (await res.json()) as { error?: string; slug?: string };
  if (!(res.ok && data.slug)) {
    throw new Error(data.error ?? `Create project failed (${res.status})`);
  }
  return data.slug;
}

export type RevealTarget = "assets" | "project";

export async function revealProjectFolderApi(
  slug: string,
  target: RevealTarget = "project"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
  const data = (await res.json()) as { error?: string; ok?: boolean };
  if (!res.ok) {
    return { ok: false, error: data.error ?? `Reveal failed (${res.status})` };
  }
  return { ok: true };
}

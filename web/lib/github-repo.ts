const OPENKLIP_REPO = "craftled/openklip";

export function openklipGitHubUrl(path = ""): string {
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `https://github.com/${OPENKLIP_REPO}${suffix}`;
}

export async function fetchGitHubStars(): Promise<number> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${OPENKLIP_REPO}`,
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 3600 },
      }
    );
    if (!response.ok) {
      return 0;
    }
    const payload = (await response.json()) as { stargazers_count?: number };
    return payload.stargazers_count ?? 0;
  } catch {
    return 0;
  }
}

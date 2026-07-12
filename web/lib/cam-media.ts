export function camProxyUrl(slug: string, camId: string): string {
  return `/api/projects/${encodeURIComponent(slug)}/cams/${encodeURIComponent(camId)}/proxy`;
}

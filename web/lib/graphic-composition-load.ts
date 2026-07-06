export interface GraphicComposition {
  fps: number;
  height: number;
  html: string;
  width: number;
}

const compCache = new Map<string, Promise<GraphicComposition | null>>();

export function loadGraphicComposition(
  template: string,
  slug: string
): Promise<GraphicComposition | null> {
  const cacheKey = `${slug}:${template}`;
  const cached = compCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const promise = fetch(
    `/media/graphic/${encodeURIComponent(template)}?slug=${encodeURIComponent(slug)}`
  )
    .then(async (res) => {
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as {
        html?: string;
        manifest?: { width: number; height: number; fps?: number };
      };
      if (!(data.html && data.manifest)) {
        return null;
      }
      return {
        html: data.html,
        width: data.manifest.width,
        height: data.manifest.height,
        fps: data.manifest.fps ?? 30,
      };
    })
    .catch(() => null);
  compCache.set(cacheKey, promise);
  return promise;
}

import { toProcessedHeatmap } from "@paper-design/shaders";

type GraphicParams = Record<string, string | number | boolean>;

const imageCache = new Map<string, HTMLImageElement>();
const imageLoading = new Map<string, Promise<HTMLImageElement>>();

function cacheKey(src: string, heatmap: boolean): string {
  return heatmap ? `heatmap:${src}` : src;
}

function loadImageUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => {
      reject(new Error(`failed to load graphic image: ${url}`));
    });
    image.src = url;
  });
}

export function getCachedGraphicImage(
  src: string,
  shaderId?: string | null
): HTMLImageElement | undefined {
  return imageCache.get(cacheKey(src, shaderId === "heatmap"));
}

export async function loadGraphicImage(
  src: string,
  opts?: { heatmap?: boolean }
): Promise<HTMLImageElement> {
  const key = cacheKey(src, opts?.heatmap === true);
  const cached = imageCache.get(key);
  if (cached) {
    return cached;
  }
  const pending = imageLoading.get(key);
  if (pending) {
    return pending;
  }
  const promise = (async () => {
    let url = src;
    if (opts?.heatmap) {
      const { blob } = await toProcessedHeatmap(src);
      url = URL.createObjectURL(blob);
    }
    const image = await loadImageUrl(url);
    imageCache.set(key, image);
    imageLoading.delete(key);
    return image;
  })();
  imageLoading.set(key, promise);
  return promise;
}

export async function ensureGraphicImagesReady(
  params: GraphicParams,
  shaderId?: string | null
): Promise<void> {
  const src = params._imageSrc;
  if (typeof src !== "string" || src.length === 0) {
    return;
  }
  await loadGraphicImage(src, { heatmap: shaderId === "heatmap" });
}

export function imageAspectFromCached(
  params: GraphicParams,
  shaderId?: string | null
): number {
  const src = params._imageSrc;
  if (typeof src !== "string" || src.length === 0) {
    return 1;
  }
  const image = getCachedGraphicImage(src, shaderId);
  if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return image.naturalWidth / image.naturalHeight;
  }
  const fallback = params._imageAspectRatio;
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }
  return 1;
}

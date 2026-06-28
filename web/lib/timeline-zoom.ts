// Pixel-based timeline zoom (OpenCut-style px/sec scaling for scroll + precise drag).

export const BASE_TIMELINE_PX_PER_SEC = 72;
export const MIN_TIMELINE_ZOOM = 0.25;
export const MAX_TIMELINE_ZOOM = 4;
export const TIMELINE_ZOOM_STEP = 0.25;

export function clampTimelineZoom(zoom: number): number {
  return Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, zoom));
}

export function secToPx(sec: number, zoom: number): number {
  return sec * BASE_TIMELINE_PX_PER_SEC * zoom;
}

export function pxToSec(px: number, zoom: number): number {
  const scale = BASE_TIMELINE_PX_PER_SEC * zoom;
  return scale > 0 ? px / scale : 0;
}

export function timelineContentWidthPx(
  durationSec: number,
  zoom: number
): number {
  return Math.max(1, Math.ceil(secToPx(durationSec, zoom)));
}

export function clipLeftPx(startSec: number, zoom: number): number {
  return secToPx(startSec, zoom);
}

export function clipWidthPx(
  startSec: number,
  endSec: number,
  zoom: number
): number {
  return Math.max(4, secToPx(Math.max(0, endSec - startSec), zoom));
}

export function pointerXToSec({
  clientX,
  rect,
  scrollLeft,
  zoom,
}: {
  clientX: number;
  rect: DOMRect;
  scrollLeft: number;
  zoom: number;
}): number {
  const x = clientX - rect.left + scrollLeft;
  return Math.max(0, pxToSec(x, zoom));
}

export function sampleToPx({
  sample,
  durationSamples,
  zoom,
  sampleRate,
}: {
  sample: number;
  durationSamples: number;
  sampleRate: number;
  zoom: number;
}): number {
  if (durationSamples <= 0) {
    return 0;
  }
  const durationSec = durationSamples / sampleRate;
  const sec = (sample / durationSamples) * durationSec;
  return secToPx(sec, zoom);
}

export function pointerXToSample({
  clientX,
  rect,
  scrollLeft,
  durationSamples,
  zoom,
  sampleRate,
}: {
  clientX: number;
  rect: DOMRect;
  scrollLeft: number;
  durationSamples: number;
  zoom: number;
  sampleRate: number;
}): number {
  const durationSec = durationSamples / sampleRate;
  const sec = Math.min(
    durationSec,
    pointerXToSec({ clientX, rect, scrollLeft, zoom })
  );
  return Math.round(sec * sampleRate);
}

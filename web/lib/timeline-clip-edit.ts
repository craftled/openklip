// Pure timeline clip timing math (drag move + edge resize). Unit-tested without DOM.

export const MIN_CLIP_SPAN_SEC = 0.1;

export function minClipSpanSamples(sampleRate: number): number {
  return Math.max(1, Math.round(MIN_CLIP_SPAN_SEC * sampleRate));
}

export function pointerRatio(clientX: number, rect: DOMRect): number {
  if (rect.width <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

export function pointerXToSample(
  clientX: number,
  rect: DOMRect,
  durationSamples: number
): number {
  return Math.round(pointerRatio(clientX, rect) * durationSamples);
}

export function moveClipSpan(
  startSample: number,
  endSample: number,
  deltaSamples: number,
  durationSamples: number,
  minSpanSamples: number
): { startSample: number; endSample: number } {
  const span = Math.max(minSpanSamples, endSample - startSample);
  let start = startSample + deltaSamples;
  let end = start + span;
  if (start < 0) {
    start = 0;
    end = span;
  }
  if (end > durationSamples) {
    end = durationSamples;
    start = Math.max(0, end - span);
  }
  return { startSample: Math.round(start), endSample: Math.round(end) };
}

export function resizeClipSpan(
  startSample: number,
  endSample: number,
  edge: "start" | "end",
  newSample: number,
  durationSamples: number,
  minSpanSamples: number
): { startSample: number; endSample: number } {
  const minSpan = Math.max(1, minSpanSamples);
  let start = startSample;
  let end = endSample;
  if (edge === "start") {
    start = Math.max(0, Math.min(newSample, endSample - minSpan));
  } else {
    end = Math.min(durationSamples, Math.max(newSample, startSample + minSpan));
  }
  return { startSample: Math.round(start), endSample: Math.round(end) };
}

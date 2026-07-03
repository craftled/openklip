import type { Keyframe } from "@engine/keyframes";

export const KEYFRAME_PROPERTIES: Keyframe["property"][] = [
  "opacity",
  "scale",
  "x",
  "y",
];

export const KEYFRAME_EASINGS: Keyframe["easing"][] = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
];

export function keyframePositionFraction(
  sampleOffset: number,
  clipLengthSamples: number
): number {
  if (clipLengthSamples <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, sampleOffset / clipLengthSamples));
}

export function playheadOffsetInClip(
  curSample: number,
  startSample: number,
  endSample: number
): number | null {
  if (curSample < startSample || curSample >= endSample) {
    return null;
  }
  return curSample - startSample;
}

export function clampKeyframeSampleOffset(
  sampleOffset: number,
  clipLengthSamples: number
): number {
  return Math.max(0, Math.min(clipLengthSamples, Math.round(sampleOffset)));
}

export function defaultKeyframeValue(property: Keyframe["property"]): number {
  switch (property) {
    case "opacity":
      return 1;
    case "scale":
      return 1;
    case "x":
    case "y":
      return 0;
    default:
      return 0;
  }
}

export function keyframeValueBounds(property: Keyframe["property"]): {
  max: number;
  min: number;
  step: number;
} {
  switch (property) {
    case "opacity":
      return { min: 0, max: 1, step: 0.01 };
    case "scale":
      return { min: 0.25, max: 3, step: 0.05 };
    case "x":
    case "y":
      return { min: -1, max: 1, step: 0.01 };
    default:
      return { min: 0, max: 1, step: 0.01 };
  }
}

export function formatKeyframeProperty(property: Keyframe["property"]): string {
  switch (property) {
    case "opacity":
      return "Opacity";
    case "scale":
      return "Scale";
    case "x":
      return "X offset";
    case "y":
      return "Y offset";
    default:
      return property;
  }
}

export function updateKeyframeAt(
  keyframes: Keyframe[],
  index: number,
  patch: Partial<Keyframe>
): Keyframe[] {
  return keyframes.map((kf, i) => (i === index ? { ...kf, ...patch } : kf));
}

export function removeKeyframeAt(
  keyframes: Keyframe[],
  index: number
): Keyframe[] {
  return keyframes.filter((_, i) => i !== index);
}

export function addKeyframe(
  keyframes: Keyframe[],
  keyframe: Keyframe
): Keyframe[] {
  return [...keyframes, keyframe].sort(
    (a, b) => a.sampleOffset - b.sampleOffset
  );
}

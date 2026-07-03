import { z } from "zod";

export const KeyframeSchema = z.object({
  sampleOffset: z.number().int().min(0), // samples relative to overlay startSample (48kHz grid)
  property: z.enum(["opacity", "scale", "x", "y"]),
  value: z.number(), // opacity 0-1, scale multiplier, x/y = canvas-fraction offset (-1..1)
  easing: z
    .enum(["linear", "easeIn", "easeOut", "easeInOut"])
    .default("linear"),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;
export type KeyframeProps = Partial<
  Record<"opacity" | "scale" | "x" | "y", number>
>;

const KEYFRAME_PROPERTIES = ["opacity", "scale", "x", "y"] as const;

function clamp01(t: number): number {
  if (t < 0) {
    return 0;
  }
  if (t > 1) {
    return 1;
  }
  return t;
}

function applyEasing(t: number, easing: Keyframe["easing"]): number {
  const u = clamp01(t);
  switch (easing) {
    case "easeIn":
      return u * u * u;
    case "easeOut":
      return 1 - (1 - u) ** 3;
    case "easeInOut":
      if (u < 0.5) {
        return 4 * u * u * u;
      }
      return 1 - (-2 * u + 2) ** 3 / 2;
    default:
      return u;
  }
}

function interpolateProperty(sorted: Keyframe[], sampleOffset: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const first = sorted[0];
  if (sampleOffset <= first.sampleOffset) {
    return first.value;
  }
  const last = sorted.at(-1);
  if (!last || sampleOffset >= last.sampleOffset) {
    return last?.value ?? first.value;
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (sampleOffset >= a.sampleOffset && sampleOffset < b.sampleOffset) {
      const span = b.sampleOffset - a.sampleOffset;
      const t = span > 0 ? (sampleOffset - a.sampleOffset) / span : 0;
      const eased = applyEasing(t, b.easing);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return last.value;
}

export function evaluateKeyframes(
  keyframes: Keyframe[],
  sampleOffset: number
): KeyframeProps {
  const byProperty = new Map<Keyframe["property"], Keyframe[]>();
  for (const kf of keyframes) {
    const list = byProperty.get(kf.property) ?? [];
    list.push(kf);
    byProperty.set(kf.property, list);
  }

  const result: KeyframeProps = {};
  for (const property of KEYFRAME_PROPERTIES) {
    const list = byProperty.get(property);
    if (!list?.length) {
      continue;
    }
    list.sort((a, b) => a.sampleOffset - b.sampleOffset);
    result[property] = interpolateProperty(list, sampleOffset);
  }
  return result;
}

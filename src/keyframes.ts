import { z } from "zod";

export const KeyframeSchema = z.object({
  sampleOffset: z.number().int().min(0),
  property: z.enum(["opacity", "scale", "x", "y"]),
  value: z.number(),
  easing: z
    .enum(["linear", "easeIn", "easeOut", "easeInOut"])
    .default("linear"),
});

export type Keyframe = z.infer<typeof KeyframeSchema>;
export type KeyframeProps = Partial<
  Record<"opacity" | "scale" | "x" | "y", number>
>;

function applyEasing(easing: Keyframe["easing"], rawProgress: number): number {
  const t = Math.max(0, Math.min(1, rawProgress));
  switch (easing) {
    case "easeIn":
      return t ** 3;
    case "easeOut":
      return 1 - (1 - t) ** 3;
    case "easeInOut":
      return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    default:
      return t;
  }
}

function evaluateProperty(keyframes: Keyframe[], sampleOffset: number): number {
  const sorted = [...keyframes].sort(
    (left, right) => left.sampleOffset - right.sampleOffset
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (sampleOffset <= first.sampleOffset) {
    return first.value;
  }
  if (sampleOffset >= last.sampleOffset) {
    return last.value;
  }
  for (let index = 1; index < sorted.length; index++) {
    const prev = sorted[index - 1];
    const next = sorted[index];
    if (sampleOffset > next.sampleOffset) {
      continue;
    }
    if (next.sampleOffset === prev.sampleOffset) {
      return next.value;
    }
    const t =
      (sampleOffset - prev.sampleOffset) /
      (next.sampleOffset - prev.sampleOffset);
    const eased = applyEasing(next.easing, t);
    return prev.value + (next.value - prev.value) * eased;
  }
  return last.value;
}

export function evaluateKeyframes(
  keyframes: Keyframe[],
  sampleOffset: number
): KeyframeProps {
  const perProperty: Record<string, Keyframe[]> = {};
  for (const keyframe of keyframes) {
    const list = perProperty[keyframe.property] ?? [];
    list.push(keyframe);
    perProperty[keyframe.property] = list;
  }
  const props: KeyframeProps = {};
  for (const property of Object.keys(perProperty) as Array<
    keyof KeyframeProps
  >) {
    props[property] = evaluateProperty(perProperty[property], sampleOffset);
  }
  return props;
}

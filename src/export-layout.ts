import { z } from "zod";

export const ExportLayoutSchema = z.enum(["fill", "split-vertical"]);
export type ExportLayout = z.infer<typeof ExportLayoutSchema>;

function clampSplitRatio(value: number): number {
  return Math.min(0.75, Math.max(0.25, value));
}

export const SplitVerticalSchema = z
  .object({
    /** Speaker pane height as a fraction of output height (0.25-0.75). */
    ratio: z.number().default(0.45),
    speakerPosition: z.enum(["top", "bottom"]).default("top"),
  })
  .transform((value) => ({
    ratio: clampSplitRatio(value.ratio),
    speakerPosition: value.speakerPosition,
  }));
export type SplitVertical = z.infer<typeof SplitVerticalSchema>;

export function normalizeSplitVertical(
  value: Partial<SplitVertical> | undefined
): SplitVertical {
  return SplitVerticalSchema.parse(value ?? {});
}

/** ffmpeg filter fragment: split reframed frame into stacked panes. */
export function buildVerticalSplitFilter(input: {
  inputLabel: string;
  outputLabel: string;
  outW: number;
  outH: number;
  ratio: number;
  speakerPosition: SplitVertical["speakerPosition"];
}): string {
  const speakerH = Math.max(2, Math.round((input.outH * input.ratio) / 2) * 2);
  const contentH = input.outH - speakerH;
  const { outW, inputLabel, outputLabel } = input;

  if (input.speakerPosition === "top") {
    return [
      `[${inputLabel}]crop=${outW}:${speakerH}:0:0,scale=${outW}:${speakerH}[vsp]`,
      `[${inputLabel}]crop=${outW}:${contentH}:0:${speakerH},scale=${outW}:${contentH}[vct]`,
      `[vsp][vct]vstack=inputs=2:shortest=0[${outputLabel}]`,
    ].join(";");
  }

  return [
    `[${inputLabel}]crop=${outW}:${contentH}:0:0,scale=${outW}:${contentH}[vct]`,
    `[${inputLabel}]crop=${outW}:${speakerH}:0:${contentH},scale=${outW}:${speakerH}[vsp]`,
    `[vct][vsp]vstack=inputs=2:shortest=0[${outputLabel}]`,
  ].join(";");
}

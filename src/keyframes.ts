import { z } from "zod";
export const KeyframeSchema = z.object({
  sampleOffset: z.number().int().min(0), // samples relative to overlay startSample (48kHz grid)
  property: z.enum(["opacity", "scale", "x", "y"]),
  value: z.number(), // opacity 0-1, scale multiplier, x/y canvas-fraction offset (-1..1)
  easing: z
    .enum(["linear", "easeIn", "easeOut", "easeInOut"])
    .default("linear"),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

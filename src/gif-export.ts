// Browser-safe GIF export caps and dimension clamping. Kept separate from
// src/exporter.ts so client components (export dialog) can use these without
// pulling puppeteer/ffmpeg/node-only export code into the Next.js bundle.

// GIF export caps (TODO.md known limitation: "no size or duration cap"). A
// GIF's file size and encode time scale primarily with frame count (fps x
// duration) and pixel count (width x height), so both are bounded here. The
// mp4 pipeline is completely untouched by these constants; they apply ONLY to
// the GIF-specific second pass.
export const GIF_MAX_WIDTH_PX = 960;
export const GIF_MAX_FPS = 15;
export const GIF_MAX_WIDTH_OVERRIDE_CEILING_PX = 1920;
export const GIF_MAX_DURATION_SEC = 300;

/**
 * Clamp GIF-specific output width/fps down to the ceilings above. Passes
 * values through unchanged when already at or under the cap. When width is
 * capped, height is derived with the same round-to-nearest-even convention
 * resolveExportDimensions (export-aspect.ts) already uses elsewhere in the
 * exporter, so the GIF keeps the export's aspect ratio.
 */
export function clampGifDimensions(input: {
  fps: number;
  height: number;
  maxWidth?: number;
  width: number;
}): { fps: number; height: number; width: number } {
  const fps = Math.min(input.fps, GIF_MAX_FPS);
  const maxWidth = Math.min(
    Math.max(input.maxWidth ?? GIF_MAX_WIDTH_PX, 1),
    GIF_MAX_WIDTH_OVERRIDE_CEILING_PX
  );
  if (input.width <= maxWidth) {
    return { fps, height: input.height, width: input.width };
  }
  const width = maxWidth;
  const height = Math.max(
    2,
    Math.round((input.height * width) / input.width / 2) * 2
  );
  return { fps, height, width };
}

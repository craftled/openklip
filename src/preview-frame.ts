// Single-frame grade preview: the live heart of the deck's "control room". The
// GUI points an <img> at the preview-frame route, and dragging a slider
// re-renders ONE frame (cheap ffmpeg) instead of a full export. The filter chain
// is the exact LUT -> grade -> color order the exporter uses, so what the slider
// shows is what the render produces. Pure chain builder is unit tested; the
// spawn is exercised end to end.
import { existsSync } from "node:fs";
import type { ColorAdjust, Grade, Project } from "./edl.ts";
import { FFMPEG, run } from "./ffmpeg.ts";
import { gradeFilter } from "./grade.ts";
import { colorAdjustFilter } from "./grade-color.ts";
import { lut3dExpr, lutPath } from "./lut.ts";
import { projectPaths } from "./paths.ts";

export interface PreviewLook {
  color?: ColorAdjust | null;
  grade?: Grade;
  lut?: string | null;
}

// The still-frame filter chain: technical LUT first, then the base grade, then
// the continuous color adjust : same order as the export filtergraph so the
// preview matches the rendered output. Returns "" for a bare (ungraded) frame.
export function previewFilterChain(look: PreviewLook): string {
  const parts: string[] = [];
  if (look.lut) {
    // A malformed or missing LUT name should degrade to "no LUT", not throw :
    // the preview is best-effort and an agent may pass junk.
    try {
      const lutAbs = lutPath(look.lut);
      if (existsSync(lutAbs)) {
        parts.push(lut3dExpr(lutAbs));
      }
    } catch {
      // skip unknown LUT
    }
  }
  const grade = gradeFilter(look.grade ?? "none");
  if (grade) {
    parts.push(grade);
  }
  const color = colorAdjustFilter(look.color);
  if (color) {
    parts.push(color);
  }
  return parts.join(",");
}

// Render one graded frame from the project proxy at `atSec` to `outPath` (jpeg).
// Clamps the seek inside the clip. Returns the output path.
export async function renderPreviewFrame(opts: {
  project: Project;
  slug: string;
  atSec: number;
  look: PreviewLook;
  outPath: string;
}): Promise<string> {
  const { project, slug, atSec, look, outPath } = opts;
  const paths = projectPaths(slug);
  const source = existsSync(paths.proxy) ? paths.proxy : project.proxy;
  const durSec = project.durationSamples / project.sampleRate;
  const t = Math.max(0, Math.min(atSec, Math.max(0, durSec - 0.05)));
  const chain = previewFilterChain(look);
  const args = ["-y", "-ss", t.toFixed(3), "-i", source, "-frames:v", "1"];
  if (chain) {
    args.push("-vf", chain);
  }
  args.push("-q:v", "3", outPath);
  await run(FFMPEG, args, "ffmpeg(preview-frame)");
  return outPath;
}

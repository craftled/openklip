import { ProjectSchema, sec, survivingRanges, totalDurationSec } from "./edl.ts";
import { FFMPEG, run } from "./ffmpeg.ts";
import { projectPaths } from "./paths.ts";

// Re-encode (not stream-copy) the surviving ranges from the ORIGINAL source on
// the same sample grid the preview uses, so export matches what you scrubbed.
export async function exportCut(slug: string): Promise<{ out: string; durationSec: number; ranges: number }> {
  const p = projectPaths(slug);
  const project = ProjectSchema.parse(JSON.parse(await Bun.file(p.project).text()));
  const ranges = survivingRanges(project);
  if (ranges.length === 0) throw new Error("nothing to export (all words deleted)");

  const selectExpr = ranges.map((r) => `between(t,${sec(r.startSec)},${sec(r.endSec)})`).join("+");
  await run(
    FFMPEG,
    [
      "-y", "-i", project.source,
      "-vf", `select='${selectExpr}',setpts=N/FRAME_RATE/TB`,
      "-af", `aselect='${selectExpr}',asetpts=N/SR/TB`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      p.out,
    ],
    "ffmpeg(export)",
  );
  return { out: p.out, durationSec: totalDurationSec(ranges), ranges: ranges.length };
}

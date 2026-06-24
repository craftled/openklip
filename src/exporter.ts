import { buildAss, type CaptionWord, groupCaptions } from "./captions.ts";
import { type Project, ProjectSchema, type Range, sec, survivingRanges, totalDurationSec } from "./edl.ts";
import { FFMPEG, run } from "./ffmpeg.ts";
import { projectPaths } from "./paths.ts";

// Map each kept word from source time into the cut (output) timeline, so burned
// captions land where the word actually plays after deleted spans are removed.
function keptWordsInOutputTime(project: Project, ranges: Range[]): CaptionWord[] {
  const sr = project.sampleRate;
  const out: CaptionWord[] = [];
  for (const w of project.words) {
    if (w.deleted) continue;
    const ws = w.startSample / sr;
    const we = w.endSample / sr;
    let cum = 0;
    for (const r of ranges) {
      if (ws >= r.startSec - 1e-6 && ws <= r.endSec + 1e-6) {
        const s = cum + Math.max(0, ws - r.startSec);
        const e = cum + Math.max(0, Math.min(we, r.endSec) - r.startSec);
        out.push({ text: w.text, startSec: s, endSec: Math.max(e, s + 0.05) });
        break;
      }
      cum += r.endSec - r.startSec;
    }
  }
  return out;
}

function escapeAssPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function exportCut(slug: string): Promise<{ out: string; durationSec: number; ranges: number; captions: boolean }> {
  const p = projectPaths(slug);
  const project = ProjectSchema.parse(JSON.parse(await Bun.file(p.project).text()));
  const ranges = survivingRanges(project);
  if (ranges.length === 0) throw new Error("nothing to export (all words deleted)");

  const selectExpr = ranges.map((r) => `between(t,${sec(r.startSec)},${sec(r.endSec)})`).join("+");
  const vf = [`select='${selectExpr}'`, "setpts=N/FRAME_RATE/TB"];

  const captionsOn = project.captions?.enabled !== false;
  if (captionsOn) {
    const groups = groupCaptions(keptWordsInOutputTime(project, ranges), project.captions?.maxWords ?? 6);
    if (groups.length > 0) {
      const assPath = `${p.dir}/captions.ass`;
      await Bun.write(assPath, buildAss(groups, { width: project.width, height: project.height }));
      vf.push(`subtitles='${escapeAssPath(assPath)}'`);
    }
  }

  await run(
    FFMPEG,
    [
      "-y", "-i", project.source,
      "-vf", vf.join(","),
      "-af", `aselect='${selectExpr}',asetpts=N/SR/TB`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      p.out,
    ],
    "ffmpeg(export)",
  );
  return { out: p.out, durationSec: totalDurationSec(ranges), ranges: ranges.length, captions: captionsOn };
}

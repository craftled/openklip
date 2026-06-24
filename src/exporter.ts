import { buildAss, type CaptionWord, groupCaptions } from "./captions.ts";
import {
  type Broll,
  type Project,
  ProjectSchema,
  type Range,
  sec,
  sourceToOutputSec,
  survivingRanges,
  totalDurationSec,
} from "./edl.ts";
import { FFMPEG, run } from "./ffmpeg.ts";
import { projectPaths } from "./paths.ts";

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

interface BrollPlan {
  broll: Broll;
  inputIndex: number;
  srcPath: string;
  outStart: number;
  outEnd: number;
}

export async function exportCut(slug: string): Promise<{ out: string; durationSec: number; ranges: number; captions: boolean; broll: number }> {
  const p = projectPaths(slug);
  const project = ProjectSchema.parse(JSON.parse(await Bun.file(p.project).text()));
  const ranges = survivingRanges(project);
  if (ranges.length === 0) throw new Error("nothing to export (all words deleted)");
  const sr = project.sampleRate;
  const { width: W, height: H } = project;

  const selectExpr = ranges.map((r) => `between(t,${sec(r.startSec)},${sec(r.endSec)})`).join("+");

  // Resolve b-roll items to source files + output-time windows; drop any that fall in a cut.
  const assetById = new Map(project.assets.map((a) => [a.id, a]));
  const plans: BrollPlan[] = [];
  for (const b of project.broll ?? []) {
    const asset = assetById.get(b.assetId);
    if (!asset) continue;
    const outStart = sourceToOutputSec(b.startSample / sr, ranges);
    const outEnd = sourceToOutputSec(b.endSample / sr, ranges);
    if (outEnd - outStart < 0.05) continue;
    plans.push({ broll: b, inputIndex: plans.length + 1, srcPath: asset.src, outStart, outEnd });
  }

  // Captions (burned after the overlays so timing matches the output stream).
  let assPath: string | null = null;
  const captionsOn = project.captions?.enabled !== false;
  if (captionsOn) {
    const groups = groupCaptions(keptWordsInOutputTime(project, ranges), project.captions?.maxWords ?? 6);
    if (groups.length > 0) {
      assPath = `${p.dir}/captions.ass`;
      await Bun.write(assPath, buildAss(groups, { width: W, height: H }));
    }
  }

  // Build the filtergraph.
  const parts: string[] = [`[0:v]select='${selectExpr}',setpts=N/FRAME_RATE/TB[base]`];
  let last = "base";
  for (const pl of plans) {
    const srcIn = pl.broll.srcInSample / sr;
    const dur = pl.outEnd - pl.outStart;
    parts.push(
      `[${pl.inputIndex}:v]trim=start=${sec(srcIn)}:duration=${sec(dur)},setpts=PTS-STARTPTS+${sec(pl.outStart)}/TB,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[bv${pl.inputIndex}]`,
    );
    const next = `ov${pl.inputIndex}`;
    parts.push(
      `[${last}][bv${pl.inputIndex}]overlay=eof_action=pass:enable='between(t,${sec(pl.outStart)},${sec(pl.outEnd)})'[${next}]`,
    );
    last = next;
  }
  if (assPath) parts.push(`[${last}]subtitles='${escapeAssPath(assPath)}'[vout]`);
  else parts.push(`[${last}]null[vout]`);
  parts.push(`[0:a]aselect='${selectExpr}',asetpts=N/SR/TB[aout]`);

  const inputs = ["-i", project.source, ...plans.flatMap((pl) => ["-i", pl.srcPath])];
  await run(
    FFMPEG,
    [
      "-y",
      ...inputs,
      "-filter_complex", parts.join(";"),
      "-map", "[vout]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      p.out,
    ],
    "ffmpeg(export)",
  );

  return {
    out: p.out,
    durationSec: totalDurationSec(ranges),
    ranges: ranges.length,
    captions: captionsOn && assPath !== null,
    broll: plans.length,
  };
}

import { buildAss, type CaptionWord, groupCaptions } from "./captions.ts";
import {
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
import { buildTitlesAss, type TitleItem } from "./titles.ts";
import { buildZoompanZExpr, type ZoomWindow } from "./zoom-ramp.ts";

export interface ExportOptions {
  maxHeight?: number; // e.g. 1080 -> downscale output (and speed up filtering/encode)
}

function keptWordsInOutputTime(
  project: Project,
  ranges: Range[]
): CaptionWord[] {
  const sr = project.sampleRate;
  const out: CaptionWord[] = [];
  for (const w of project.words) {
    if (w.deleted) {
      continue;
    }
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
  inputIndex: number;
  outEnd: number;
  outStart: number;
  srcInSec: number;
  srcPath: string;
}

export async function exportCut(
  slug: string,
  opts: ExportOptions = {}
): Promise<{
  out: string;
  durationSec: number;
  ranges: number;
  captions: boolean;
  broll: number;
  zooms: number;
  titles: number;
  vignette: boolean;
  height: number;
}> {
  const p = projectPaths(slug);
  const project = ProjectSchema.parse(
    JSON.parse(await Bun.file(p.project).text())
  );
  const ranges = survivingRanges(project);
  if (ranges.length === 0) {
    throw new Error("nothing to export (all words deleted)");
  }
  const sr = project.sampleRate;

  // output resolution
  const outH =
    opts.maxHeight && opts.maxHeight < project.height
      ? opts.maxHeight
      : project.height;
  const outW =
    outH === project.height
      ? project.width
      : Math.round((project.width * outH) / project.height / 2) * 2;

  const selectExpr = ranges
    .map((r) => `between(t,${sec(r.startSec)},${sec(r.endSec)})`)
    .join("+");

  // b-roll -> output windows
  const assetById = new Map(project.assets.map((a) => [a.id, a]));
  const plans: BrollPlan[] = [];
  for (const b of project.broll ?? []) {
    const asset = assetById.get(b.assetId);
    if (!asset) {
      continue;
    }
    const outStart = sourceToOutputSec(b.startSample / sr, ranges);
    const outEnd = sourceToOutputSec(b.endSample / sr, ranges);
    if (outEnd - outStart < 0.05) {
      continue;
    }
    plans.push({
      inputIndex: plans.length + 1,
      srcPath: asset.src,
      srcInSec: b.srcInSample / sr,
      outStart,
      outEnd,
    });
  }

  // zooms -> output windows
  const zoomWins = (project.zooms ?? [])
    .map((z) => ({
      os: sourceToOutputSec(z.startSample / sr, ranges),
      oe: sourceToOutputSec(z.endSample / sr, ranges),
      scale: z.scale,
      ramp: Math.max(0.05, z.rampSec),
    }))
    .filter((z) => z.oe - z.os > 0.05);

  // captions
  let assPath: string | null = null;
  const captionsOn = project.captions?.enabled !== false;
  if (captionsOn) {
    const groups = groupCaptions(
      keptWordsInOutputTime(project, ranges),
      project.captions?.maxWords ?? 6
    );
    if (groups.length > 0) {
      assPath = `${p.dir}/captions.ass`;
      await Bun.write(assPath, buildAss(groups, { width: outW, height: outH }));
    }
  }

  // titles -> output time
  let titlesAssPath: string | null = null;
  const titleItems: TitleItem[] = (project.titles ?? [])
    .map((t) => ({
      text: t.text,
      startSec: sourceToOutputSec(t.startSample / sr, ranges),
      endSec: sourceToOutputSec(t.endSample / sr, ranges),
      position: t.position,
    }))
    .filter((t) => t.text.trim().length > 0 && t.endSec - t.startSec > 0.05);
  if (titleItems.length > 0) {
    titlesAssPath = `${p.dir}/titles.ass`;
    await Bun.write(
      titlesAssPath,
      buildTitlesAss(titleItems, { width: outW, height: outH })
    );
  }

  // ---- filtergraph ----
  const parts: string[] = [];
  let base = `[0:v]select='${selectExpr}',setpts=N/FRAME_RATE/TB`;
  if (outH !== project.height) {
    base += `,scale=${outW}:${outH}`;
  }
  parts.push(`${base}[v0]`);
  let last = "v0";

  if (zoomWins.length > 0) {
    // Animated push-in via zoompan (z is evaluated per output frame, so it can ramp).
    const fps = Math.max(1, Math.round(project.fps));
    const wins: ZoomWindow[] = zoomWins.map((z) => ({
      startSec: z.os,
      endSec: z.oe,
      scale: z.scale,
      rampSec: z.ramp,
    }));
    const zexpr = buildZoompanZExpr(wins, fps);
    parts.push(
      `[${last}]zoompan=z='${zexpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${outW}x${outH}:fps=${fps}[vz]`
    );
    last = "vz";
  }

  for (const pl of plans) {
    parts.push(
      `[${pl.inputIndex}:v]trim=start=${sec(pl.srcInSec)}:duration=${sec(pl.outEnd - pl.outStart)},setpts=PTS-STARTPTS+${sec(pl.outStart)}/TB,scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},setsar=1[bv${pl.inputIndex}]`
    );
    parts.push(
      `[${last}][bv${pl.inputIndex}]overlay=eof_action=pass:enable='between(t,${sec(pl.outStart)},${sec(pl.outEnd)})'[ov${pl.inputIndex}]`
    );
    last = `ov${pl.inputIndex}`;
  }

  const vignette = Boolean(project.look?.vignette);
  if (vignette) {
    parts.push(`[${last}]vignette[vig]`);
    last = "vig";
  }

  let vlabel = last;
  if (assPath) {
    parts.push(`[${vlabel}]subtitles='${escapeAssPath(assPath)}'[vcap]`);
    vlabel = "vcap";
  }
  if (titlesAssPath) {
    parts.push(`[${vlabel}]subtitles='${escapeAssPath(titlesAssPath)}'[vtit]`);
    vlabel = "vtit";
  }
  parts.push(`[${vlabel}]null[vout]`);
  parts.push(`[0:a]aselect='${selectExpr}',asetpts=N/SR/TB[aout]`);

  const inputs = [
    "-i",
    project.source,
    ...plans.flatMap((pl) => ["-i", pl.srcPath]),
  ];
  await run(
    FFMPEG,
    [
      "-y",
      ...inputs,
      "-filter_complex",
      parts.join(";"),
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      p.out,
    ],
    "ffmpeg(export)"
  );

  return {
    out: p.out,
    durationSec: totalDurationSec(ranges),
    ranges: ranges.length,
    captions: captionsOn && assPath !== null,
    broll: plans.length,
    zooms: zoomWins.length,
    titles: titleItems.length,
    vignette,
    height: outH,
  };
}

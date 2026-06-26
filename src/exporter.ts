import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  buildAss,
  type CaptionWord,
  captionPlacementForSpan,
  groupCaptions,
  type TitleSpan,
} from "./captions.ts";
import {
  type Asset,
  type Broll,
  type Project,
  ProjectSchema,
  type Range,
  sec,
  sourceToOutputSec,
  survivingRanges,
  totalDurationSec,
} from "./edl.ts";
import { FFMPEG, probe, run } from "./ffmpeg.ts";
import { buildStillZoompan } from "./ken-burns.ts";
import { projectPaths } from "./paths.ts";
import { buildTitlesAss, type TitleItem } from "./titles.ts";
import { buildZoompanZExpr, type ZoomWindow } from "./zoom-ramp.ts";

export interface ExportOptions {
  maxHeight?: number; // e.g. 1080 -> downscale output (and speed up filtering/encode)
}

export interface InputChoice {
  kind: "original" | "proxy";
  path: string;
}

function projectRelativePath(projectDir: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(projectDir, filePath);
}

export function chooseSourceInput(input: {
  dir: string;
  proxy: string;
  source: string;
}): InputChoice {
  if (existsSync(input.source)) {
    return { kind: "original", path: input.source };
  }
  const proxy = projectRelativePath(input.dir, input.proxy);
  if (existsSync(proxy)) {
    return { kind: "proxy", path: proxy };
  }
  throw new Error(
    `missing source video: ${input.source}. Also could not find proxy fallback: ${proxy}`
  );
}

export function chooseAssetInput(
  projectDir: string,
  asset: Asset
): InputChoice {
  if (existsSync(asset.src)) {
    return { kind: "original", path: asset.src };
  }
  const proxy = projectRelativePath(projectDir, asset.proxy);
  if (existsSync(proxy)) {
    return { kind: "proxy", path: proxy };
  }
  throw new Error(
    `missing b-roll asset "${asset.id}": ${asset.src}. Also could not find proxy fallback: ${proxy}`
  );
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

export interface BrollPlan {
  inputIndex: number;
  outEnd: number;
  outStart: number;
  srcInSec: number;
  srcPath: string;
}

export function planBrollForRanges(input: {
  broll: Broll;
  firstInputIndex: number;
  ranges: Range[];
  sampleRate: number;
  srcPath: string;
}): BrollPlan[] {
  const startSec = input.broll.startSample / input.sampleRate;
  const endSec = input.broll.endSample / input.sampleRate;
  const baseSrcInSec = input.broll.srcInSample / input.sampleRate;
  const plans: BrollPlan[] = [];

  for (const range of input.ranges) {
    const segmentStart = Math.max(startSec, range.startSec);
    const segmentEnd = Math.min(endSec, range.endSec);
    if (segmentEnd - segmentStart < 0.05) {
      continue;
    }
    plans.push({
      inputIndex: input.firstInputIndex + plans.length,
      outStart: sourceToOutputSec(segmentStart, input.ranges),
      outEnd: sourceToOutputSec(segmentEnd, input.ranges),
      srcInSec: baseSrcInSec + (segmentStart - startSec),
      srcPath: input.srcPath,
    });
  }

  return plans;
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
  stills: number;
  zooms: number;
  titles: number;
  vignette: boolean;
  height: number;
}> {
  const p = projectPaths(slug);
  await mkdir(p.working, { recursive: true });
  await mkdir(p.output, { recursive: true });
  const project = ProjectSchema.parse(
    JSON.parse(await Bun.file(p.project).text())
  );
  const ranges = survivingRanges(project);
  if (ranges.length === 0) {
    throw new Error("nothing to export (all words deleted)");
  }
  const sr = project.sampleRate;
  const sourceInput = chooseSourceInput({
    dir: p.dir,
    proxy: project.proxy,
    source: project.source,
  });
  const sourceMeta =
    sourceInput.kind === "proxy"
      ? await probe(sourceInput.path)
      : { fps: project.fps, height: project.height, width: project.width };

  // output resolution
  const outH =
    opts.maxHeight && opts.maxHeight < sourceMeta.height
      ? opts.maxHeight
      : sourceMeta.height;
  const outW =
    outH === sourceMeta.height
      ? sourceMeta.width
      : Math.round((sourceMeta.width * outH) / sourceMeta.height / 2) * 2;

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
    plans.push(
      ...planBrollForRanges({
        broll: b,
        firstInputIndex: plans.length + 1,
        ranges,
        sampleRate: sr,
        srcPath: chooseAssetInput(p.dir, asset).path,
      })
    );
  }

  // stills -> output windows (Ken Burns push-in over a held image). Each still
  // becomes one extra looped-image input after the b-roll inputs.
  const outFps = Math.max(1, Math.round(sourceMeta.fps));
  const stillPlans = (project.stills ?? [])
    .map((s) => {
      const asset = assetById.get(s.assetId);
      if (asset?.kind !== "still") {
        return null;
      }
      const outStart = sourceToOutputSec(s.startSample / sr, ranges);
      const outEnd = sourceToOutputSec(s.endSample / sr, ranges);
      if (outEnd - outStart <= 0.05) {
        return null;
      }
      return {
        outStart,
        outEnd,
        still: s,
        srcPath: chooseAssetInput(p.dir, asset).path,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // Still inputs follow the source (0) and all b-roll plan inputs.
    .map((sp, i) => ({ ...sp, inputIndex: 1 + plans.length + i }));

  // zooms -> output windows
  const zoomWins = (project.zooms ?? [])
    .map((z) => ({
      os: sourceToOutputSec(z.startSample / sr, ranges),
      oe: sourceToOutputSec(z.endSample / sr, ranges),
      scale: z.scale,
      ramp: Math.max(0.05, z.rampSec),
    }))
    .filter((z) => z.oe - z.os > 0.05);

  // titles -> output time
  let titlesAssPath: string | null = null;
  const titleItems: TitleItem[] = (project.titles ?? [])
    .map((t) => ({
      text: t.text,
      startSec: sourceToOutputSec(t.startSample / sr, ranges),
      endSec: sourceToOutputSec(t.endSample / sr, ranges),
      position: t.position ?? "lower",
    }))
    .filter((t) => t.text.trim().length > 0 && t.endSec - t.startSec > 0.05);
  const titleSpans: TitleSpan[] = titleItems.map(
    ({ startSec, endSec, position }) => ({
      startSec,
      endSec,
      position: position ?? "lower",
    })
  );
  if (titleItems.length > 0) {
    titlesAssPath = `${p.working}/titles.ass`;
    await Bun.write(
      titlesAssPath,
      buildTitlesAss(titleItems, { width: outW, height: outH })
    );
  }

  // captions
  let assPath: string | null = null;
  const captionsOn = project.captions?.enabled !== false;
  if (captionsOn) {
    const groups = groupCaptions(
      keptWordsInOutputTime(project, ranges),
      project.captions?.maxWords ?? 6
    );
    if (groups.length > 0) {
      assPath = `${p.working}/captions.ass`;
      await Bun.write(
        assPath,
        buildAss(groups, {
          height: outH,
          placement: (_group, span) =>
            captionPlacementForSpan(span.startSec, span.endSec, titleSpans),
          width: outW,
        })
      );
    }
  }

  // ---- filtergraph ----
  const parts: string[] = [];
  let base = `[0:v]select='${selectExpr}',setpts=N/FRAME_RATE/TB`;
  if (outH !== sourceMeta.height) {
    base += `,scale=${outW}:${outH}`;
  }
  parts.push(`${base}[v0]`);
  let last = "v0";

  if (zoomWins.length > 0) {
    // Animated push-in via zoompan (z is evaluated per output frame, so it can ramp).
    const fps = Math.max(1, Math.round(sourceMeta.fps));
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

  for (const sp of stillPlans) {
    const dur = sp.outEnd - sp.outStart;
    const zp = buildStillZoompan(
      {
        durationSec: dur,
        scale: sp.still.scale,
        focusX: sp.still.focusX,
        focusY: sp.still.focusY,
      },
      { width: outW, height: outH, fps: outFps }
    );
    parts.push(
      `[${sp.inputIndex}:v]${zp},setpts=PTS-STARTPTS+${sec(sp.outStart)}/TB[sv${sp.inputIndex}]`
    );
    parts.push(
      `[${last}][sv${sp.inputIndex}]overlay=eof_action=pass:enable='between(t,${sec(sp.outStart)},${sec(sp.outEnd)})'[sov${sp.inputIndex}]`
    );
    last = `sov${sp.inputIndex}`;
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
    sourceInput.path,
    ...plans.flatMap((pl) => ["-i", pl.srcPath]),
    // Stills are single images looped for the overlay duration.
    ...stillPlans.flatMap((sp) => [
      "-loop",
      "1",
      "-t",
      sec(sp.outEnd - sp.outStart),
      "-i",
      sp.srcPath,
    ]),
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
    stills: stillPlans.length,
    zooms: zoomWins.length,
    titles: titleItems.length,
    vignette,
    height: outH,
  };
}

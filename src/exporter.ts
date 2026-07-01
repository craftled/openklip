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
import { colorAdjustFilter } from "./color-adjust.ts";
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
import { filterChain } from "./filter.ts";
import { renderGraphicOverlay } from "./graphic-render.ts";
import {
  defaultGraphicParams,
  type GraphicManifest,
  loadGraphicManifest,
} from "./graphics.ts";
import { buildStillZoompan } from "./ken-burns.ts";
import { lut3dExpr, lutPath } from "./lut.ts";
import { projectPaths } from "./paths.ts";
import {
  assertProductAnnouncementSpec,
  PRODUCT_ANNOUNCEMENT_CATALOG,
  PRODUCT_ANNOUNCEMENT_FPS,
  PRODUCT_ANNOUNCEMENT_HEIGHT,
  PRODUCT_ANNOUNCEMENT_WIDTH,
} from "./product-announcement.ts";
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

export interface GraphicWindow {
  outEnd: number;
  outStart: number;
}

// Map a graphic overlay's SOURCE-time sample span onto the OUTPUT timeline using
// the SAME sourceToOutputSec machinery as stills/titles. Returns null when the
// surviving window collapses to <= 0.05s (mirrors the still/title guard). Pure
// so the exporter filter-graph test can assert on it without spawning ffmpeg
// (same pattern as planBrollForRanges).
export function planGraphicWindow(input: {
  startSample: number;
  endSample: number;
  sampleRate: number;
  ranges: Range[];
}): GraphicWindow | null {
  const outStart = sourceToOutputSec(
    input.startSample / input.sampleRate,
    input.ranges
  );
  const outEnd = sourceToOutputSec(
    input.endSample / input.sampleRate,
    input.ranges
  );
  if (outEnd - outStart <= 0.05) {
    return null;
  }
  return { outStart, outEnd };
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
  graphics: number;
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

  // graphics -> output windows. Each Graphic overlay is rendered through the
  // renderer seam (src/graphic-render.ts) into an overlay asset keyed to its
  // sample range; ffmpeg stays the master compositor.
  //   - kind 'text' -> an ASS burn (combined into one graphics.ass below, exactly
  //     like titles; the seam's per-overlay text path is the unit-testable
  //     surface but the exporter builds the combined file directly for parity
  //     with titles. Keep this duplication, do NOT route text graphics back
  //     through the per-overlay seam or the local/output timebase will mismatch).
  //   - kind 'rich' -> a transparent ProRes MOV composited as one extra input.
  // One planning pass: map each Graphic to its output window + manifest + merged
  // params. NO renderer-seam call here: text graphics are burned directly into
  // the combined graphics.ass below (parity with titles), so only rich graphics
  // pay for a headless render and no wasted per-overlay .ass file is written.
  const graphicsPlanned = (
    await Promise.all(
      (project.graphics ?? []).map(async (g) => {
        const win = planGraphicWindow({
          startSample: g.startSample,
          endSample: g.endSample,
          sampleRate: sr,
          ranges,
        });
        if (!win) {
          return null;
        }
        if (g.type === "json-render") {
          const { renderProductAnnouncementHtml } = await import(
            "./product-announcement-html.tsx"
          );
          const spec = assertProductAnnouncementSpec(g.spec);
          const params: Record<string, string | number | boolean> = {};
          const manifest: GraphicManifest = {
            id: PRODUCT_ANNOUNCEMENT_CATALOG,
            name: "Product announcement",
            kind: "rich",
            width: PRODUCT_ANNOUNCEMENT_WIDTH,
            height: PRODUCT_ANNOUNCEMENT_HEIGHT,
            fps: PRODUCT_ANNOUNCEMENT_FPS,
            params: {},
          };
          return {
            graphic: g,
            outStart: win.outStart,
            outEnd: win.outEnd,
            manifest,
            params,
            compositionHtml: await renderProductAnnouncementHtml(spec),
          };
        }
        const manifest: GraphicManifest = loadGraphicManifest(g.template);
        const params = { ...defaultGraphicParams(manifest), ...g.params };
        return {
          graphic: g,
          outStart: win.outStart,
          outEnd: win.outEnd,
          manifest,
          params,
          compositionHtml: undefined,
        };
      })
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null);

  // Text graphics burn as a single combined ASS at OUTPUT time (mirrors titles).
  // A representative accent (first text graphic that sets one) is threaded so the
  // common single-accent case matches the preview's --accent; buildTitlesAss is
  // single-accent per file, so mixed per-item accents would need grouped burns.
  let graphicsAssPath: string | null = null;
  const textGraphics = graphicsPlanned.filter(
    (x) => x.manifest.kind === "text"
  );
  const textGraphicItems: TitleItem[] = textGraphics
    .map((x): TitleItem => {
      const pos = x.params.position;
      const position: "lower" | "center" | "hero" =
        pos === "center" || pos === "hero" ? pos : "lower";
      return {
        text: String(x.params.text ?? x.params.title ?? ""),
        startSec: x.outStart,
        endSec: x.outEnd,
        position,
      };
    })
    .filter((t) => t.text.trim().length > 0 && t.endSec - t.startSec > 0.05);
  if (textGraphicItems.length > 0) {
    const graphicAccent = textGraphics
      .map((x) => x.params.accent)
      .find((a): a is string => typeof a === "string" && a.length > 0);
    graphicsAssPath = `${p.working}/graphics.ass`;
    await Bun.write(
      graphicsAssPath,
      buildTitlesAss(textGraphicItems, {
        width: outW,
        height: outH,
        motion: project.motion,
        accent: graphicAccent,
      })
    );
  }

  // Rich graphics each pay for a headless alpha-MOV render through the seam,
  // keyed by the overlay's UNIQUE id (g.id) so two overlays sharing a template
  // never collide on one file. Input-index invariant: physical -i order is
  // source(0), b-roll plans, stills, THEN rich graphics. The
  // `1 + plans.length + stillPlans.length + j` math MUST match the flatMap append
  // order in the inputs array. This is the single most likely off-by-one bug, so the
  // index math and the append order live together.
  const richRendered = await Promise.all(
    graphicsPlanned
      .filter((x) => x.manifest.kind === "rich")
      .map(async (x) => {
        const asset = await renderGraphicOverlay({
          manifest: x.manifest,
          id: x.graphic.id,
          template: x.graphic.template,
          compositionHtml: x.compositionHtml,
          params: x.params,
          durationSamples: x.graphic.endSample - x.graphic.startSample,
          fps: outFps,
          width: outW,
          height: outH,
          outDir: p.working,
        });
        return { ...x, asset };
      })
  );
  const richGraphics = richRendered.map((x, j) => ({
    ...x,
    inputIndex: 1 + plans.length + stillPlans.length + j,
  }));

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
      buildTitlesAss(titleItems, {
        width: outW,
        height: outH,
        motion: project.motion,
      })
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

  // Technical LUT first (e.g. log → Rec.709), then the creative filter on top.
  const lutName = project.look?.lut;
  if (lutName) {
    const lutAbs = lutPath(lutName);
    if (!existsSync(lutAbs)) {
      throw new Error(`LUT not found: ${lutName} (${lutAbs})`);
    }
    parts.push(`[${last}]${lut3dExpr(lutAbs)}[lut]`);
    last = "lut";
  }

  // Built-in filter on the composited picture, just before the vignette
  // so edge darkening sits on top of the look.
  const builtInFilterChain = filterChain(project.look?.filter ?? "none");
  if (builtInFilterChain) {
    parts.push(`[${last}]${builtInFilterChain}[flt]`);
    last = "flt";
  }

  // Continuous color knobs on top of the filter, in the same slot so the look
  // composites filter then fine adjustment.
  const colorChain = colorAdjustFilter(project.look?.color);
  if (colorChain) {
    parts.push(`[${last}]${colorChain}[clr]`);
    last = "clr";
  }

  const vignette = Boolean(project.look?.vignette);
  if (vignette) {
    parts.push(`[${last}]vignette[vig]`);
    last = "vig";
  }

  // Rich graphics sit on top of the filter/vignette, just below the subtitle
  // burns (captions/titles/text-graphics), the same editorial layer as titles. The
  // alpha MOV carries its own duration + transparency, so just PTS-offset to its
  // output start, scale to the frame, and overlay within its enable window
  // (mirrors the still overlay loop above; eof_action=pass like b-roll/stills).
  for (const rg of richGraphics) {
    parts.push(
      `[${rg.inputIndex}:v]setpts=PTS-STARTPTS+${sec(rg.outStart)}/TB,scale=${outW}:${outH}[gv${rg.inputIndex}]`
    );
    parts.push(
      `[${last}][gv${rg.inputIndex}]overlay=eof_action=pass:enable='between(t,${sec(rg.outStart)},${sec(rg.outEnd)})'[gov${rg.inputIndex}]`
    );
    last = `gov${rg.inputIndex}`;
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
  if (graphicsAssPath) {
    parts.push(
      `[${vlabel}]subtitles='${escapeAssPath(graphicsAssPath)}'[vgfx]`
    );
    vlabel = "vgfx";
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
    // Rich-graphic alpha MOVs. MUST be appended AFTER stills to keep the
    // 1 + plans.length + stillPlans.length + j index math above correct. ProRes
    // 4444 alpha (yuva444p) is auto-detected by ffmpeg; no input codec flag.
    ...richGraphics.flatMap((rg) => ["-i", rg.asset.assetPath]),
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
    graphics: graphicsPlanned.length,
    vignette,
    height: outH,
  };
}

// Renderer seam for Graphic overlays. ONE interface, TWO backends:
//   - kind 'text' -> FAST PATH: reuse the existing ASS machinery (src/titles.ts).
//     No Chrome, no new deps, works fully offline. The default.
//   - kind 'rich' -> alpha ProRes MOV via a LAZY import of src/headless-render.ts,
//     which renders the composition.html in headless Chrome driven by the SAME
//     web/lib/graphic-runtime.ts the preview uses (so export == preview). Needs
//     chrome-headless-shell; throws a clear, actionable error if it is missing.
//
// ffmpeg stays the master compositor: this module only EMITS an overlay asset
// keyed to a sample range; the exporter (src/exporter.ts) composites it onto the
// output timeline. The headless renderer is imported LAZILY so typecheck/build/
// tests pass (and the text path runs) without Chrome present.

import { join } from "node:path";
import { SAMPLE_RATE } from "./edl.ts";
import type { GraphicManifest } from "./graphics.ts";
import { graphicCompositionPath } from "./graphics.ts";
import { buildTitlesAss, type TitleItem } from "./titles.ts";

export interface RenderGraphicInput {
  // Optional inline composition for generated graphics. Template graphics still
  // load graphics/<template>/composition.html.
  compositionHtml?: string;
  // Overlay span length on the 48kHz sample grid (endSample - startSample).
  durationSamples: number;
  // Output fps (the exporter passes its single resolved outFps).
  fps: number;
  height: number;
  // The overlay's UNIQUE id (g.id). Keys the emitted asset filename so two
  // overlays using the same template do not collide / race on one file.
  id: string;
  // Carries kind/width/height/fps; resolved by the caller via loadGraphicManifest.
  manifest: GraphicManifest;
  // Working dir to write the asset into (exporter passes p.working).
  outDir: string;
  // Already merged over the manifest's param defaults by the caller.
  params: Record<string, string | number | boolean>;
  // graphic-template id (composition.html lookup + error messages).
  template: string;
  // Output width / height (exporter passes outW / outH).
  width: number;
}

export interface GraphicAsset {
  // Absolute path to the emitted overlay asset.
  assetPath: string;
  // How the exporter composites it: 'ass' burns via subtitles, 'alpha' overlays
  // the transparent MOV like a still.
  kind: "ass" | "alpha";
}

// Deterministic per-overlay filename so re-export overwrites rather than leaking
// files, and two overlays sharing a template never collide. The exporter passes
// the overlay's unique id (g.id), NOT the template id. `ext` is the on-disk file
// extension (ass for text, mov for the alpha ProRes overlay).
export function graphicAssetBasename(
  graphicId: string,
  ext: "ass" | "mov"
): string {
  return `graphic-${graphicId}.${ext}`;
}

// Resolve a graphic's text param. Templates conventionally expose either a flat
// `text` field (kinetic-caption) or a `title` field (lower-third); fall back to
// "" so an empty graphic still renders a (skipped) item.
function graphicText(
  params: Record<string, string | number | boolean>
): string {
  if (params.text !== undefined && params.text !== null) {
    return String(params.text);
  }
  if (params.title !== undefined && params.title !== null) {
    return String(params.title);
  }
  return "";
}

function graphicPosition(
  params: Record<string, string | number | boolean>
): "lower" | "center" | "hero" {
  const p = params.position;
  if (p === "center" || p === "hero" || p === "lower") {
    return p;
  }
  return "lower";
}

// Render the text fast path: author a single TitleItem in its OWN local timebase
// (t=0..durSec) and reuse buildTitlesAss verbatim. The exporter offsets it onto
// the output timeline. This path MUST work fully offline.
function renderTextGraphic(input: RenderGraphicInput): GraphicAsset {
  const durSec = input.durationSamples / SAMPLE_RATE;
  const items: TitleItem[] = [
    {
      text: graphicText(input.params),
      startSec: 0,
      endSec: Math.max(0.05, durSec),
      position: graphicPosition(input.params),
    },
  ];
  const accent =
    typeof input.params.accent === "string" ? input.params.accent : undefined;
  const ass = buildTitlesAss(items, {
    width: input.width,
    height: input.height,
    accent,
  });
  const assetPath = join(input.outDir, graphicAssetBasename(input.id, "ass"));
  // Bun.write is sync-safe to await; node:fs would also work. Keep parity with
  // the exporter, which writes ASS via Bun.write.
  Bun.write(assetPath, ass);
  return { assetPath, kind: "ass" };
}

// Render the rich path: an alpha ProRes MOV produced by headless Chrome driving
// the SAME web/lib/graphic-runtime.ts as the live preview (so export == preview,
// frame-for-frame). src/headless-render.ts is imported LAZILY so puppeteer-core
// never enters the app bundle and the text path runs with no Chrome installed.
async function renderRichGraphic(
  input: RenderGraphicInput
): Promise<GraphicAsset> {
  const assetPath = join(input.outDir, graphicAssetBasename(input.id, "mov"));
  const durFrames = Math.max(
    1,
    Math.round((input.durationSamples / SAMPLE_RATE) * input.fps)
  );

  let compositionHtml = input.compositionHtml;
  if (!compositionHtml) {
    try {
      compositionHtml = await Bun.file(
        graphicCompositionPath(input.template)
      ).text();
    } catch {
      throw new Error(
        `rich graphic "${input.template}": composition.html not found in graphics/${input.template}/.`
      );
    }
  }

  try {
    const { renderHeadlessAlpha } = await import("./headless-render.ts");
    await renderHeadlessAlpha({
      compositionHtml,
      params: input.params,
      width: input.width,
      height: input.height,
      fps: input.fps,
      durFrames,
      outPath: assetPath,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `rich graphic "${input.template}" failed to render (${detail}). Rich graphics need chrome-headless-shell. Install once with: bunx puppeteer browsers install chrome-headless-shell. Or set the template's manifest kind to "text".`
    );
  }

  return { assetPath, kind: "alpha" };
}

export async function renderGraphicOverlay(
  input: RenderGraphicInput
): Promise<GraphicAsset> {
  if (input.manifest.kind === "text") {
    return renderTextGraphic(input);
  }
  return await renderRichGraphic(input);
}

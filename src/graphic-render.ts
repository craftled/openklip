// Renderer seam for Graphic overlays. ONE interface, TWO backends:
//   - kind 'text' -> FAST PATH: reuse the existing ASS machinery (src/titles.ts).
//     No Chrome, no new deps, works fully offline. The default.
//   - kind 'rich' -> alpha WebM via a LAZY dynamic import of @hyperframes/producer
//     (headless Chrome). If the package or its Chrome is unavailable, throws a
//     clear, actionable error.
//
// ffmpeg stays the master compositor: this module only EMITS an overlay asset
// keyed to a sample range; the exporter (src/exporter.ts) composites it onto the
// output timeline. NO hyperframes import at top level, so typecheck/build/tests
// pass with the optional rich backend absent.

import { join } from "node:path";
import { SAMPLE_RATE } from "./edl.ts";
import type { GraphicManifest } from "./graphics.ts";
import { graphicCompositionPath } from "./graphics.ts";
import { buildTitlesAss, type TitleItem } from "./titles.ts";

export interface RenderGraphicInput {
  // Overlay span length on the 48kHz sample grid (endSample - startSample).
  durationSamples: number;
  // Output fps (exporter passes Math.max(1, Math.round(sourceMeta.fps))).
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
  // Tells the exporter how to composite it.
  kind: "ass" | "webm";
}

// Deterministic per-overlay filename so re-export overwrites rather than leaking
// files, and two overlays sharing a template never collide. The exporter passes
// the overlay's unique id (g.id), NOT the template id.
export function graphicAssetBasename(
  graphicId: string,
  kind: "ass" | "webm"
): string {
  return `graphic-${graphicId}.${kind}`;
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

// Render the rich path: alpha WebM via the OPTIONAL @hyperframes/producer. The
// import is lazy + try/catch'd so this module never requires the package at
// typecheck/build/test time. The `as string` specifier defeats TS module
// resolution so tsc does not demand the package's .d.ts when it is absent.
//
// ANIMATION CONTRACT (known gap on this optional, Chrome-gated path): OpenKlip's
// data-* frame contract is driven by web/lib/graphic-runtime.ts in the browser
// preview. The producer only sees the bare composition.html + inputProps, so a
// rich template animates at EXPORT only if its composition.html embeds its own
// frame-driven <script> (Hyperframes-style window.__timelines / seek). Until a
// rich template is verified end-to-end against a real headless Chrome render,
// treat rich graphics as authoring-preview-accurate but export-static unless the
// template self-drives. The default text path has no such gap.
async function renderRichGraphic(
  input: RenderGraphicInput
): Promise<GraphicAsset> {
  const installHint = `rich graphic "${input.template}" requires the optional @hyperframes/producer package (+ chrome-headless-shell). Install it with: bun add @hyperframes/producer && npx @hyperframes/producer install-chrome — or convert the template to kind:"text".`;

  let producer: { createRenderJob: (opts: unknown) => Promise<unknown> };
  try {
    producer = (await import("@hyperframes/producer" as string)) as {
      createRenderJob: (opts: unknown) => Promise<unknown>;
    };
  } catch {
    throw new Error(installHint);
  }

  const durationInFrames = Math.max(
    1,
    Math.round((input.durationSamples / SAMPLE_RATE) * input.fps)
  );
  const assetPath = join(input.outDir, graphicAssetBasename(input.id, "webm"));

  try {
    const job = (await producer.createRenderJob({
      format: "webm", // transparent alpha overlay (vp9 yuva420p)
      composition: graphicCompositionPath(input.template),
      width: input.width,
      height: input.height,
      fps: input.fps,
      durationInFrames,
      inputProps: input.params,
      output: assetPath,
    })) as { done?: () => Promise<unknown> };
    if (typeof job?.done === "function") {
      await job.done();
    }
  } catch (err) {
    // Chrome present but missing/broken at render time: re-wrap with the same
    // actionable message so the user knows to run the Chrome install step.
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${installHint} (render failed: ${detail})`);
  }

  return { assetPath, kind: "webm" };
}

export async function renderGraphicOverlay(
  input: RenderGraphicInput
): Promise<GraphicAsset> {
  if (input.manifest.kind === "text") {
    return renderTextGraphic(input);
  }
  return await renderRichGraphic(input);
}

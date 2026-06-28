// Headless HTML/CSS -> alpha video renderer for RICH graphic templates.
//
// This is the fidelity path: it drives the SAME web/lib/graphic-runtime.ts that
// the live preview uses, so a rich graphic's EXPORT is frame-identical to its
// PREVIEW (frame-pure, Remotion-style). chrome-headless-shell (via puppeteer-
// core) renders the composition with a transparent background and captures one
// PNG per frame (page.screenshot omitBackground); ffmpeg muxes the frames into
// an alpha WebM (libvpx-vp9 / yuva420p) that the exporter overlays exactly like
// a still or b-roll. ffmpeg therefore stays the master compositor.
//
// node-only + heavy: imported LAZILY by src/graphic-render.ts and listed in
// next.config serverExternalPackages so it never enters a client/server bundle.

import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { FFMPEG, run } from "./ffmpeg.ts";

export interface HeadlessRenderInput {
  compositionHtml: string;
  durFrames: number;
  fps: number;
  height: number;
  outPath: string;
  params: Record<string, string | number | boolean>;
  width: number;
}

const CHROME_HINT =
  "chrome-headless-shell not found. Install it once with: bunx puppeteer browsers install chrome-headless-shell";

// chrome-headless-shell lands under ~/.cache/puppeteer/chrome-headless-shell/
// <platform-build>/chrome-headless-shell-<platform>/chrome-headless-shell.
function findChrome(): string {
  const base = join(homedir(), ".cache", "puppeteer", "chrome-headless-shell");
  if (!existsSync(base)) {
    throw new Error(CHROME_HINT);
  }
  for (const build of readdirSync(base)) {
    const buildDir = join(base, build);
    for (const inner of readdirSync(buildDir)) {
      const bin = join(buildDir, inner, "chrome-headless-shell");
      if (existsSync(bin)) {
        return bin;
      }
    }
  }
  throw new Error(CHROME_HINT);
}

// Bundle web/lib/graphic-runtime.ts (+ motion) into an IIFE exposing
// window.__okGraphic. Built once per process and cached.
let runtimeBundle: string | null = null;
async function buildRuntimeBundle(): Promise<string> {
  if (runtimeBundle !== null) {
    return runtimeBundle;
  }
  const entry = join(import.meta.dir, "graphic-runtime-entry.ts");
  const out = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "iife",
    minify: true,
  });
  if (!out.success) {
    throw new Error(
      `failed to bundle graphic runtime: ${out.logs.map(String).join("; ")}`
    );
  }
  runtimeBundle = await out.outputs[0].text();
  return runtimeBundle;
}

const pad5 = (n: number): string => String(n).padStart(5, "0");

// Render `compositionHtml` to a transparent WebM at `outPath`. One headless
// Chrome page is seeked frame-by-frame via the shared runtime; each frame is a
// PNG with alpha, then ffmpeg encodes the sequence to vp9 yuva420p.
export async function renderHeadlessAlpha(
  input: HeadlessRenderInput
): Promise<void> {
  const chrome = findChrome();
  const bundle = await buildRuntimeBundle();
  const puppeteer = (await import("puppeteer-core")).default;

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
    ],
  });
  const framesDir = await mkdtemp(join(tmpdir(), "openklip-rich-"));
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: input.width,
      height: input.height,
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style></head><body>${input.compositionHtml}</body></html>`,
      { waitUntil: "load" }
    );
    // Block until webfonts settle so glyph metrics match the preview.
    await page.evaluate(() => document.fonts.ready);
    await page.addScriptTag({ content: bundle });

    for (let f = 0; f < input.durFrames; f++) {
      await page.evaluate(
        (frame: number, durFrames: number, height: number, params: unknown) => {
          const api = (
            window as unknown as {
              __okGraphic: {
                applyGraphicFrame: (
                  r: Element,
                  fr: number,
                  df: number,
                  h: number
                ) => void;
                applyGraphicParams: (r: Element, p: unknown) => void;
              };
            }
          ).__okGraphic;
          const root = document.querySelector("[data-graphic-root]");
          if (!root) {
            return;
          }
          api.applyGraphicParams(root, params);
          api.applyGraphicFrame(root, frame, durFrames, height);
        },
        f,
        input.durFrames,
        input.height,
        input.params
      );
      const buf = (await page.screenshot({
        omitBackground: true,
        type: "png",
        clip: { x: 0, y: 0, width: input.width, height: input.height },
      })) as Uint8Array;
      await writeFile(join(framesDir, `frame-${pad5(f)}.png`), buf);
    }
    await browser.close();

    // ProRes 4444 in a MOV preserves alpha reliably (native encoder, no libvpx
    // alpha quirks) and decodes cleanly for the exporter's overlay composite.
    await run(FFMPEG, [
      "-y",
      "-framerate",
      String(input.fps),
      "-i",
      join(framesDir, "frame-%05d.png"),
      "-c:v",
      "prores_ks",
      "-profile:v",
      "4444",
      "-pix_fmt",
      "yuva444p10le",
      "-qscale:v",
      "12",
      input.outPath,
    ]);
  } finally {
    await browser.close().catch(() => {
      // already closed
    });
    await rm(framesDir, { recursive: true, force: true });
  }
}

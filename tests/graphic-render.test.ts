import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SAMPLE_RATE } from "../src/edl.ts";
import {
  graphicAssetBasename,
  renderGraphicOverlay,
} from "../src/graphic-render.ts";
import { loadGraphicManifest } from "../src/graphics.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "openklip-graphic-render-"));
}

test("graphicAssetBasename is deterministic and kind-keyed", () => {
  assert.equal(
    graphicAssetBasename("lower-third", "ass"),
    "graphic-lower-third.ass"
  );
  assert.equal(
    graphicAssetBasename("title-card", "mov"),
    "graphic-title-card.mov"
  );
});

test("text-kind graphic renders a valid ASS asset", async () => {
  const dir = tmp();
  try {
    const manifest = loadGraphicManifest("lower-third");
    const asset = await renderGraphicOverlay({
      manifest,
      id: "g1",
      template: "lower-third",
      params: {
        title: "Hello World",
        subtitle: "",
        accent: manifest.params.accent?.default as string,
      },
      durationSamples: 2 * SAMPLE_RATE, // 2s
      fps: 30,
      width: 1920,
      height: 1080,
      outDir: dir,
    });

    assert.equal(asset.kind, "ass");
    // Asset is keyed by the overlay's unique id, not the template id.
    assert.ok(asset.assetPath.endsWith("graphic-g1.ass"));
    assert.ok(existsSync(asset.assetPath));

    const ass = readFileSync(asset.assetPath, "utf8");
    // Valid ASS structure from buildTitlesAss.
    assert.ok(ass.includes("[Script Info]"));
    assert.ok(ass.includes("[V4+ Styles]"));
    assert.ok(ass.includes("[Events]"));
    // The text param was mapped into a Dialogue line (lower-third by default).
    assert.ok(ass.includes("Hello World"));
    assert.ok(/Dialogue: 0,0:00:00\.00,/.test(ass));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("text-kind graphic maps the flat `text` param too (kinetic-caption)", async () => {
  const dir = tmp();
  try {
    const manifest = loadGraphicManifest("kinetic-caption");
    const asset = await renderGraphicOverlay({
      manifest,
      id: "g2",
      template: "kinetic-caption",
      params: { text: "BIG IDEA" },
      durationSamples: SAMPLE_RATE,
      fps: 30,
      width: 1080,
      height: 1080,
      outDir: dir,
    });
    assert.equal(asset.kind, "ass");
    const ass = readFileSync(asset.assetPath, "utf8");
    assert.ok(ass.includes("BIG IDEA"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("text-kind graphic authors a local timebase starting at t=0", async () => {
  const dir = tmp();
  try {
    const manifest = loadGraphicManifest("lower-third");
    const asset = await renderGraphicOverlay({
      manifest,
      id: "g3",
      template: "lower-third",
      params: { title: "Timing" },
      durationSamples: 3 * SAMPLE_RATE, // 3s
      fps: 30,
      width: 1920,
      height: 1080,
      outDir: dir,
    });
    const ass = readFileSync(asset.assetPath, "utf8");
    // Local timebase: starts at 0, ends at ~3s. Exporter offsets to output time.
    assert.ok(ass.includes("0:00:00.00,0:00:03.00"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Rich path: gated on chrome-headless-shell (the only optional runtime dep). When
// absent, renderGraphicOverlay must throw a clear, actionable error rather than
// hang or fake success. When present, this test is skipped, the real render
// spawns headless Chrome and is covered by manual/integration verification.
function chromeHeadlessInstalled(): boolean {
  const base = join(homedir(), ".cache", "puppeteer", "chrome-headless-shell");
  if (!existsSync(base)) {
    return false;
  }
  for (const build of readdirSync(base)) {
    for (const inner of readdirSync(join(base, build))) {
      if (existsSync(join(base, build, inner, "chrome-headless-shell"))) {
        return true;
      }
    }
  }
  return false;
}

test("rich-kind graphic throws an actionable error when Chrome is absent", async () => {
  if (chromeHeadlessInstalled()) {
    // Chrome is installed; skip cleanly so CI with Chrome stays green without
    // spawning a real headless render here.
    return;
  }

  const dir = tmp();
  try {
    const manifest = loadGraphicManifest("title-card");
    await assert.rejects(
      () =>
        renderGraphicOverlay({
          manifest,
          id: "g4",
          template: "title-card",
          params: { headline: "Chapter One" },
          durationSamples: SAMPLE_RATE,
          fps: 30,
          width: 1920,
          height: 1080,
          outDir: dir,
        }),
      /chrome-headless-shell/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Distinct from the Chrome-missing path: a rich graphic whose composition.html
// is absent must fail with a clear error BEFORE any headless render runs (so the
// check is Chrome-free and deterministic in CI). Reuse a real rich manifest but
// point the template id at a directory that does not exist.
test("rich-kind graphic errors clearly when composition.html is missing", async () => {
  const dir = tmp();
  try {
    const manifest = loadGraphicManifest("title-card");
    await assert.rejects(
      () =>
        renderGraphicOverlay({
          manifest,
          id: "g6",
          template: "no-such-template",
          params: { headline: "Chapter One" },
          durationSamples: SAMPLE_RATE,
          fps: 30,
          width: 1920,
          height: 1080,
          outDir: dir,
        }),
      /composition\.html not found/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rich-kind graphic accepts inline composition HTML", async () => {
  if (chromeHeadlessInstalled()) {
    return;
  }

  const dir = tmp();
  try {
    const manifest = loadGraphicManifest("title-card");
    await assert.rejects(
      () =>
        renderGraphicOverlay({
          manifest,
          id: "g7",
          template: "generated-announcement",
          compositionHtml:
            '<section data-graphic-root style="width:1920px;height:1080px"></section>',
          params: {},
          durationSamples: SAMPLE_RATE,
          fps: 30,
          width: 1920,
          height: 1080,
          outDir: dir,
        }),
      /chrome-headless-shell/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

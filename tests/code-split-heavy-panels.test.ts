import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dir, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

test("preview-overlays dynamically imports heavy graphic overlays", () => {
  const src = read("web/components/preview-overlays.tsx");
  assert.match(src, /next\/dynamic/);
  assert.match(src, /import\("\.\/graphic-overlay"\)/);
  assert.match(src, /import\("\.\/json-render-graphic-overlay"\)/);
  assert.doesNotMatch(
    src,
    /import\s*\{[^}]*GraphicOverlay[^}]*\}\s*from\s*"\.\/graphic-overlay"/
  );
});

test("json-render-graphic-overlay dynamically imports MapMotionFrame", () => {
  const src = read("web/components/json-render-graphic-overlay.tsx");
  assert.match(src, /import\("\.\/map-motion-frame"\)/);
  assert.doesNotMatch(
    src,
    /import\s*\{\s*MapMotionFrame\s*\}\s*from\s*"\.\/map-motion-frame"/
  );
});

test("media visualizer hosts dynamically import MediaAudioVisualizerWave", () => {
  for (const rel of [
    "web/components/cam-row.tsx",
    "web/components/asset-preview-hover.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /next\/dynamic/, rel);
    assert.match(
      src,
      /import\("@\/components\/media-audio-visualizer-wave"\)/,
      rel
    );
  }
});

test("wave-shader path does not import LiveKit", () => {
  const wave = read("web/components/agents-ui/wave-shader.tsx");
  const media = read("web/components/media-audio-visualizer-wave.tsx");
  assert.doesNotMatch(wave, /livekit/i);
  assert.doesNotMatch(media, /livekit/i);
  assert.match(media, /wave-shader/);
});

test("graphic-template-preview-hover dynamically loads template preview", () => {
  const src = read("web/components/graphic-template-preview-hover.tsx");
  assert.match(src, /import\("\.\/graphic-template-preview"\)/);
  // Static import of the preview module re-pulls paper shaders into the picker
  // shell (caption used to import from the same heavy file).
  assert.doesNotMatch(
    src,
    /import\s*\{[^}]*\}\s*from\s*"\.\/graphic-template-preview"/
  );
});

test("preview-overlays type-imports GraphicItem from a light module", () => {
  const src = read("web/components/preview-overlays.tsx");
  assert.match(src, /from\s*"\.\/graphic-item"/);
  assert.doesNotMatch(
    src,
    /import\s+type\s*\{[^}]*GraphicItem[^}]*\}\s*from\s*"\.\/graphic-overlay"/
  );
});

test("graphic-runtime and paper shaders stay out of the static picker/hover shell", () => {
  for (const rel of [
    "web/components/graphic-template-preview-hover.tsx",
    "web/components/graphic-picker-controls.tsx",
    "web/components/preview-overlays.tsx",
    "web/components/graphic-item.ts",
  ]) {
    const src = read(rel);
    assert.doesNotMatch(src, /@paper-design\/shaders/, rel);
    assert.doesNotMatch(src, /from\s*"@\/lib\/graphic-runtime"/, rel);
    assert.doesNotMatch(src, /from\s*"\.\/graphic-runtime"/, rel);
  }
});

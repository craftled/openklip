import assert from "node:assert/strict";
import { test } from "node:test";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Audio, CutSnap } from "../src/edl.ts";
import { AudioControls } from "../web/components/audio-controls.tsx";

function audio(overrides: Partial<Audio> = {}): Audio {
  return {
    ducking: { enabled: false, amountDb: 12, attackMs: 25, releaseMs: 250 },
    loudness: { enabled: false, targetLufs: -16, mode: "single" },
    noiseReduction: { enabled: false, nr: 12 },
    voiceHighpass: { enabled: false, hz: 80 },
    deEsser: { enabled: false, intensity: 0.5 },
    ...overrides,
  };
}

function snap(overrides: Partial<CutSnap> = {}): CutSnap {
  return {
    enabled: false,
    mode: "off",
    maxShiftMs: 120,
    crossfadeMs: 24,
    ...overrides,
  };
}

const noop = () => {
  // presentational test: callbacks are not exercised
};

function render(
  overrides: Partial<ComponentProps<typeof AudioControls>> = {}
): string {
  return renderToStaticMarkup(
    <AudioControls
      audio={audio()}
      onPatchAudio={noop}
      onPatchSnap={noop}
      snap={snap()}
      {...overrides}
    />
  );
}

test("renders the section wrapper and one toggle per group", () => {
  const html = render();
  assert.match(html, /data-audio-section/);
  assert.match(html, /data-audio-duck/);
  assert.match(html, /data-audio-loudness/);
  assert.match(html, /data-audio-noise/);
  assert.match(html, /data-audio-deess/);
  assert.match(html, /data-snap-toggle/);
  // Base UI Switch renders a button with role="switch".
  const switchCount = html.split('role="switch"').length - 1;
  assert.equal(
    switchCount,
    6,
    "expected 6 toggles: duck, loudness, noise, highpass, deess, snap"
  );
});

test("shows honest captions under ducking, the applied-at-export groups, and snap", () => {
  const html = render();
  assert.match(html, /Ducking lowers music under speech on export/);
  assert.match(html, /Applied at export; preview audio is unprocessed/);
  assert.match(html, /Snap moves cut edges to nearby silence/);
  // R5: the crossfade borrows a few ms of deleted audio at each seam; the
  // caption says so instead of implying a lossless smoothing.
  assert.match(
    html,
    /crossfade smooths cut seams and reuses a few milliseconds of the removed audio/
  );
});

// C4: applying (a save in flight) disables every control, CleanupPanel parity.
test("applying disables all toggles and numeric controls", () => {
  const html = render({
    applying: true,
    audio: audio({
      ducking: { enabled: true, amountDb: 12, attackMs: 25, releaseMs: 250 },
    }),
    snap: snap({ enabled: true }),
  });
  // Every switch is disabled (Base UI renders disabled buttons).
  const switchCount = html.split('role="switch"').length - 1;
  assert.equal(switchCount, 6);
  const enabledSwitches = html
    .split("<button")
    .filter((b) => b.includes('role="switch"') && !b.includes("disabled"));
  assert.equal(enabledSwitches.length, 0, "expected every switch disabled");
  // Number inputs are disabled too.
  const inputs = html.split("<input").slice(1);
  const enabledInputs = inputs.filter(
    (i) => i.includes('type="number"') && !i.includes("disabled")
  );
  assert.equal(enabledInputs.length, 0, "expected every number input disabled");
});

// C6: the UI max must match CutSnapSchema's 500ms bound, not stop at 300.
test("max shift row allows the schema's full 500ms range", () => {
  const html = render({ snap: snap({ enabled: true }) });
  assert.match(html, /max="500"/);
});

test("enabled groups render their commit-on-release sliders and number inputs", () => {
  const html = render({
    audio: audio({
      ducking: { enabled: true, amountDb: 12, attackMs: 25, releaseMs: 250 },
      loudness: { enabled: true, targetLufs: -16 },
      voiceHighpass: { enabled: true, hz: 80 },
    }),
    snap: snap({ enabled: true }),
  });
  // Slider tracks for each numeric control (3 duck + 1 loudness + 1 highpass
  // + 2 snap = 7) plus their paired number inputs.
  const sliderCount = html.split('data-slot="slider"').length - 1;
  assert.ok(
    sliderCount >= 7,
    `expected at least 7 sliders, saw ${sliderCount}`
  );
  assert.match(html, /value="12"/);
  assert.match(html, /value="-16"/);
  assert.match(html, /value="80"/);
  assert.match(html, /value="120"/);
  assert.match(html, /value="24"/);
});

test("de-essing group toggle and intensity slider render when enabled, with an honest caption", () => {
  const html = render({
    audio: audio({ deEsser: { enabled: true, intensity: 0.5 } }),
  });
  assert.match(html, /data-audio-deess/);
  assert.match(html, /De-essing/);
  assert.match(html, /value="0.5"/);
  assert.match(html, /Tames harsh sibilants/);
});

test("de-essing group hides the intensity slider when disabled but keeps the toggle and caption", () => {
  const html = render();
  assert.match(html, /data-audio-deess/);
  assert.doesNotMatch(html, /value="0.5"/);
  assert.match(html, /Tames harsh sibilants/);
});

test("disabled groups hide their numeric controls but keep the toggle and caption", () => {
  const html = render();
  assert.doesNotMatch(html, /value="12"/);
  assert.match(html, /data-audio-duck/);
  assert.match(html, /Ducking lowers music under speech on export/);
});

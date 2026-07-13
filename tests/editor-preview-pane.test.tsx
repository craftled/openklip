import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorPreviewPane } from "../web/components/editor/editor-preview-pane.tsx";

const audioDefaults = {
  ducking: { amountDb: 12, attackMs: 25, enabled: false, releaseMs: 250 },
  deEsser: { enabled: false, intensity: 0.5 },
  loudness: { enabled: false, mode: "single" as const, targetLufs: -16 },
  noiseReduction: { enabled: false, nr: 12 },
  voiceHighpass: { enabled: false, hz: 80 },
};

const cutSnapDefaults = {
  crossfadeMs: 24,
  enabled: false,
  maxShiftMs: 120,
  mode: "off" as const,
};

const timelineProps = {
  broll: [],
  curSec: 0,
  durationSamples: 48_000,
  durationSec: 1,
  graphics: [],
  onClipTiming: () => undefined,
  onSeek: () => undefined,
  onSelect: () => undefined,
  onWordClick: () => undefined,
  ranges: [{ endSec: 1, startSec: 0 }],
  sampleRate: 48_000,
  selected: null,
  selRange: null,
  stills: [],
  titles: [],
  wordSpans: [],
  zooms: [],
};

function renderPane() {
  return renderToStaticMarkup(
    <EditorPreviewPane
      activeCoverBroll={false}
      activePipBroll={false}
      activeSplitBroll={false}
      audio={{
        audio: audioDefaults,
        onPatchAudio: () => undefined,
        onPatchSnap: () => undefined,
        snap: cutSnapDefaults,
      }}
      brollRef={{ current: null }}
      captionGroups={[]}
      captionsOn={false}
      curSample={0}
      cutCount={0}
      exportAspect="source"
      exportDefaultResolution="1080"
      exportDisabled={false}
      exporting={false}
      exportLabel="Export"
      exportSettingsCrop={{ focusX: 0.5, focusY: 0.5, scale: 1 }}
      fmtTime={(sec) => String(sec)}
      graphics={[]}
      keepMoment={() => undefined}
      keptDurationSec={1}
      mediaVersion={1}
      musicBedCount={0}
      musicMuted={false}
      musicRef={{ current: null }}
      onCycleSpeed={() => undefined}
      onExport={() => undefined}
      onFocusTranscriptSearch={() => undefined}
      onFullscreen={() => undefined}
      onOrientationChange={() => undefined}
      onPlayToggle={() => undefined}
      onPreviewClick={() => undefined}
      onSafeAreaGuideChange={() => undefined}
      onSeekFraction={() => undefined}
      onToggleCaptions={() => undefined}
      onToggleMute={() => undefined}
      onTogglePip={() => undefined}
      onToggleVignette={() => undefined}
      orientation="landscape"
      outPos={0}
      pendingSaves={0}
      playing={false}
      previewMuted={false}
      previewPip={false}
      previewRate={1}
      previewReframe={false}
      safeAreaGuide="off"
      sampleRate={48_000}
      slug="demo"
      sourceFps={30}
      sourceHeight={1080}
      sourceWidth={1920}
      sweepRef={{ current: null }}
      timeline={timelineProps}
      titles={[]}
      videoRef={{ current: null }}
      vignetteOn={false}
      zoomScale={1}
    />
  );
}

// better-ui principle 13 (minimum hit area): the compact chip row below the
// preview (rounded-full px-1 py-px text-[10px]) sits several chips wide, so a
// large horizontal pseudo-element would collide with the next chip; use
// vertical-only slop instead. All four chips — the two raw buttons (Search
// transcript, Vignette) and the two drawer triggers (Timeline, Improve sound) —
// must look identical: compact size plus the same invisible pseudo-element hit
// slop. The drawer triggers keep an "h-auto sm:h-auto" override so the Button's
// own responsive height doesn't inflate them past the raw chips.
test("EditorPreviewPane 'Search transcript' chip gets vertical hit slop via a pseudo-element, chips stay compact", () => {
  const html = renderPane();
  const idx = html.indexOf("Search transcript");
  assert.ok(idx > -1, "chip text renders");
  const buttonStart = html.lastIndexOf("<button", idx);
  const buttonOpenTag = html.slice(
    buttonStart,
    html.indexOf(">", buttonStart) + 1
  );
  assert.match(buttonOpenTag, /\brelative\b/);
  assert.match(buttonOpenTag, /after:absolute/);
  assert.match(buttonOpenTag, /after:-inset-y-2/);
  assert.match(buttonOpenTag, /after:inset-x-0/);
  // Visible chip stays compact.
  assert.match(buttonOpenTag, /px-1 py-px text-\[10px\]/);
});

test("EditorPreviewPane vignette toggle chip gets vertical hit slop via a pseudo-element, stays compact", () => {
  const html = renderPane();
  const idx = html.indexOf("Vignette");
  assert.ok(idx > -1, "vignette chip text renders");
  const buttonStart = html.lastIndexOf("<button", idx);
  const buttonOpenTag = html.slice(
    buttonStart,
    html.indexOf(">", buttonStart) + 1
  );
  assert.match(buttonOpenTag, /\brelative\b/);
  assert.match(buttonOpenTag, /after:absolute/);
  assert.match(buttonOpenTag, /after:-inset-y-2/);
  assert.match(buttonOpenTag, /after:inset-x-0/);
  assert.match(buttonOpenTag, /px-1 py-px text-\[10px\]/);
});

test("EditorPreviewPane Timeline drawer trigger stays compact and gets the same pseudo hit slop as the sibling chips", () => {
  const html = renderPane();
  const idx = html.indexOf(">Timeline<");
  assert.ok(idx > -1, "Timeline trigger text renders");
  const buttonStart = html.lastIndexOf("<button", idx);
  const buttonOpenTag = html.slice(
    buttonStart,
    html.indexOf(">", buttonStart) + 1
  );
  // Compact like Search transcript / Vignette — not inflated to Button height.
  assert.match(buttonOpenTag, /px-1/);
  assert.match(buttonOpenTag, /py-px/);
  assert.match(buttonOpenTag, /text-\[10px\]/);
  assert.match(buttonOpenTag, /\bh-auto\b/);
  assert.match(buttonOpenTag, /sm:h-auto\b/);
  // Same invisible hit-slop technique as the raw chips.
  assert.match(buttonOpenTag, /\brelative\b/);
  assert.match(buttonOpenTag, /after:absolute/);
  assert.match(buttonOpenTag, /after:-inset-y-2/);
  assert.match(buttonOpenTag, /after:inset-x-0/);
});

test("EditorPreviewPane 'Improve sound' drawer trigger stays compact and gets the same pseudo hit slop as the sibling chips", () => {
  const html = renderPane();
  const idx = html.indexOf(">Improve sound<");
  assert.ok(idx > -1, "Improve sound trigger text renders");
  const buttonStart = html.lastIndexOf("<button", idx);
  const buttonOpenTag = html.slice(
    buttonStart,
    html.indexOf(">", buttonStart) + 1
  );
  assert.match(buttonOpenTag, /px-1/);
  assert.match(buttonOpenTag, /py-px/);
  assert.match(buttonOpenTag, /text-\[10px\]/);
  assert.match(buttonOpenTag, /\bh-auto\b/);
  assert.match(buttonOpenTag, /sm:h-auto\b/);
  assert.match(buttonOpenTag, /\brelative\b/);
  assert.match(buttonOpenTag, /after:absolute/);
  assert.match(buttonOpenTag, /after:-inset-y-2/);
  assert.match(buttonOpenTag, /after:inset-x-0/);
});

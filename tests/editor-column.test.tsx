import assert from "node:assert/strict";
import { test } from "node:test";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CutTransitionSweepHandle } from "../web/components/cut-transition-sweep.tsx";
import {
  EditorColumn,
  type EditorColumnProps,
} from "../web/components/editor/editor-column.tsx";

function minimalTranscriptProps(): EditorColumnProps["transcript"] {
  return {
    activeMatchRange: null,
    curSample: 0,
    inBroll: () => false,
    inZoom: () => false,
    matchRanges: [],
    onCutSelection: () => undefined,
    onRestoreSelection: () => undefined,
    onSelectRange: () => undefined,
    onTextEdit: () => undefined,
    search: null,
    selRange: null,
    showProvenance: false,
    words: [
      {
        deleted: false,
        endSample: 48_000,
        id: "w0",
        startSample: 0,
        text: "hello",
      },
    ],
  };
}

function minimalPreviewProps(): EditorColumnProps["preview"] {
  return {
    activeCoverBroll: false,
    activePipBroll: false,
    activeSplitBroll: false,
    brollRef: createRef<HTMLVideoElement>(),
    captionGroups: [],
    captionStyleId: "boxed",
    captionsOn: true,
    curSample: 0,
    cutCount: 2,
    exportAspect: "16:9",
    exportDefaultResolution: "1080",
    exportDisabled: false,
    exportLabel: "Export",
    exportSettingsCrop: { focusX: 0.5, focusY: 0.5, scale: 1 },
    exporting: false,
    fmtTime: (sec: number) => sec.toFixed(1),
    graphics: [],
    keptDurationSec: 10,
    mediaVersion: 0,
    musicBedCount: 0,
    musicMuted: false,
    onCycleSpeed: () => undefined,
    onExport: async () => undefined,
    onFullscreen: () => undefined,
    onOrientationChange: () => undefined,
    onPlayToggle: async () => undefined,
    onPreviewClick: () => undefined,
    onSeekFraction: () => undefined,
    onToggleCaptions: () => undefined,
    onToggleMusicMute: undefined,
    onToggleMute: () => undefined,
    onTogglePip: () => undefined,
    onSafeAreaGuideChange: () => undefined,
    orientation: "landscape",
    outPos: 0,
    pendingSaves: 0,
    playing: false,
    previewMuted: false,
    previewPip: false,
    previewRate: 1,
    previewReframe: false,
    sampleRate: 48_000,
    safeAreaGuide: "off",
    slug: "demo",
    sourceFps: 30,
    sourceHeight: 1080,
    sourceWidth: 1920,
    sweepRef: createRef<CutTransitionSweepHandle>(),
    titles: [],
    videoRef: createRef<HTMLVideoElement>(),
    vignetteOn: false,
    zoomScale: 1,
    musicRef: createRef<HTMLAudioElement>(),
  };
}

function minimalProps(
  overrides: Partial<EditorColumnProps> = {}
): EditorColumnProps {
  return {
    preview: minimalPreviewProps(),
    settings: {
      activeSection: "appearance",
      defaultAgent: "claude-sonnet-4-6",
      export1080: true,
      onDefaultAgentChange: () => undefined,
      onExport1080Change: () => undefined,
    },
    settingsOpen: false,
    transcript: minimalTranscriptProps(),
    ...overrides,
  };
}

test("EditorColumn renders editor workspace with data-editor-column", () => {
  const html = renderToStaticMarkup(<EditorColumn {...minimalProps()} />);
  assert.match(html, /data-editor-column/);
  assert.match(html, /demo/);
  assert.match(html, /2 cuts/);
  assert.match(html, /16:9/);
  assert.match(html, /group\/preview/);
  assert.match(html, /hello/);
});

test("EditorColumn renders settings view when settingsOpen", () => {
  const html = renderToStaticMarkup(
    <EditorColumn {...minimalProps({ settingsOpen: true })} />
  );
  assert.doesNotMatch(html, /data-editor-column/);
  assert.match(html, /Appearance/);
});

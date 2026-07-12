import assert from "node:assert/strict";
import { test } from "node:test";
import type { CleanupReport } from "@engine/cleanup";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ConfigPanel,
  type ConfigPanelProps,
} from "../web/components/config/config-panel.tsx";

const emptyCleanupReport: CleanupReport = {
  candidates: [],
  categoryCounts: {
    hesitation: 0,
    hedging: 0,
    repeat: 0,
    "dead-air": 0,
  },
  config: {
    minSec: 0.7,
    keepPadSec: 0.15,
    categories: { hesitation: true, hedging: false, repeat: false },
  },
  deadAirCount: 0,
  estSavedSec: 0,
  fillerCount: 0,
  warnings: [],
};

function minimalCleanupProps(): ConfigPanelProps["cleanup"] {
  return {
    applying: false,
    lastUndo: null,
    onApply: () => undefined,
    onApplyAllSafe: () => undefined,
    onApplyAllSilences: () => undefined,
    onApplyEnabled: () => undefined,
    onPatchCleanupThreshold: () => undefined,
    onRemoveSpan: () => undefined,
    onToggleCategory: () => undefined,
    onUndoLast: () => undefined,
    registeredSpans: [],
    report: emptyCleanupReport,
    slug: "demo",
  };
}

function minimalLookProps(): ConfigPanelProps["look"] {
  return {
    atSec: 0,
    captionStyle: "boxed",
    color: null,
    filter: "neutral",
    maxWords: 6,
    motionSpeed: 1,
    onCaptionStyle: () => undefined,
    onColor: () => undefined,
    onFilter: () => undefined,
    onMaxWords: () => undefined,
    onMotionSpeed: () => undefined,
    onPadMs: () => undefined,
    onVignette: () => undefined,
    padMs: 50,
    reframe: {
      applying: false,
      applyingVision: false,
      exportSettings: {
        aspect: "16:9",
        crop: { focusX: 0.5, focusY: 0.5, scale: 1 },
        cropMode: "manual",
        layout: "fill",
      },
      hasSceneLog: false,
      onPatchExport: () => undefined,
      onRunVisionFocus: () => undefined,
      visionFocusAvailable: false,
    },
    slug: "demo",
    vignetteOn: false,
  };
}

function minimalProps(
  overrides: Partial<ConfigPanelProps> = {}
): ConfigPanelProps {
  return {
    activeTab: "look",
    cleanup: minimalCleanupProps(),
    closeLabel: "Hide config",
    edit: {
      addBroll: () => undefined,
      addStill: () => undefined,
      addTitle: () => undefined,
      addZoom: () => undefined,
      assetName: (id: string) => id,
      brollAssets: [],
      chosenAsset: "",
      chosenStillAsset: "",
      clearSelection: () => undefined,
      fmtTime: (sec: number) => sec.toFixed(1),
      graphicPlayheadOffset: null,
      hasOverlayInspector: false,
      newKeyframeProperty: "opacity",
      onChosenAssetChange: () => undefined,
      onChosenStillAssetChange: () => undefined,
      onNewKeyframePropertyChange: () => undefined,
      onTitlePosChange: () => undefined,
      onTitleTextChange: () => undefined,
      presetOf: () => "",
      projectBroll: [],
      provenanceDisplay: false,
      removeSelected: () => undefined,
      reorderBrollOrder: () => undefined,
      sampleRate: 48_000,
      selBroll: null,
      selGraphic: null,
      selGraphicKeyframes: [],
      selGraphicValidation: null,
      selRange: null,
      selStill: null,
      selTitle: null,
      selZoom: null,
      selectedId: undefined,
      setSelected: () => undefined,
      stillAssets: [],
      titlePos: "lower",
      titleText: "",
      updateBroll: () => undefined,
      updateGraphic: () => undefined,
      updateStill: () => undefined,
      updateTitle: () => undefined,
      updateZoom: () => undefined,
    },
    history: {
      currentRevision: 0,
      currentWords: [],
      focusRevision: null,
      onFocusRevisionHandled: () => undefined,
      onReverted: () => undefined,
      showProvenance: false,
      slug: "demo",
    },
    inspectorSummary: null,
    look: minimalLookProps(),
    onClose: () => undefined,
    onTabChange: () => undefined,
    project: {
      applyingVision: false,
      assets: [],
      assetName: (id: string) => id,
      audio: undefined,
      audioMeasure: null,
      audioMeasuring: false,
      brief: "",
      bpmByAssetId: {},
      bpmDetectingAssetId: null,
      chosenGraphicTemplate: "",
      chosenMusicAsset: "",
      detectingHighlights: false,
      durationSec: 60,
      graphicBeatCount: 4,
      graphicMusicAssetId: "",
      graphicParamDraft: {},
      graphicSpanMode: "phrase",
      graphicTemplates: [],
      highlights: undefined,
      musicAssets: [],
      musicPlacements: [],
      onAddGraphic: () => undefined,
      onAddGraphicAtCuts: () => undefined,
      onAddMusic: () => undefined,
      onAssembled: () => undefined,
      onBeatCountChange: () => undefined,
      onChooseGraphicMusicAsset: () => undefined,
      onChooseGraphicTemplate: () => undefined,
      onChooseMusicAsset: () => undefined,
      onDetectBpm: async () => undefined,
      onDetectHighlights: async () => undefined,
      onGraphicParamChange: () => undefined,
      onGraphicSpanModeChange: () => undefined,
      onMeasureAudio: async () => undefined,
      onPatchAudio: () => undefined,
      onPatchMusic: () => undefined,
      onPatchSnap: () => undefined,
      onRemoveMusic: () => undefined,
      onSaveBrief: async () => ({ ok: true as const }),
      onSeekHighlight: () => undefined,
      pendingSaves: 0,
      sampleRate: 48_000,
      slug: "demo",
      snap: undefined,
    },
    tools: {
      curSec: 0,
      fmtTime: (sec: number) => sec.toFixed(1),
      fullDurationSec: 60,
      keptDurationSec: 45,
      loop: null,
      onClearLoop: () => undefined,
      onSetLoop: () => undefined,
      outPos: 0,
      timeline: {
        broll: [],
        curSec: 0,
        durationSamples: 48_000 * 60,
        durationSec: 60,
        fmtTime: (sec: number) => sec.toFixed(1),
        graphics: [],
        onClipTiming: () => undefined,
        onSeek: () => undefined,
        onSelect: () => undefined,
        onWordClick: () => undefined,
        ranges: [],
        sampleRate: 48_000,
        selected: null,
        selRange: null,
        stills: [],
        titles: [],
        wordSpans: [],
        zooms: [],
      },
    },
    ...overrides,
  };
}

test("ConfigPanel renders shell and tab bar", () => {
  const html = renderToStaticMarkup(<ConfigPanel {...minimalProps()} />);
  assert.match(html, /data-config-panel/);
  assert.match(html, />Config</);
  assert.match(html, /data-config-tab-bar/);
  assert.match(html, />Edit</);
  assert.match(html, />Look</);
  assert.match(html, />Project</);
  assert.match(html, />Cleanup</);
  assert.match(html, />Tools</);
  assert.match(html, />History</);
});

test("ConfigPanel renders look tab content when active", () => {
  const html = renderToStaticMarkup(
    <ConfigPanel {...minimalProps({ activeTab: "look" })} />
  );
  assert.match(html, /data-look-tab/);
});

test("ConfigPanel renders edit empty state without selection", () => {
  const html = renderToStaticMarkup(
    <ConfigPanel {...minimalProps({ activeTab: "edit" })} />
  );
  assert.match(html, /Select words in the transcript/);
});

test("ConfigPanel renders inspector header when summary is provided", () => {
  const html = renderToStaticMarkup(
    <ConfigPanel
      {...minimalProps({
        inspectorSummary: {
          badge: "B-roll",
          icon: "film",
          label: "aerial-01",
          meta: [{ icon: "clock", label: "Span", value: "0:04-0:08" }],
        },
      })}
    />
  );
  assert.match(html, /data-config-inspector-summary/);
  assert.match(html, /aerial-01/);
});

test("ConfigPanel close button exposes close label", () => {
  const html = renderToStaticMarkup(
    <ConfigPanel {...minimalProps({ closeLabel: "Hide config" })} />
  );
  assert.match(html, /aria-label="Hide config"/);
});

test("ConfigPanel renders project tab sections when active", () => {
  const html = renderToStaticMarkup(
    <ConfigPanel {...minimalProps({ activeTab: "project" })} />
  );
  assert.match(html, />Brief</);
  assert.match(html, />Graphics</);
  assert.doesNotMatch(html, /data-cleanup-panel/);
});

test("ConfigPanel renders cleanup tab content when active", () => {
  const html = renderToStaticMarkup(
    <ConfigPanel {...minimalProps({ activeTab: "cleanup" })} />
  );
  assert.match(html, /data-cleanup-panel/);
});

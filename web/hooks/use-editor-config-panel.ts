"use client";

import { DEFAULT_CAPTION_STYLE } from "@engine/caption-styles";
import type { ColorAdjust, ExportSettings, Filter } from "@engine/edl";
import type { Keyframe } from "@engine/keyframes";
import type { ReactNode } from "react";
import type { ConfigCleanupTabProps } from "@/components/config/config-cleanup-tab";
import type { ConfigEditTabProps } from "@/components/config/config-edit-tab";
import type { ConfigHistoryTabProps } from "@/components/config/config-panel";
import type { ConfigProjectTabProps } from "@/components/config/config-project-tab";
import type { LookTabPanelProps } from "@/components/config/look-tab-panel";
import type { GraphicSpanMode } from "@/components/graphic-picker-controls";
import {
  type UseConfigPanelParams,
  useConfigPanel,
} from "@/hooks/use-config-panel";
import type { UseEditorSelectionReturn } from "@/hooks/use-editor-selection";
import type { ConfigInspectorSummaryInput } from "@/lib/config-inspector";
import type { ConfigTabId } from "@/lib/config-tabs";
import type { EditorProject, EditorSelection } from "@/lib/editor-types";
import { formatEditorTime } from "@/lib/format-time";

type SelectionDerived = Pick<
  UseEditorSelectionReturn,
  | "graphicPlayheadOffset"
  | "hasOverlayInspector"
  | "presetOf"
  | "selBroll"
  | "selGraphic"
  | "selGraphicKeyframes"
  | "selGraphicLabel"
  | "selGraphicValidation"
  | "selStill"
  | "selTitle"
  | "selZoom"
>;

export interface UseEditorConfigPanelParams {
  activeTab: ConfigTabId;
  applyingVision: boolean;
  assetName: (id: string) => string;
  audioMeasure: ConfigProjectTabProps["audioMeasure"];
  audioMeasuring: boolean;
  bpmDetectingAssetId: string | null;
  brollAssets: ConfigEditTabProps["brollAssets"];
  chosenAsset: string;
  chosenGraphicTemplate: string;
  chosenMusicAsset: string;
  chosenStillAsset: string;
  cleanupActions: Pick<
    ConfigCleanupTabProps,
    | "lastUndo"
    | "onApply"
    | "onApplyAllSafe"
    | "onApplyAllSilences"
    | "onApplyEnabled"
    | "onPatchCleanupThreshold"
    | "onPendingHighlightChange"
    | "onRemoveSpan"
    | "onToggleCategory"
    | "onUndoLast"
  >;
  cleanupReport: ConfigCleanupTabProps["report"];
  clearSelection: () => void;
  color: ColorAdjust | null;
  curSec: number;
  detectingHighlights: boolean;
  editActions: Pick<
    ConfigEditTabProps,
    | "addBroll"
    | "addStill"
    | "addTitle"
    | "addZoom"
    | "removeSelected"
    | "reorderBrollOrder"
    | "updateBroll"
    | "updateGraphic"
    | "updateStill"
    | "updateTitle"
    | "updateZoom"
  >;
  exportSettings: ExportSettings;
  filter: Filter;
  fullDur: number;
  graphicActions: Pick<
    ConfigProjectTabProps,
    | "onAddGraphic"
    | "onAddGraphicAtCuts"
    | "onBeatCountChange"
    | "onChooseGraphicMusicAsset"
    | "onChooseGraphicTemplate"
    | "onGraphicParamChange"
    | "onGraphicSpanModeChange"
    | "onReloadGraphicTemplates"
  >;
  graphicBeatCount: number;
  graphicMusicAssetId: string;
  graphicParamDraft: Record<string, string | number | boolean>;
  graphicSpanMode: GraphicSpanMode;
  graphicTemplates: ConfigProjectTabProps["graphicTemplates"];
  historyFocusRevision: number | null;
  keptDuration: number;
  lookActions: Pick<
    LookTabPanelProps,
    | "onCaptionStyle"
    | "onColor"
    | "onFilter"
    | "onMaxWords"
    | "onMotionSpeed"
    | "onPadMs"
  >;
  loop: { inSec: number; outSec: number } | null;
  motionSpeed: number;
  musicAssets: ConfigProjectTabProps["musicAssets"];
  musicBpmByAsset: ConfigProjectTabProps["bpmByAssetId"];
  newKeyframeProperty: Keyframe["property"];
  onChosenAssetChange: (id: string) => void;
  onChosenStillAssetChange: (id: string) => void;
  onClearLoop: () => void;
  onCloseConfig: () => void;
  onFocusRevisionHandled: () => void;
  onHistoryReverted: ConfigHistoryTabProps["onReverted"];
  onNewKeyframePropertyChange: (property: Keyframe["property"]) => void;
  onSetLoop: (loop: { inSec: number; outSec: number }) => void;
  onTabChange: (tab: ConfigTabId) => void;
  onTitlePosChange: ConfigEditTabProps["onTitlePosChange"];
  onTitleTextChange: ConfigEditTabProps["onTitleTextChange"];
  outPos: number;
  patchExport: LookTabPanelProps["reframe"]["onPatchExport"];
  pendingSaves: number;
  project: EditorProject;
  projectActions: Pick<
    ConfigProjectTabProps,
    | "onAddMusic"
    | "onChooseMusicAsset"
    | "onDetectBpm"
    | "onDetectHighlights"
    | "onMeasureAudio"
    | "onPatchAudio"
    | "onPatchMusic"
    | "onPatchSnap"
    | "onRemoveMusic"
    | "onSaveBrief"
    | "onSeekHighlight"
  >;
  provenanceDisplay: boolean;
  reframeActions: Pick<
    LookTabPanelProps["reframe"],
    "onRunVisionFocus" | "applyingVision"
  >;
  sampleRate: number;
  selected: EditorSelection;
  selection: SelectionDerived;
  selRange: readonly [number, number] | null;
  setSelected: ConfigEditTabProps["setSelected"];
  stillAssets: ConfigEditTabProps["stillAssets"];
  timelineCallbacks: UseConfigPanelParams["timelineCallbacks"];
  titlePos: ConfigEditTabProps["titlePos"];
  titleText: string;
  toggleVignette: LookTabPanelProps["onVignette"];
  vignetteOn: boolean;
  visionFocusAvailable: boolean;
}

export function useEditorConfigPanel(
  params: UseEditorConfigPanelParams
): ReactNode {
  const {
    activeTab,
    applyingVision,
    assetName,
    audioMeasure,
    audioMeasuring,
    bpmDetectingAssetId,
    brollAssets,
    chosenAsset,
    chosenGraphicTemplate,
    chosenMusicAsset,
    chosenStillAsset,
    cleanupActions,
    cleanupReport,
    clearSelection,
    color,
    curSec,
    detectingHighlights,
    editActions,
    exportSettings,
    filter,
    fullDur,
    graphicActions,
    graphicBeatCount,
    graphicMusicAssetId,
    graphicParamDraft,
    graphicSpanMode,
    graphicTemplates,
    historyFocusRevision,
    keptDuration,
    loop,
    lookActions,
    motionSpeed,
    musicAssets,
    musicBpmByAsset,
    newKeyframeProperty,
    onChosenAssetChange,
    onChosenStillAssetChange,
    onClearLoop,
    onCloseConfig,
    onFocusRevisionHandled,
    onHistoryReverted,
    onNewKeyframePropertyChange,
    onSetLoop,
    onTabChange,
    onTitlePosChange,
    onTitleTextChange,
    outPos,
    patchExport,
    pendingSaves,
    project,
    projectActions,
    provenanceDisplay,
    reframeActions,
    sampleRate: sr,
    selected,
    selection,
    selRange,
    setSelected,
    stillAssets,
    timelineCallbacks,
    titlePos,
    titleText,
    toggleVignette,
    vignetteOn,
    visionFocusAvailable,
  } = params;

  const {
    graphicPlayheadOffset,
    hasOverlayInspector,
    presetOf,
    selBroll,
    selGraphic,
    selGraphicKeyframes,
    selGraphicLabel,
    selGraphicValidation,
    selStill,
    selTitle,
    selZoom,
  } = selection;

  return useConfigPanel({
    activeTab,
    embedded: true,
    onCloseConfig,
    onTabChange,
    edit: {
      ...editActions,
      assetName,
      brollAssets,
      chosenAsset,
      chosenStillAsset,
      clearSelection,
      fmtTime: formatEditorTime,
      graphicPlayheadOffset,
      hasOverlayInspector,
      newKeyframeProperty,
      onChosenAssetChange,
      onChosenStillAssetChange,
      onNewKeyframePropertyChange,
      onTitlePosChange,
      onTitleTextChange,
      presetOf,
      projectBroll: project.broll ?? [],
      provenanceDisplay,
      sampleRate: sr,
      selBroll: selBroll ?? null,
      selGraphic: selGraphic ?? null,
      selGraphicKeyframes,
      selGraphicValidation,
      selRange,
      selStill: selStill ?? null,
      selTitle: selTitle ?? null,
      selZoom: selZoom ?? null,
      selectedId: selected?.id,
      setSelected,
      stillAssets,
      titlePos,
      titleText,
    },
    history: {
      currentRevision: project.revision ?? 0,
      currentWords: project.words.map((word) => ({
        deleted: word.deleted,
        id: word.id,
        text: word.text,
      })),
      focusRevision: historyFocusRevision,
      onFocusRevisionHandled,
      onReverted: onHistoryReverted,
      showProvenance: provenanceDisplay,
      slug: project.slug,
    },
    inspector: {
      assetName,
      fmtTime: formatEditorTime,
      graphicLabel: selGraphicLabel,
      sampleRate: sr,
      selBroll: selBroll ?? null,
      selGraphic: selGraphic
        ? {
            catalog:
              selGraphic.type === "json-render"
                ? selGraphic.catalog
                : undefined,
            startSample: selGraphic.startSample,
            template:
              selGraphic.type === "json-render"
                ? (selGraphic.catalog ?? "product-announcement")
                : selGraphic.template,
            type: selGraphic.type === "json-render" ? "json-render" : "html",
            validation: selGraphicValidation,
          }
        : null,
      selRange,
      selStill: selStill ?? null,
      selTitle: selTitle ?? null,
      selZoom: selZoom ?? null,
      wordStartSample: selRange
        ? (project.words[selRange[0]]?.startSample ?? null)
        : null,
    } satisfies ConfigInspectorSummaryInput,
    look: {
      atSec: curSec,
      captionStyle: project.captions?.style ?? DEFAULT_CAPTION_STYLE,
      color,
      filter,
      maxWords: project.captions?.maxWords ?? 6,
      motionSpeed,
      onVignette: toggleVignette,
      padMs: project.padMs ?? 50,
      reframe: {
        applying: pendingSaves > 0,
        applyingVision: reframeActions.applyingVision,
        exportSettings,
        hasSceneLog: Boolean(project.sceneLog),
        onPatchExport: patchExport,
        onRunVisionFocus: reframeActions.onRunVisionFocus,
        visionFocusAvailable,
      },
      slug: project.slug,
      vignetteOn,
      ...lookActions,
    },
    cleanup: {
      applying: pendingSaves > 0,
      registeredSpans: (project.cuts?.deadAir ?? []).map((span) => ({
        endSec: span.endSample / project.sampleRate,
        id: span.id,
        startSec: span.startSample / project.sampleRate,
      })),
      report: cleanupReport,
      slug: project.slug,
      ...cleanupActions,
    },
    project: {
      applyingVision,
      assets: project.assets ?? [],
      assetName,
      audio: project.audio,
      audioMeasure,
      audioMeasuring,
      brief: project.brief ?? "",
      bpmByAssetId: musicBpmByAsset,
      bpmDetectingAssetId,
      chosenGraphicTemplate,
      chosenMusicAsset,
      detectingHighlights,
      durationSec: project.durationSamples / sr,
      graphicBeatCount,
      graphicMusicAssetId,
      graphicParamDraft,
      graphicSpanMode,
      graphicTemplates,
      highlights: project.highlights,
      musicAssets,
      musicPlacements: project.music ?? [],
      multicam: project.multicam ?? null,
      onAssembled: onHistoryReverted,
      pendingSaves,
      sampleRate: sr,
      slug: project.slug,
      snap: project.cuts?.snap,
      ...graphicActions,
      ...projectActions,
    },
    playback: {
      curSec,
      fullDurationSec: fullDur,
      keptDurationSec: keptDuration,
      loop,
      onClearLoop,
      onSetLoop,
      outPos,
    },
    timeline: {
      assetName,
      assets: project.assets,
      broll: project.broll ?? [],
      graphics: project.graphics,
      music: project.music,
      sampleRate: sr,
      stills: project.stills,
      titles: project.titles ?? [],
      words: project.words,
      zooms: project.zooms ?? [],
    },
    timelineCallbacks,
  });
}

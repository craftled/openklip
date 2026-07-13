"use client";

import { buildTransitionGateFromProject } from "@engine/cut-transition-gate";
import type {
  ColorAdjust,
  Project as EngineProject,
  Filter,
} from "@engine/edl";
import {
  AudioSchema,
  CutSnapSchema,
  ExportSettingsSchema,
  effectiveRanges,
} from "@engine/edl";
import {
  exportAspectToOrientation,
  shouldApplyReframe,
} from "@engine/export-aspect";
import type { Keyframe } from "@engine/keyframes";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AgentChatProvider } from "@/components/agent-chat-context";
import { AgentSidebar } from "@/components/agent-sidebar";
import { withAssetKind } from "@/components/asset-bin";
import { CinemaPlayer } from "@/components/cinema-player";
import { buildCleanupCandidates } from "@/components/cleanup-panel";
import type { TimelineClipKind } from "@/components/edit-timeline";
import { EditorColumn } from "@/components/editor/editor-column";
import { EditorRightRail } from "@/components/editor/editor-right-rail";
import { EditorSidebarShortcuts } from "@/components/editor-sidebar-shortcuts";
import {
  type GraphicSpanMode,
  useGraphicTemplates,
} from "@/components/graphic-picker-controls";
import { PreviewOverlays } from "@/components/preview-overlays";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { useCleanupSilences } from "@/hooks/use-cleanup-tab-data";
import { useEditorChrome } from "@/hooks/use-editor-chrome";
import { useEditorConfigPanel } from "@/hooks/use-editor-config-panel";
import { useEditorExport } from "@/hooks/use-editor-export";
import { useEditorSelection } from "@/hooks/use-editor-selection";
import { useEditorTimeline } from "@/hooks/use-editor-timeline";
import { useLookControls } from "@/hooks/use-look-controls";
import { useMomentKeep } from "@/hooks/use-moment-keep";
import { useOverlayEditors } from "@/hooks/use-overlay-editors";
import { usePreviewPlayback } from "@/hooks/use-preview-playback";
import { useProjectConfigActions } from "@/hooks/use-project-config-actions";
import { useProjectSaves } from "@/hooks/use-project-saves";
import { useTranscriptEdits } from "@/hooks/use-transcript-edits";
import {
  type UseTranscriptSearchParams,
  useTranscriptSearch,
} from "@/hooks/use-transcript-search";
import { setDefaultAgentModel } from "@/lib/agent-preferences";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import { shouldAutoOpenConfig } from "@/lib/config-panel-behavior";
import type {
  EditorProject,
  EditorSelection,
  EditorWord,
} from "@/lib/editor-types";
import { formatEditorTime } from "@/lib/format-time";
import type { Orientation } from "@/lib/preview-layout";
import { buildProjectHoverContext } from "@/lib/project-context";
import type { ProjectListing } from "@/lib/project-list";
import type { EditorChatsSnapshot } from "../app/lib/editor-chats.ts";
import { type CaptionWord, groupCaptions } from "../src/captions.ts";
import { sourceSecForOutputPosition } from "../src/schedulerLogic.ts";

type Project = EditorProject;
type Selected = EditorSelection;

export function App({
  initialChats,
  initialProject,
  projects,
  visionFocusAvailable = false,
}: {
  initialChats: EditorChatsSnapshot;
  initialProject: Project;
  projects: ProjectListing[];
  visionFocusAvailable?: boolean;
}) {
  const {
    enqueueSave,
    pendingSaves,
    saveChainRef,
    saveError,
    saveErrorRef,
    setSaveError,
  } = useProjectSaves();
  const [project, setProject] = useState<Project>(initialProject);
  const [newKeyframeProperty, setNewKeyframeProperty] =
    useState<Keyframe["property"]>("opacity");
  const [captionsOn, setCaptionsOn] = useState(
    initialProject.captions?.enabled ?? true
  );
  const [vignetteOn, setVignetteOn] = useState(
    initialProject.look?.vignette ?? false
  );
  const [filter, setFilterState] = useState<Filter>(
    initialProject.look?.filter ?? "none"
  );
  const [color, setColorState] = useState<ColorAdjust | null>(
    initialProject.look?.color ?? null
  );
  const [motionSpeed, setMotionSpeed] = useState<number>(
    initialProject.motion?.speed ?? 1
  );
  const [selected, setSelected] = useState<Selected>(null);
  const [chosenAsset, setChosenAsset] = useState(
    initialProject.assets?.find((a) => (a.kind ?? "broll") === "broll")?.id ??
      ""
  );
  const [chosenStillAsset, setChosenStillAsset] = useState(
    initialProject.assets?.find((a) => a.kind === "still")?.id ?? ""
  );
  const [chosenMusicAsset, setChosenMusicAsset] = useState(
    initialProject.assets?.find((a) => a.kind === "music")?.id ?? ""
  );
  const [musicBpmByAsset, setMusicBpmByAsset] = useState<
    Record<string, { bpm: number; confidence: number }>
  >({});
  const {
    reloadTemplates: reloadGraphicTemplates,
    templates: graphicTemplates,
  } = useGraphicTemplates(project.slug);
  const [chosenGraphicTemplate, setChosenGraphicTemplate] = useState("");
  const [graphicParamDraft, setGraphicParamDraft] = useState<
    Record<string, string | number | boolean>
  >({});
  const [graphicSpanMode, setGraphicSpanMode] =
    useState<GraphicSpanMode>("seconds");
  const [graphicBeatCount, setGraphicBeatCount] = useState(4);
  const [graphicMusicAssetId, setGraphicMusicAssetId] = useState("");
  const [orientation, setOrientation] = useState<Orientation>(() =>
    exportAspectToOrientation(
      ExportSettingsSchema.parse(initialProject.export ?? {}).aspect
    )
  );

  const {
    cinema,
    colorScheme,
    configTab,
    defaultAgent,
    focusWordInHistory,
    historyFocusRevision,
    mobileRightPanel,
    onCloseConfig,
    onHistoryReverted,
    onSafeAreaGuideChange,
    provenanceDisplay,
    safeAreaGuide,
    setCinema,
    setConfigTab,
    setHistoryFocusRevision,
    setMobileRightPanel,
    setSettingsOpen,
    setSettingsSection,
    setSidebarView,
    settingsOpen,
    settingsSection,
    sidebarView,
    toggleColorScheme,
  } = useEditorChrome({
    setCaptionsOn,
    setChosenAsset,
    setChosenMusicAsset,
    setChosenStillAsset,
    setColorState,
    setFilterState,
    setMotionSpeed,
    setOrientation,
    setProject,
    setVignetteOn,
  });

  const {
    clearSel,
    clearTranscriptSelection,
    cutSelection,
    extendTranscriptSelection,
    reconcileTranscriptEdit,
    restoreSelection,
    selRange,
    selectTranscriptRange,
    toggleWord,
  } = useTranscriptEdits({ enqueueSave, setProject, setSelected });

  const [cleanupPendingWordIds, setCleanupPendingWordIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const onCleanupPendingHighlightChange = useCallback(
    (wordIds: readonly string[]) => {
      setCleanupPendingWordIds(new Set(wordIds));
    },
    []
  );
  useEffect(() => {
    setCleanupPendingWordIds(new Set());
  }, [project.slug]);

  const [titleText, setTitleText] = useState("");
  const [titlePos, setTitlePos] = useState<"lower" | "center" | "hero">(
    "lower"
  );
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;

  // F5: ranges feeds both the render path below and the CutScheduler's 60Hz
  // getRanges tick right after. rangesRef mirrors this memo so the scheduler
  // reads a cheap ref instead of recomputing effectiveRanges on every
  // requestAnimationFrame. Assigned during render (like projectRef.current
  // above), so it is already current by the time any effect runs, including
  // the first-mount CutScheduler construction below - no stale first frame.
  const ranges = useMemo(
    () =>
      project
        ? effectiveRanges(
            project as unknown as EngineProject,
            project.silences ?? undefined
          )
        : [],
    [project]
  );

  const playback = usePreviewPlayback({
    broll: project.broll ?? [],
    cinema,
    mediaVersion: project.mediaVersion,
    music: project.music,
    project: project as unknown as EngineProject,
    ranges,
    sampleRate: project.sampleRate,
    zooms: project.zooms ?? [],
  });
  const {
    activeCoverBroll,
    activePipBroll,
    activeSplitBroll,
    brollRef,
    curSample,
    curSec,
    cyclePreviewRate,
    keptDuration,
    loop,
    musicMuted,
    musicRef,
    onPlay,
    onPreviewClick,
    onSeek,
    onTimelineSelect: seekTimelineClip,
    outPos,
    playing,
    previewMuted,
    previewPip,
    previewRate,
    previewTransitionNoticeText,
    rangesRef,
    setLoop,
    sweepRef,
    toggleMusicMute,
    togglePreviewMute,
    togglePreviewPip,
    videoRef,
    zoomScale,
  } = playback;

  const sr = project.sampleRate;
  const projectHover = useMemo(
    () => buildProjectHoverContext(project, project.dirPath),
    [project]
  );
  const applyAssetUpdate = useCallback(
    (update: AssetBinUpdate) => {
      setProject((p) => ({
        ...p,
        assets: update.assets,
        ...(update.broll === undefined ? {} : { broll: update.broll }),
        ...(update.stills === undefined ? {} : { stills: update.stills }),
      }));
      const nextBroll = update.assets.find(
        (a) => (a.kind ?? "broll") === "broll"
      );
      if (nextBroll && !update.assets.some((a) => a.id === chosenAsset)) {
        setChosenAsset(nextBroll.id);
      }
      const nextMusic = update.assets.find((a) => a.kind === "music");
      if (nextMusic && !update.assets.some((a) => a.id === chosenMusicAsset)) {
        setChosenMusicAsset(nextMusic.id);
      }
    },
    [chosenAsset, chosenMusicAsset]
  );
  const captionGroups = useMemo(() => {
    const kept: CaptionWord[] = project.words
      .filter((w) => !w.deleted)
      .map((w) => ({
        text: w.text,
        startSec: w.startSample / sr,
        endSec: w.endSample / sr,
      }));
    return groupCaptions(kept, project.captions?.maxWords ?? 6);
  }, [project, sr]);
  const assetName = (id: string) =>
    project.assets.find((a) => a.id === id)?.name ?? id;
  const brollAssets = useMemo(
    () => project.assets.filter((a) => (a.kind ?? "broll") === "broll"),
    [project.assets]
  );
  const stillAssets = useMemo(
    () => project.assets.filter((a) => a.kind === "still"),
    [project.assets]
  );
  const musicAssets = useMemo(
    () => project.assets.filter((a) => a.kind === "music"),
    [project.assets]
  );
  const cleanupTabActive = sidebarView === "config" && configTab === "cleanup";
  const { silences: hydratedSilences } = useCleanupSilences({
    slug: project.slug,
    enabled: cleanupTabActive,
    projectSilences: project.silences,
  });
  const silencesForCleanup = project.silences ?? hydratedSilences;

  const cleanupReportView = useMemo(
    () =>
      buildCleanupCandidates(
        project as unknown as EngineProject,
        silencesForCleanup,
        project.brief
      ),
    [
      project.slug,
      project.words,
      project.cuts,
      silencesForCleanup,
      project.brief,
      project.broll,
      project.titles,
      project.zooms,
      project.stills,
      project.graphics,
    ]
  );

  const {
    activeSearchRange,
    focusTranscriptSearch,
    searchDialog,
    searchMatchRanges,
  } = useTranscriptSearch({
    enqueueSave,
    onSeek,
    selectTranscriptRange,
    setProject:
      setProject as unknown as UseTranscriptSearchParams["setProject"],
    slug: project.slug,
    words: project.words,
  });

  const { keepMoment } = useMomentKeep({
    enqueueSave,
    onSeek,
    setProject,
    slug: project.slug,
    words: project.words,
  });

  const {
    addBroll,
    addStill,
    addTitle,
    addZoom,
    onClipTiming,
    removeSelected,
    reorderBrollOrder,
    updateBroll,
    updateGraphic,
    updateStill,
    updateTitle,
    updateZoom,
  } = useOverlayEditors({
    chosenAsset,
    chosenStillAsset,
    clearSelection: clearSel,
    enqueueSave,
    project,
    selRange,
    selected,
    setProject,
    setSelected,
    setTitleText,
    titlePos,
    titleText,
  });

  const {
    addGraphicAtCutSeams,
    addGraphicPlacement,
    addMusicPlacement,
    applyAllSafeCleanup,
    applyAllSilences,
    applyCleanupCandidate,
    applyEnabledCleanup,
    applyingVision,
    audioMeasure,
    audioMeasuring,
    bpmDetectingAssetId,
    changeOrientation,
    detectMusicBpm,
    detectingHighlights,
    lastCleanupUndo,
    measureAudioLoudness,
    onChooseGraphicTemplate,
    onDetectHighlights,
    onRunVisionFocus,
    onSaveBrief,
    patchAudio,
    patchCleanupThreshold,
    patchExport,
    patchMusicPlacement,
    patchSnap,
    removeDeadAirSpan,
    removeMusicPlacement,
    toggleCleanupCategory,
    undoLastCleanup,
  } = useProjectConfigActions({
    cleanupReport: cleanupReportView,
    chosenGraphicTemplate,
    chosenMusicAsset,
    curSec,
    enqueueSave,
    graphicBeatCount,
    graphicMusicAssetId,
    graphicParamDraft,
    graphicSpanMode,
    graphicTemplates,
    musicBpmByAsset,
    project,
    sampleRate: sr,
    setChosenGraphicTemplate,
    setGraphicParamDraft,
    setMusicBpmByAsset,
    setOrientation,
    setProject,
    setSaveError,
  });

  const {
    changeColor,
    changeFilter,
    changeMotionSpeed,
    setCaptionStyle,
    setMaxWords,
    setPad,
    toggleCaptions,
    toggleVignette,
  } = useLookControls({
    enqueueSave,
    projectSlug: project.slug,
    setCaptionsOn,
    setColorState,
    setFilterState,
    setMotionSpeed,
    setProject,
    setVignetteOn,
  });

  const { export1080, exporting, onExport, setExport1080 } = useEditorExport({
    projectSlug: project.slug,
    saveChainRef,
    saveErrorRef,
  });

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
  } = useEditorSelection({
    curSample,
    project,
    selected,
  });

  useEffect(() => {
    if (!shouldAutoOpenConfig({ hasOverlayInspector, selRange })) {
      return;
    }
    setConfigTab("edit");
    setSidebarView("config");
  }, [hasOverlayInspector, selRange, selected?.id, selected?.kind]);

  const onTimelineSelect = useCallback(
    (kind: TimelineClipKind, id: string) => {
      clearTranscriptSelection();
      setSelected({ kind, id });
      seekTimelineClip(kind, id);
    },
    [clearTranscriptSelection, seekTimelineClip]
  );
  const onTimelineWordClick = useCallback(
    (index: number, shiftKey: boolean) => {
      if (shiftKey) {
        extendTranscriptSelection(index);
        return;
      }
      clearTranscriptSelection();
      toggleWord(project.words[index].id);
    },
    [
      clearTranscriptSelection,
      extendTranscriptSelection,
      project.words,
      toggleWord,
    ]
  );

  const fullDur = project.durationSamples / project.sampleRate;
  const inBroll = (w: EditorWord) =>
    (project.broll ?? []).some(
      (b) => w.startSample < b.endSample && w.endSample > b.startSample
    );
  const inZoom = (w: EditorWord) =>
    (project.zooms ?? []).some(
      (z) => w.startSample < z.endSample && w.endSample > z.startSample
    );
  const exportDisabled = exporting || pendingSaves > 0 || saveError !== null;
  const exportLabel = exporting
    ? "Exporting…"
    : pendingSaves > 0
      ? "Saving…"
      : "Export";

  const exportSettings = useMemo(
    () => ExportSettingsSchema.parse(project.export ?? {}),
    [project.export]
  );
  const previewReframe = shouldApplyReframe({
    aspect: exportSettings.aspect,
    crop: exportSettings.crop,
  });

  const timelineCallbacks = useMemo(
    () => ({
      curSec,
      durationSamples: project.durationSamples,
      durationSec: fullDur,
      onClipTiming,
      onSeek,
      onSelect: onTimelineSelect,
      onWordClick: onTimelineWordClick,
      ranges,
      sampleRate: sr,
      selected,
      selRange,
    }),
    [
      curSec,
      fullDur,
      onClipTiming,
      onSeek,
      onTimelineSelect,
      onTimelineWordClick,
      project.durationSamples,
      ranges,
      selected,
      selRange,
      sr,
    ]
  );

  const {
    timelineBroll,
    timelineGraphics,
    timelineLibraryStills,
    timelineMusic,
    timelinePlacedMusic,
    timelinePlacedStills,
    timelineTitles,
    timelineWords,
    timelineZooms,
  } = useEditorTimeline({
    assetName,
    assets: project.assets,
    broll: project.broll ?? [],
    graphics: project.graphics ?? [],
    music: project.music ?? [],
    sampleRate: sr,
    stills: project.stills ?? [],
    titles: project.titles ?? [],
    words: project.words,
    zooms: project.zooms ?? [],
  });

  const previewTimeline = useMemo(
    () => ({
      broll: timelineBroll,
      curSec: timelineCallbacks.curSec,
      durationSamples: timelineCallbacks.durationSamples,
      durationSec: timelineCallbacks.durationSec,
      fmtTime: formatEditorTime,
      graphics: timelineGraphics,
      libraryMusic: timelineMusic,
      libraryStills: timelineLibraryStills,
      music: timelinePlacedMusic,
      onClipTiming: timelineCallbacks.onClipTiming,
      onSeek: timelineCallbacks.onSeek,
      onSelect: timelineCallbacks.onSelect,
      onWordClick: timelineCallbacks.onWordClick,
      ranges: timelineCallbacks.ranges,
      sampleRate: timelineCallbacks.sampleRate,
      selected: timelineCallbacks.selected,
      selRange: timelineCallbacks.selRange,
      stills: timelinePlacedStills,
      titles: timelineTitles,
      wordSpans: timelineWords,
      zooms: timelineZooms,
    }),
    [
      timelineBroll,
      timelineCallbacks,
      timelineGraphics,
      timelineLibraryStills,
      timelineMusic,
      timelinePlacedMusic,
      timelinePlacedStills,
      timelineTitles,
      timelineWords,
      timelineZooms,
    ]
  );

  const previewAudio = useMemo(
    () => ({
      applying: pendingSaves > 0,
      audio: project.audio ?? AudioSchema.parse(undefined),
      measure: audioMeasure,
      measuring: audioMeasuring,
      onMeasure: measureAudioLoudness,
      onPatchAudio: patchAudio,
      onPatchSnap: patchSnap,
      snap: project.cuts?.snap ?? CutSnapSchema.parse(undefined),
    }),
    [
      audioMeasure,
      audioMeasuring,
      measureAudioLoudness,
      patchAudio,
      patchSnap,
      pendingSaves,
      project.audio,
      project.cuts?.snap,
    ]
  );

  const configPanel = useEditorConfigPanel({
    activeTab: configTab,
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
    cleanupActions: {
      lastUndo: lastCleanupUndo,
      onApply: applyCleanupCandidate,
      onApplyAllSafe: applyAllSafeCleanup,
      onApplyAllSilences: applyAllSilences,
      onApplyEnabled: applyEnabledCleanup,
      onPatchCleanupThreshold: patchCleanupThreshold,
      onPendingHighlightChange: onCleanupPendingHighlightChange,
      onRemoveSpan: removeDeadAirSpan,
      onToggleCategory: toggleCleanupCategory,
      onUndoLast: undoLastCleanup,
    },
    cleanupReport: cleanupReportView,
    clearSelection: clearSel,
    color,
    curSec,
    detectingHighlights,
    editActions: {
      addBroll,
      addStill,
      addTitle,
      addZoom,
      removeSelected,
      reorderBrollOrder,
      updateBroll,
      updateGraphic,
      updateStill,
      updateTitle,
      updateZoom,
    },
    exportSettings,
    filter,
    fullDur,
    graphicActions: {
      onAddGraphic: addGraphicPlacement,
      onAddGraphicAtCuts: addGraphicAtCutSeams,
      onBeatCountChange: setGraphicBeatCount,
      onChooseGraphicMusicAsset: setGraphicMusicAssetId,
      onChooseGraphicTemplate,
      onGraphicParamChange: (key, value) => {
        setGraphicParamDraft((prev) => ({ ...prev, [key]: value }));
      },
      onGraphicSpanModeChange: setGraphicSpanMode,
      onReloadGraphicTemplates: reloadGraphicTemplates,
    },
    graphicBeatCount,
    graphicMusicAssetId,
    graphicParamDraft,
    graphicSpanMode,
    graphicTemplates,
    historyFocusRevision,
    keptDuration,
    loop,
    lookActions: {
      onCaptionStyle: setCaptionStyle,
      onColor: changeColor,
      onFilter: changeFilter,
      onMaxWords: setMaxWords,
      onMotionSpeed: changeMotionSpeed,
      onPadMs: setPad,
    },
    motionSpeed,
    musicAssets,
    musicBpmByAsset,
    newKeyframeProperty,
    onChosenAssetChange: setChosenAsset,
    onChosenStillAssetChange: setChosenStillAsset,
    onClearLoop: () => setLoop(null),
    onCloseConfig,
    onFocusRevisionHandled: () => setHistoryFocusRevision(null),
    onHistoryReverted,
    onNewKeyframePropertyChange: setNewKeyframeProperty,
    onSetLoop: setLoop,
    onTabChange: setConfigTab,
    onTitlePosChange: setTitlePos,
    onTitleTextChange: setTitleText,
    outPos,
    patchExport,
    pendingSaves,
    project,
    projectActions: {
      onAddMusic: addMusicPlacement,
      onChooseMusicAsset: setChosenMusicAsset,
      onDetectBpm: detectMusicBpm,
      onDetectHighlights,
      onMeasureAudio: measureAudioLoudness,
      onPatchAudio: patchAudio,
      onPatchMusic: patchMusicPlacement,
      onPatchSnap: patchSnap,
      onRemoveMusic: removeMusicPlacement,
      onSaveBrief,
      onSeekHighlight: onSeek,
    },
    provenanceDisplay,
    reframeActions: { applyingVision, onRunVisionFocus },
    sampleRate: sr,
    selected,
    selection: {
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
    },
    selRange,
    setSelected,
    stillAssets,
    timelineCallbacks,
    titlePos,
    titleText,
    toggleVignette,
    vignetteOn,
    visionFocusAvailable,
  });

  return (
    <AgentChatProvider
      activeSlug={project.slug}
      initialChats={initialChats}
      projectTemplate={project.template}
    >
      <SidebarProvider
        className="min-h-screen flex-col overflow-auto bg-background text-foreground md:h-screen md:min-h-0 md:flex-row md:overflow-hidden"
        keyboardShortcut={false}
        style={
          {
            "--sidebar-width": "16rem",
            "--sidebar-width-icon": "3.25rem",
          } as CSSProperties
        }
      >
        {cinema && (
          <CinemaPlayer
            captionsOn={captionsOn}
            durationSec={keptDuration}
            exportDisabled={exportDisabled}
            exportLabel={exportLabel}
            getRanges={() => rangesRef.current}
            getTransition={() =>
              projectRef.current?.look?.transition ?? {
                type: "none",
                durationMs: 500,
              }
            }
            getTransitionGate={() =>
              buildTransitionGateFromProject(
                projectRef.current as unknown as EngineProject,
                rangesRef.current
              )
            }
            onClose={() => setCinema(false)}
            onExport={onExport}
            onToggleCaptions={toggleCaptions}
            overlay={(playerSec) => (
              <PreviewOverlays
                captionGroups={captionGroups}
                captionStyleId={project.captions?.style}
                captionsOn={captionsOn}
                curSample={Math.round(playerSec * sr)}
                graphics={project.graphics ?? []}
                sampleRate={sr}
                slug={project.slug}
                titles={project.titles ?? []}
              />
            )}
            previewTransitionNoticeText={previewTransitionNoticeText}
            projectName={project.slug}
            src={`/media/proxy.mp4?v=${project.mediaVersion ?? 0}`}
          />
        )}
        <AgentSidebar
          activeSlug={project.slug}
          assets={project.assets.map(withAssetKind)}
          colorScheme={colorScheme}
          configPanel={configPanel}
          keepMoment={keepMoment}
          mediaVersion={project.mediaVersion}
          onAssetsUpdated={applyAssetUpdate}
          onCloseSettings={() => setSettingsOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
          onSeek={onSeek}
          onSelectSettingsSection={setSettingsSection}
          onSidebarViewChange={setSidebarView}
          onToggleColorScheme={toggleColorScheme}
          projectHover={projectHover}
          projects={projects}
          sampleRate={project.sampleRate}
          settingsOpen={settingsOpen}
          settingsSection={settingsSection}
          sidebarView={sidebarView}
          words={project.words}
        />

        <SidebarContextBridge>
          {(agentSidebar) => (
            <SidebarProvider
              className="min-h-screen flex-1 flex-col overflow-auto bg-background text-foreground md:h-screen md:min-h-0 md:flex-row md:overflow-hidden"
              keyboardShortcut={false}
              style={
                {
                  "--sidebar-width": "30rem",
                  "--sidebar-width-icon": "3.25rem",
                } as CSSProperties
              }
            >
              <EditorSidebarShortcuts agentSidebar={agentSidebar} />
              {/* CENTER : preview + transcript (or settings) */}
              <EditorColumn
                preview={{
                  activeCoverBroll: Boolean(activeCoverBroll),
                  activePipBroll: Boolean(activePipBroll),
                  activeSplitBroll: Boolean(activeSplitBroll),
                  brollRef,
                  captionGroups,
                  captionStyleId: project.captions?.style,
                  captionsOn,
                  curSample,
                  cutCount: ranges.length,
                  exportAspect: exportSettings.aspect,
                  exportDefaultResolution: export1080 ? "1080" : "4k",
                  exportDisabled,
                  exportLabel,
                  exportSettingsCrop: exportSettings.crop,
                  exporting,
                  fmtTime: formatEditorTime,
                  graphics: project.graphics ?? [],
                  keepMoment,
                  keptDurationSec: keptDuration,
                  mediaVersion: project.mediaVersion ?? 0,
                  mobileChatOpen: mobileRightPanel === "chat",
                  musicBedCount: project.music?.length ?? 0,
                  musicMuted,
                  musicRef,
                  onCycleSpeed: cyclePreviewRate,
                  onExport,
                  onFocusTranscriptSearch: focusTranscriptSearch,
                  onFullscreen: () => setCinema(true),
                  onOpenChat: () => setMobileRightPanel("chat"),
                  onOrientationChange: changeOrientation,
                  onPlayToggle: onPlay,
                  onPreviewClick,
                  onSeekFraction: (frac) =>
                    onSeek(
                      sourceSecForOutputPosition(ranges, frac * keptDuration)
                    ),
                  onToggleCaptions: () => toggleCaptions(!captionsOn),
                  onToggleMusicMute: toggleMusicMute,
                  onToggleMute: togglePreviewMute,
                  onTogglePip: togglePreviewPip,
                  onToggleVignette: () => toggleVignette(!vignetteOn),
                  onSafeAreaGuideChange,
                  orientation,
                  outPos,
                  pendingSaves,
                  playing,
                  previewMuted,
                  previewPip,
                  previewRate,
                  previewReframe,
                  previewTransitionNoticeText,
                  sampleRate: sr,
                  safeAreaGuide,
                  slug: project.slug,
                  sourceFps: project.fps,
                  sourceHeight: project.height,
                  sourceWidth: project.width,
                  sweepRef,
                  audio: previewAudio,
                  timeline: previewTimeline,
                  titles: project.titles ?? [],
                  videoRef,
                  vignetteOn,
                  zoomScale,
                }}
                settings={{
                  activeSection: settingsSection,
                  defaultAgent,
                  export1080,
                  onDefaultAgentChange: setDefaultAgentModel,
                  onExport1080Change: setExport1080,
                }}
                settingsOpen={settingsOpen}
                transcript={{
                  activeMatchRange: activeSearchRange,
                  cleanupPendingWordIds,
                  curSample,
                  inBroll,
                  inZoom,
                  keepMoment,
                  matchRanges: searchMatchRanges,
                  onCutSelection: cutSelection,
                  onRestoreSelection: restoreSelection,
                  onSelectRange: selectTranscriptRange,
                  onTextEdit: reconcileTranscriptEdit,
                  onViewInHistory: provenanceDisplay
                    ? focusWordInHistory
                    : undefined,
                  selRange,
                  showProvenance: provenanceDisplay,
                  words: project.words,
                }}
              />
              {searchDialog}

              <EditorRightRail
                hidden={settingsOpen}
                mobilePanel={mobileRightPanel}
                onAssetsUpdated={applyAssetUpdate}
                onCloseMobilePanel={() => setMobileRightPanel(null)}
                slug={project.slug}
              />
            </SidebarProvider>
          )}
        </SidebarContextBridge>
      </SidebarProvider>
    </AgentChatProvider>
  );
}

function SidebarContextBridge({
  children,
}: {
  children: (context: ReturnType<typeof useSidebar>) => ReactNode;
}) {
  return children(useSidebar());
}

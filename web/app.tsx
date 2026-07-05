"use client";

import { DEFAULT_CAPTION_STYLE } from "@engine/caption-styles";
import type {
  ColorAdjust,
  Project as EngineProject,
  Filter,
} from "@engine/edl";
import { ExportSettingsSchema, effectiveRanges } from "@engine/edl";
import {
  exportAspectToOrientation,
  shouldApplyReframe,
} from "@engine/export-aspect";
import type { Keyframe } from "@engine/keyframes";
import { stampGuiWordProvenance } from "@engine/provenance-display";
import type { SafeAreaPlatform } from "@engine/safe-areas";
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
import {
  CHAT_WIDTH_DEFAULT,
  readStoredChatWidth,
} from "@/components/chat-resize-handle";
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
import { useConfigPanel } from "@/hooks/use-config-panel";
import { useEditorExport } from "@/hooks/use-editor-export";
import { useEditorSelection } from "@/hooks/use-editor-selection";
import { useLookControls } from "@/hooks/use-look-controls";
import { useOverlayEditors } from "@/hooks/use-overlay-editors";
import { usePreviewPlayback } from "@/hooks/use-preview-playback";
import { useProjectConfigActions } from "@/hooks/use-project-config-actions";
import { useProjectSaves } from "@/hooks/use-project-saves";
import {
  type UseTranscriptSearchParams,
  useTranscriptSearch,
} from "@/hooks/use-transcript-search";
import {
  type AgentModelId,
  DEFAULT_AGENT_MODEL,
  getDefaultAgentModel,
  setDefaultAgentModel,
  subscribeDefaultAgent,
} from "@/lib/agent-preferences";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import { shouldAutoOpenConfig } from "@/lib/config-panel-behavior";
import type { ConfigTabId } from "@/lib/config-tabs";
import type {
  EditorProject,
  EditorSelection,
  EditorWord,
} from "@/lib/editor-types";
import { formatEditorTime } from "@/lib/format-time";
import type { Orientation } from "@/lib/preview-layout";
import { buildProjectHoverContext } from "@/lib/project-context";
import type { ProjectListing } from "@/lib/project-list";
import {
  readProvenanceDisplayEnabled,
  subscribeProvenanceDisplay,
} from "@/lib/provenance-preferences";
import { visibleChatWidth } from "@/lib/right-rail-layout";
import {
  getSafeAreaGuidePlatform,
  setSafeAreaGuidePlatform,
} from "@/lib/safe-area-preferences";
import type { SettingsSectionId } from "@/lib/settings-navigation";
import {
  applyColorScheme,
  type ColorScheme,
  getColorScheme,
  setColorScheme,
  subscribeColorScheme,
} from "@/lib/theme-preferences";
import {
  reconcileTranscriptText,
  setWordRangeDeleted,
} from "@/lib/transcript-edit";
import { saveProjectEdits } from "../app/actions.ts";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionId>("appearance");
  const [defaultAgent, setDefaultAgent] =
    useState<AgentModelId>(DEFAULT_AGENT_MODEL);
  const [configOpen, setConfigOpen] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTabId>("look");
  const [mobileRightPanel, setMobileRightPanel] = useState<
    "chat" | "config" | null
  >(null);
  const [historyFocusRevision, setHistoryFocusRevision] = useState<
    number | null
  >(null);
  const focusWordInHistory = useCallback((revisionAfter: number) => {
    setConfigOpen(true);
    setMobileRightPanel("config");
    setConfigTab("history");
    setHistoryFocusRevision(revisionAfter);
  }, []);
  // Chat sidebar width (px), drag-adjustable. Default on server; the stored
  // value is read after mount so SSR and first client render agree.
  const [chatWidth, setChatWidth] = useState(CHAT_WIDTH_DEFAULT);
  useEffect(() => {
    setChatWidth(readStoredChatWidth());
  }, []);
  const resolvedChatWidth = visibleChatWidth(chatWidth, configOpen);
  const [cinema, setCinema] = useState(false);
  const [selAnchor, setSelAnchor] = useState<number | null>(null);
  const [selFocus, setSelFocus] = useState<number | null>(null);
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
  const graphicTemplates = useGraphicTemplates(project.slug);
  const [chosenGraphicTemplate, setChosenGraphicTemplate] = useState("");
  const [graphicParamDraft, setGraphicParamDraft] = useState<
    Record<string, string | number | boolean>
  >({});
  const [graphicSpanMode, setGraphicSpanMode] =
    useState<GraphicSpanMode>("seconds");
  const [graphicBeatCount, setGraphicBeatCount] = useState(4);
  const [graphicMusicAssetId, setGraphicMusicAssetId] = useState("");

  // G1: a GUI revert (HistoryPanel's onReverted prop) is the only place a
  // server action can rewrite an ALREADY-OPEN project's revision out from
  // under this component. `project` is a plain useState<Project> seeded
  // once from initialProject at mount (page.tsx keys the tree by slug, not
  // revision, so remounting on every edit isn't an option): without this,
  // the transcript/preview would keep showing pre-revert state, and the
  // next edit (toggleWord -> saveProjectEdits serializes the CLIENT's full
  // words deleted-map; same wholesale-state pattern in saveLook/saveZooms/
  // saveTitles/saveBroll) would silently resurrect it by overwriting the
  // just-restored project.json with the stale in-memory copy.
  //
  // Reseeds project plus every piece of client state this component itself
  // derives from initialProject at mount (captionsOn, vignetteOn, filter,
  // color, motionSpeed, chosenAsset/chosenStillAsset/chosenMusicAsset above),
  // mirroring that exact derivation rather than inventing a second one.
  // Deliberately leaves dirPath/mediaVersion/brief/silences alone: none of
  // those live in project.json, so revert never touches them (brief.md
  // especially; see saveBrief and HistoryList's groupHasBriefSet caveat for
  // a task revert that spans a brief-set entry).
  //
  // Any save already in flight when a revert lands is left to the existing
  // enqueueSave/saveError path (see toggleWord etc. below): it will still
  // write, just now on top of the reseeded state, which is the simplest
  // correct behavior available without a bigger in-flight-save cancellation
  // mechanism.
  //
  // Out of scope: a CLI/MCP revert (or any other out-of-band project.json
  // write) made while this editor is open has no signal to reseed from and
  // leaves the same stale client state behind; that is the same
  // pre-existing class of staleness as any other external edit racing an
  // open editor, not something this fix addresses.
  const onHistoryReverted = useCallback((restored: EngineProject) => {
    setProject((prev) => ({
      ...prev,
      ...(restored as unknown as Project),
      brief: prev.brief,
      dirPath: prev.dirPath,
      mediaVersion: prev.mediaVersion,
      silences: prev.silences,
    }));
    setCaptionsOn(restored.captions?.enabled ?? true);
    setVignetteOn(restored.look?.vignette ?? false);
    setFilterState(restored.look?.filter ?? "none");
    setColorState(restored.look?.color ?? null);
    setMotionSpeed(restored.motion?.speed ?? 1);
    setOrientation(
      exportAspectToOrientation(
        ExportSettingsSchema.parse(restored.export ?? {}).aspect
      )
    );
    setChosenAsset(
      restored.assets?.find((a) => (a.kind ?? "broll") === "broll")?.id ?? ""
    );
    setChosenStillAsset(
      restored.assets?.find((a) => a.kind === "still")?.id ?? ""
    );
    setChosenMusicAsset(
      restored.assets?.find((a) => a.kind === "music")?.id ?? ""
    );
  }, []);

  const [titleText, setTitleText] = useState("");
  const [titlePos, setTitlePos] = useState<"lower" | "center" | "hero">(
    "lower"
  );
  const [orientation, setOrientation] = useState<Orientation>(() =>
    exportAspectToOrientation(
      ExportSettingsSchema.parse(initialProject.export ?? {}).aspect
    )
  );
  const [safeAreaGuide, setSafeAreaGuide] = useState<SafeAreaPlatform>("off");
  useEffect(() => {
    setSafeAreaGuide(getSafeAreaGuidePlatform());
  }, []);
  const onSafeAreaGuideChange = useCallback((platform: SafeAreaPlatform) => {
    setSafeAreaGuide(platform);
    setSafeAreaGuidePlatform(platform);
  }, []);
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>("light");
  const [provenanceDisplay, setProvenanceDisplay] = useState(false);
  useEffect(() => {
    const storedColorScheme = getColorScheme();
    setColorSchemeState(storedColorScheme);
    applyColorScheme(storedColorScheme);
    return subscribeColorScheme(setColorSchemeState);
  }, []);

  useEffect(() => {
    setProvenanceDisplay(readProvenanceDisplayEnabled());
    return subscribeProvenanceDisplay(setProvenanceDisplay);
  }, []);

  useEffect(() => {
    setDefaultAgent(getDefaultAgentModel());
    return subscribeDefaultAgent(setDefaultAgent);
  }, []);
  const toggleColorScheme = useCallback(() => {
    setColorScheme(colorScheme === "dark" ? "light" : "dark");
  }, [colorScheme]);
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
  const cleanupReportView = useMemo(
    () =>
      buildCleanupCandidates(
        project as unknown as EngineProject,
        project.silences
      ),
    [
      project.slug,
      project.words,
      project.cuts,
      project.silences,
      project.broll,
      project.titles,
      project.zooms,
      project.stills,
      project.graphics,
    ]
  );

  const toggleWord = useCallback(
    (id: string) => {
      setProject((prev) => {
        const revisionAfter = (prev.revision ?? 0) + 1;
        const words = stampGuiWordProvenance(
          prev.words.map((w) =>
            w.id === id ? { ...w, deleted: !w.deleted } : w
          ),
          [id],
          revisionAfter
        );
        enqueueSave(() =>
          saveProjectEdits(prev.slug, {
            words: words.map((w) => ({ id: w.id, deleted: w.deleted })),
          })
        );
        return { ...prev, words };
      });
    },
    [enqueueSave]
  );

  const setTranscriptRangeDeleted = useCallback(
    (range: readonly [number, number], deleted: boolean) => {
      setProject((prev) => {
        const revisionAfter = (prev.revision ?? 0) + 1;
        const changedIds = prev.words
          .slice(range[0], range[1] + 1)
          .map((w) => w.id);
        const words = stampGuiWordProvenance(
          setWordRangeDeleted(prev.words, range, deleted),
          changedIds,
          revisionAfter
        );
        enqueueSave(() =>
          saveProjectEdits(prev.slug, {
            words: words.map((w) => ({
              id: w.id,
              deleted: w.deleted,
              text: w.text,
            })),
          })
        );
        return { ...prev, words };
      });
    },
    [enqueueSave]
  );

  const reconcileTranscriptEdit = useCallback(
    (editedText: string) => {
      setProject((prev) => {
        const revisionAfter = (prev.revision ?? 0) + 1;
        const words = stampGuiWordProvenance(
          reconcileTranscriptText(prev.words, editedText),
          prev.words.map((w) => w.id),
          revisionAfter
        );
        enqueueSave(() =>
          saveProjectEdits(prev.slug, {
            words: words.map((w) => ({
              id: w.id,
              deleted: w.deleted,
              text: w.text,
            })),
          })
        );
        return { ...prev, words };
      });
    },
    [enqueueSave]
  );

  const selRange =
    selAnchor != null && selFocus != null
      ? ([
          Math.min(selAnchor, selFocus),
          Math.max(selAnchor, selFocus),
        ] as const)
      : null;
  const clearSel = () => {
    setSelAnchor(null);
    setSelFocus(null);
  };
  const selectTranscriptRange = useCallback(
    (range: readonly [number, number] | null) => {
      setSelected(null);
      if (range) {
        setSelAnchor(range[0]);
        setSelFocus(range[1]);
      } else {
        setSelAnchor(null);
        setSelFocus(null);
      }
    },
    []
  );
  const cutSelection = useCallback(
    (range: readonly [number, number] | null = selRange) => {
      if (range) {
        setTranscriptRangeDeleted(range, true);
      }
    },
    [selRange, setTranscriptRangeDeleted]
  );
  const restoreSelection = useCallback(
    (range: readonly [number, number] | null = selRange) => {
      if (range) {
        setTranscriptRangeDeleted(range, false);
      }
    },
    [selRange, setTranscriptRangeDeleted]
  );

  const { activeSearchRange, searchField, searchMatchRanges } =
    useTranscriptSearch({
      enqueueSave,
      onSeek,
      selectTranscriptRange,
      setProject:
        setProject as unknown as UseTranscriptSearchParams["setProject"],
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
    applyCleanupCandidate,
    applyingVision,
    audioMeasure,
    audioMeasuring,
    bpmDetectingAssetId,
    changeOrientation,
    detectMusicBpm,
    detectingHighlights,
    measureAudioLoudness,
    onChooseGraphicTemplate,
    onDetectHighlights,
    onRunVisionFocus,
    onSaveBrief,
    patchAudio,
    patchExport,
    patchMusicPlacement,
    patchSnap,
    removeDeadAirSpan,
    removeMusicPlacement,
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
    setConfigOpen(true);
    setMobileRightPanel("config");
  }, [hasOverlayInspector, selRange, selected?.id, selected?.kind]);

  const onTimelineSelect = useCallback(
    (kind: TimelineClipKind, id: string) => {
      setSelAnchor(null);
      setSelFocus(null);
      setSelected({ kind, id });
      seekTimelineClip(kind, id);
    },
    [seekTimelineClip]
  );
  const onTimelineWordClick = useCallback(
    (index: number, shiftKey: boolean) => {
      if (shiftKey) {
        setSelected(null);
        setSelAnchor((prev) => (prev == null ? index : prev));
        setSelFocus(index);
        return;
      }
      setSelAnchor(null);
      setSelFocus(null);
      toggleWord(project.words[index].id);
    },
    [project.words, toggleWord]
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

  const onCloseConfig = useCallback(() => {
    if (mobileRightPanel === "config") {
      setMobileRightPanel(null);
      return;
    }
    setConfigOpen(false);
  }, [mobileRightPanel]);

  const configPanel = useConfigPanel({
    activeTab: configTab,
    onTabChange: setConfigTab,
    mobileRightPanel,
    onCloseConfig,
    edit: {
      addBroll,
      addStill,
      addTitle,
      addZoom,
      assetName,
      brollAssets,
      chosenAsset,
      chosenStillAsset,
      clearSelection: clearSel,
      fmtTime: formatEditorTime,
      graphicPlayheadOffset,
      hasOverlayInspector,
      newKeyframeProperty,
      onChosenAssetChange: setChosenAsset,
      onChosenStillAssetChange: setChosenStillAsset,
      onNewKeyframePropertyChange: setNewKeyframeProperty,
      onTitlePosChange: setTitlePos,
      onTitleTextChange: setTitleText,
      presetOf,
      projectBroll: project.broll ?? [],
      provenanceDisplay,
      removeSelected,
      reorderBrollOrder,
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
      updateBroll,
      updateGraphic,
      updateStill,
      updateTitle,
      updateZoom,
    },
    history: {
      currentRevision: project.revision ?? 0,
      currentWords: project.words.map((word) => ({
        deleted: word.deleted,
        id: word.id,
        text: word.text,
      })),
      focusRevision: historyFocusRevision,
      onFocusRevisionHandled: () => setHistoryFocusRevision(null),
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
    },
    look: {
      atSec: curSec,
      captionStyle: project.captions?.style ?? DEFAULT_CAPTION_STYLE,
      color,
      filter,
      maxWords: project.captions?.maxWords ?? 6,
      motionSpeed,
      onCaptionStyle: setCaptionStyle,
      onColor: changeColor,
      onFilter: changeFilter,
      onMaxWords: setMaxWords,
      onMotionSpeed: changeMotionSpeed,
      onPadMs: setPad,
      onVignette: toggleVignette,
      padMs: project.padMs ?? 50,
      reframe: {
        applying: pendingSaves > 0,
        applyingVision,
        exportSettings,
        hasSceneLog: Boolean(project.sceneLog),
        onPatchExport: patchExport,
        onRunVisionFocus,
        visionFocusAvailable,
      },
      slug: project.slug,
      vignetteOn,
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
      cleanupReport: cleanupReportView,
      deadAirSpans: (project.cuts?.deadAir ?? []).map((span) => ({
        id: span.id,
        startSec: span.startSample / project.sampleRate,
        endSec: span.endSample / project.sampleRate,
      })),
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
      onAddGraphic: addGraphicPlacement,
      onAddGraphicAtCuts: addGraphicAtCutSeams,
      onAddMusic: addMusicPlacement,
      onApplyAllSafeCleanup: applyAllSafeCleanup,
      onApplyCleanup: applyCleanupCandidate,
      onAssembled: onHistoryReverted,
      onBeatCountChange: setGraphicBeatCount,
      onChooseGraphicMusicAsset: setGraphicMusicAssetId,
      onChooseGraphicTemplate,
      onChooseMusicAsset: setChosenMusicAsset,
      onDetectBpm: detectMusicBpm,
      onDetectHighlights,
      onGraphicParamChange: (key, value) => {
        setGraphicParamDraft((prev) => ({ ...prev, [key]: value }));
      },
      onGraphicSpanModeChange: setGraphicSpanMode,
      onMeasureAudio: measureAudioLoudness,
      onPatchAudio: patchAudio,
      onPatchMusic: patchMusicPlacement,
      onPatchSnap: patchSnap,
      onRemoveDeadAirSpan: removeDeadAirSpan,
      onRemoveMusic: removeMusicPlacement,
      onSaveBrief,
      onSeekHighlight: onSeek,
      pendingSaves,
      sampleRate: sr,
      slug: project.slug,
      snap: project.cuts?.snap,
    },
    playback: {
      curSec,
      fullDurationSec: fullDur,
      keptDurationSec: keptDuration,
      loop,
      onClearLoop: () => setLoop(null),
      onSetLoop: setLoop,
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
    timelineCallbacks: {
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
    },
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
            projectName={project.slug}
            src={`/media/proxy.mp4?v=${project.mediaVersion ?? 0}`}
          />
        )}
        <AgentSidebar
          activeSlug={project.slug}
          assets={project.assets.map(withAssetKind)}
          mediaVersion={project.mediaVersion}
          onAssetsUpdated={applyAssetUpdate}
          onCloseSettings={() => setSettingsOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
          onSelectSettingsSection={setSettingsSection}
          projectHover={projectHover}
          projects={projects}
          sampleRate={project.sampleRate}
          settingsOpen={settingsOpen}
          settingsSection={settingsSection}
        />

        <SidebarContextBridge>
          {(agentSidebar) => (
            <SidebarProvider
              className="min-h-screen flex-1 flex-col overflow-auto bg-background text-foreground md:h-screen md:min-h-0 md:flex-row md:overflow-hidden"
              keyboardShortcut={false}
              style={
                {
                  "--sidebar-width": `${resolvedChatWidth}px`,
                  "--sidebar-width-icon": "3.25rem",
                } as CSSProperties
              }
            >
              <EditorSidebarShortcuts agentSidebar={agentSidebar} />
              {/* CENTER : preview + transcript (or settings) */}
              <EditorColumn
                agentSidebar={{
                  isMobile: agentSidebar.isMobile,
                  open: agentSidebar.open,
                  toggleSidebar: agentSidebar.toggleSidebar,
                }}
                preview={{
                  activeCoverBroll: Boolean(activeCoverBroll),
                  activePipBroll: Boolean(activePipBroll),
                  activeSplitBroll: Boolean(activeSplitBroll),
                  brollRef,
                  captionGroups,
                  captionStyleId: project.captions?.style,
                  captionsOn,
                  curSample,
                  exportSettingsCrop: exportSettings.crop,
                  exporting,
                  graphics: project.graphics ?? [],
                  keptDurationSec: keptDuration,
                  mediaVersion: project.mediaVersion ?? 0,
                  musicBedCount: project.music?.length ?? 0,
                  musicMuted,
                  musicRef,
                  onCycleSpeed: cyclePreviewRate,
                  onFullscreen: () => setCinema(true),
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
                  orientation,
                  outPos,
                  pendingSaves,
                  playing,
                  previewMuted,
                  previewPip,
                  previewRate,
                  previewReframe,
                  sampleRate: sr,
                  safeAreaGuide,
                  slug: project.slug,
                  sweepRef,
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
                toolbar={{
                  colorScheme,
                  configOpen,
                  cutCount: ranges.length,
                  exportAspect: exportSettings.aspect,
                  exportDefaultResolution: export1080 ? "1080" : "4k",
                  exportDisabled,
                  exportLabel,
                  exporting,
                  fmtTime: formatEditorTime,
                  fullDurationSec: fullDur,
                  keptDurationSec: keptDuration,
                  mobileRightPanel,
                  onExport,
                  onOpenChat: () => setMobileRightPanel("chat"),
                  onOpenConfig: () => setMobileRightPanel("config"),
                  onOrientationChange: changeOrientation,
                  onSafeAreaGuideChange,
                  onToggleColorScheme: toggleColorScheme,
                  onToggleConfig: () => setConfigOpen((open) => !open),
                  orientation,
                  pendingSaves,
                  safeAreaGuide,
                  sourceFps: project.fps,
                  sourceHeight: project.height,
                  sourceWidth: project.width,
                }}
                transcript={{
                  activeMatchRange: activeSearchRange,
                  curSample,
                  inBroll,
                  inZoom,
                  matchRanges: searchMatchRanges,
                  onCutSelection: cutSelection,
                  onRestoreSelection: restoreSelection,
                  onSelectRange: selectTranscriptRange,
                  onTextEdit: reconcileTranscriptEdit,
                  onViewInHistory: provenanceDisplay
                    ? focusWordInHistory
                    : undefined,
                  search: searchField,
                  selRange,
                  showProvenance: provenanceDisplay,
                  words: project.words,
                }}
              />

              <EditorRightRail
                chatWidth={chatWidth}
                configOpen={configOpen}
                configPanel={configPanel}
                hidden={settingsOpen}
                mobilePanel={mobileRightPanel}
                onAssetsUpdated={applyAssetUpdate}
                onChatWidthChange={setChatWidth}
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

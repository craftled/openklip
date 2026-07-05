"use client";

import type { SilenceSpan } from "@engine/audio-analysis-core";
import { DEFAULT_CAPTION_STYLE } from "@engine/caption-styles";
import type { CleanupCandidate } from "@engine/cleanup";
import { partitionSafeCandidates } from "@engine/cleanup";
import type {
  Audio,
  ColorAdjust,
  CropMode,
  CutSnap,
  CutTransition,
  Project as EngineProject,
  ExportAspect,
  ExportSettings,
  Filter,
  Highlights,
} from "@engine/edl";
import {
  AudioSchema,
  CutSnapSchema,
  ExportSettingsSchema,
  effectiveRanges,
} from "@engine/edl";
import {
  exportAspectToOrientation,
  orientationToExportAspect,
  shouldApplyReframe,
} from "@engine/export-aspect";
import type { Keyframe } from "@engine/keyframes";
import { validateProductAnnouncementSpec } from "@engine/product-announcement";
import { stampGuiWordProvenance } from "@engine/provenance-display";
import type { SafeAreaPlatform } from "@engine/safe-areas";
import { useRouter } from "next/navigation";
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
import type { AudioMeasureView, AudioPatch } from "@/components/audio-controls";
import {
  CHAT_WIDTH_DEFAULT,
  readStoredChatWidth,
} from "@/components/chat-resize-handle";
import { CinemaPlayer } from "@/components/cinema-player";
import { buildCleanupCandidates } from "@/components/cleanup-panel";
import { ZOOM_PRESETS } from "@/components/config/config-section";
import type {
  TimelineClipKind,
  TimelineTiming,
} from "@/components/edit-timeline";
import { EditorColumn } from "@/components/editor/editor-column";
import { EditorRightRail } from "@/components/editor/editor-right-rail";
import { EditorSidebarShortcuts } from "@/components/editor-sidebar-shortcuts";
import type { ExportDialogOptions } from "@/components/export-dialog";
import type { GraphicItem } from "@/components/graphic-overlay";
import {
  DEFAULT_GRAPHIC_SPAN_SEC,
  type GraphicSpanMode,
  useGraphicTemplates,
} from "@/components/graphic-picker-controls";
import {
  DEFAULT_MUSIC_BED_SEC,
  type MusicPlacementPatch,
  type MusicPlacementView,
} from "@/components/music-controls";
import { PreviewOverlays } from "@/components/preview-overlays";
import type { ExportPatch } from "@/components/reframe-controls";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { useConfigPanel } from "@/hooks/use-config-panel";
import { usePreviewPlayback } from "@/hooks/use-preview-playback";
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
import {
  toastError,
  toastInfo,
  toastPromise,
  toastSuccess,
  toastTransitionFallback,
} from "@/lib/app-toast";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import { shouldAutoOpenConfig } from "@/lib/config-panel-behavior";
import type { ConfigTabId } from "@/lib/config-tabs";
import { type DeadAirItem, reconcileDeadAirItems } from "@/lib/dead-air-state";
import { resolveExportMaxHeight } from "@/lib/export-max-height";
import { formatEditorTime } from "@/lib/format-time";
import { playheadOffsetInClip } from "@/lib/keyframe-ui";
import type { Orientation } from "@/lib/preview-layout";
import { buildProjectHoverContext } from "@/lib/project-context";
import type { ProjectListing } from "@/lib/project-list";
import {
  readProvenanceDisplayEnabled,
  subscribeProvenanceDisplay,
} from "@/lib/provenance-preferences";
import { reanchoredWordUpdate } from "@/lib/reanchored-word-update";
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
import { exportPromiseMessages } from "@/lib/toast-notifications";
import {
  reconcileTranscriptText,
  setWordRangeDeleted,
} from "@/lib/transcript-edit";
import {
  exportProject,
  runGuiAction,
  runHighlightsDetect,
  runVisionFocus,
  saveBrief,
  saveBroll,
  saveLook,
  saveProjectEdits,
  saveStills,
  saveTitles,
  saveZooms,
} from "../app/actions.ts";
import { type CaptionWord, groupCaptions } from "../src/captions.ts";
import { sourceSecForOutputPosition } from "../src/schedulerLogic.ts";

interface Word {
  deleted: boolean;
  endSample: number;
  id: string;
  startSample: number;
  text: string;
}
interface Asset {
  card?: { bestFor?: string[]; summary: string; tags?: string[] };
  durationSamples: number;
  id: string;
  kind?: "broll" | "music" | "still";
  name: string;
  proxy: string;
}
interface BrollItem {
  assetId: string;
  audioMode?: "broll" | "duck-broll" | "duck-voice" | "mix" | "silent";
  authoredAt?: number;
  authoredBy?: string;
  authoredRevision?: number;
  authoredTaskId?: string;
  display?: "cover" | "pip" | "split";
  endSample: number;
  id: string;
  srcInSample: number;
  startSample: number;
}
interface ZoomItem {
  endSample: number;
  id: string;
  rampSec: number;
  scale: number;
  startSample: number;
}
interface TitleItem {
  endSample: number;
  id: string;
  position: "callout" | "center" | "divider" | "hero" | "lower" | "quote";
  startSample: number;
  text: string;
}
interface StillItem {
  assetId: string;
  endSample: number;
  focusX: number;
  focusY: number;
  id: string;
  scale: number;
  startSample: number;
}
interface Project {
  assets: Asset[];
  audio?: Audio;
  brief?: string | null;
  broll: BrollItem[];
  captions?: { enabled: boolean; maxWords?: number; style?: string };
  // cuts.deadAir/cuts.snap: registered by the Cleanup/Audio config sections
  // (dead-air-add/cuts-snap registry actions). Optional so this local Project
  // type keeps parsing project.json shapes saved before either existed.
  cuts?: {
    deadAir?: DeadAirItem[];
    snap?: CutSnap;
  };
  dirPath: string;
  durationSamples: number;
  export?: ExportSettings;
  fps: number;
  graphics?: GraphicItem[];
  height: number;
  highlights?: Highlights;
  look?: {
    vignette: boolean;
    filter?: Filter;
    color?: ColorAdjust;
    transition?: CutTransition;
  };
  mediaVersion?: number;
  motion?: { speed?: number };
  music?: MusicPlacementView[];
  padMs: number;
  revision?: number;
  sampleRate: number;
  // Rides on the project object from a separate editor-page-data change
  // (VAD silence spans for dead-air detection); absent/undefined/null all
  // degrade the Cleanup section to filler-only via buildCleanupCandidates.
  sceneLog?: { segments: unknown[]; analyzedAt: string; agent?: string } | null;
  silences?: SilenceSpan[] | null;
  slug: string;
  source: string;
  stills?: StillItem[];
  template?: string;
  titles: TitleItem[];
  width: number;
  words: Word[];
  zooms: ZoomItem[];
}

type Selected = { kind: TimelineClipKind; id: string } | null;

// F12: mirrors the dead-air-add action's server-side span cap (src/registry.ts).
const DEAD_AIR_ADD_BATCH_SIZE = 50;

// M4: read straight off AudioSchema/CutSnapSchema's own `.default()` (src/edl.ts)
// instead of hand-copied literals that can drift from the schema, so the
// Audio config section has something to render/merge against on a
// project.json saved before either field existed.
const DEFAULT_AUDIO: Audio = AudioSchema.parse(undefined);
const DEFAULT_CUT_SNAP: CutSnap = CutSnapSchema.parse(undefined);

// One-level-deep merge matching setAudio's server-side merge (src/actions.ts):
// only the subobjects present in patch change, an omitted subobject is left
// untouched. Values are re-clamped server-side regardless of what the
// slider/number-input bounds already enforce client-side.
function mergeAudioPatch(current: Audio | undefined, patch: AudioPatch): Audio {
  const base = current ?? DEFAULT_AUDIO;
  return {
    ducking: patch.ducking
      ? { ...base.ducking, ...patch.ducking }
      : base.ducking,
    loudness: patch.loudness
      ? { ...base.loudness, ...patch.loudness }
      : base.loudness,
    noiseReduction: patch.noiseReduction
      ? { ...base.noiseReduction, ...patch.noiseReduction }
      : base.noiseReduction,
    voiceHighpass: patch.voiceHighpass
      ? { ...base.voiceHighpass, ...patch.voiceHighpass }
      : base.voiceHighpass,
    deEsser: patch.deEsser
      ? { ...base.deEsser, ...patch.deEsser }
      : base.deEsser,
  };
}

// Kept-range math itself now lives in one place (src/edl.ts effectiveRanges),
// shared with the server (exporter/query/CLI) so preview and export truth
// cannot drift; see the two effectiveRanges(project, ...) call sites below.

// Kept-range <-> cut-space position math itself now lives in one place
// (src/schedulerLogic.ts outputPositionSec / sourceSecForOutputPosition),
// shared with CinemaPlayer so the inline preview and the fullscreen player
// cannot drift on what "current time" means.

import type { EditorChatsSnapshot } from "../app/lib/editor-chats.ts";

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
  const router = useRouter();
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
  const [export1080, setExport1080] = useState(true);
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
  const [bpmDetectingAssetId, setBpmDetectingAssetId] = useState<string | null>(
    null
  );
  const [audioMeasure, setAudioMeasure] = useState<AudioMeasureView | null>(
    null
  );
  const [audioMeasuring, setAudioMeasuring] = useState(false);
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
  const [exporting, setExporting] = useState(false);
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

  const addZoom = () => {
    if (!selRange) {
      return;
    }
    const [a, b] = selRange;
    const id = `z${Date.now()}`;
    const zooms = [
      ...(project.zooms ?? []),
      {
        id,
        startSample: project.words[a].startSample,
        endSample: project.words[b].endSample,
        scale: 1.15,
        rampSec: 0.6,
      },
    ];
    setProject({ ...project, zooms });
    enqueueSave(() => saveZooms(project.slug, zooms));
    clearSel();
    setSelected({ kind: "zoom", id });
  };
  const addBroll = () => {
    if (!(selRange && chosenAsset)) {
      return;
    }
    const [a, b] = selRange;
    const id = `br${Date.now()}`;
    const broll = [
      ...(project.broll ?? []),
      {
        id,
        assetId: chosenAsset,
        startSample: project.words[a].startSample,
        endSample: project.words[b].endSample,
        srcInSample: 0,
        display: "cover" as const,
      },
    ];
    setProject({ ...project, broll });
    enqueueSave(() => saveBroll(project.slug, broll));
    clearSel();
    setSelected({ kind: "broll", id });
  };
  const addTitle = () => {
    if (!(selRange && titleText.trim())) {
      return;
    }
    const [a, b] = selRange;
    const id = `t${Date.now()}`;
    const titles = [
      ...(project.titles ?? []),
      {
        id,
        text: titleText.trim(),
        startSample: project.words[a].startSample,
        endSample: project.words[b].endSample,
        position: titlePos,
      },
    ];
    setProject({ ...project, titles });
    enqueueSave(() => saveTitles(project.slug, titles));
    setTitleText("");
    clearSel();
    setSelected({ kind: "title", id });
  };
  const addStill = () => {
    if (!(selRange && chosenStillAsset)) {
      return;
    }
    const [a, b] = selRange;
    const id = `s${Date.now()}`;
    const stills = [
      ...(project.stills ?? []),
      {
        id,
        assetId: chosenStillAsset,
        startSample: project.words[a].startSample,
        endSample: project.words[b].endSample,
        scale: 1.2,
        focusX: 0.5,
        focusY: 0.5,
      },
    ];
    setProject({ ...project, stills });
    enqueueSave(() => saveStills(project.slug, stills));
    clearSel();
    setSelected({ kind: "still", id });
  };

  const updateZoom = (id: string, patch: Partial<ZoomItem>) => {
    const zooms = (project.zooms ?? []).map((z) =>
      z.id === id ? { ...z, ...patch } : z
    );
    setProject({ ...project, zooms });
    enqueueSave(() => saveZooms(project.slug, zooms));
  };
  const updateTitle = (id: string, patch: Partial<TitleItem>) => {
    const titles = (project.titles ?? []).map((t) =>
      t.id === id ? { ...t, ...patch } : t
    );
    setProject({ ...project, titles });
    enqueueSave(() => saveTitles(project.slug, titles));
  };
  const updateBroll = (id: string, patch: Partial<BrollItem>) => {
    const broll = (project.broll ?? []).map((b) =>
      b.id === id ? { ...b, ...patch } : b
    );
    setProject({ ...project, broll });
    enqueueSave(() => saveBroll(project.slug, broll));
  };
  const updateStill = (id: string, patch: Partial<StillItem>) => {
    const stills = (project.stills ?? []).map((s) =>
      s.id === id ? { ...s, ...patch } : s
    );
    setProject({ ...project, stills });
    enqueueSave(() => saveStills(project.slug, stills));
  };

  const updateGraphic = useCallback(
    (id: string, patch: { keyframes: Keyframe[] }) => {
      setProject((prev) => {
        const graphics = (prev.graphics ?? []).map((g) =>
          g.id === id ? { ...g, keyframes: patch.keyframes } : g
        );
        const graphic = graphics.find((g) => g.id === id);
        const actionName =
          graphic?.type === "json-render" ? "json-graphic-set" : "graphic-set";
        enqueueSave(() =>
          runGuiAction(prev.slug, actionName, {
            id,
            keyframes: patch.keyframes,
          })
        );
        return { ...prev, graphics };
      });
    },
    [enqueueSave]
  );

  const addGraphicPlacement = () => {
    if (!chosenGraphicTemplate) {
      return;
    }
    const durationSec = project.durationSamples / project.sampleRate;
    const fromSec = curSec;
    const toSec = Math.min(curSec + DEFAULT_GRAPHIC_SPAN_SEC, durationSec);
    const beatsPayload =
      graphicSpanMode === "beats" &&
      graphicMusicAssetId &&
      musicBpmByAsset[graphicMusicAssetId]
        ? {
            beats: graphicBeatCount,
            musicAssetId: graphicMusicAssetId,
          }
        : undefined;
    if (toSec - fromSec <= 0.05 && !beatsPayload) {
      return;
    }
    const optimisticId = `g${Date.now()}`;
    const item = {
      id: optimisticId,
      template: chosenGraphicTemplate,
      type: "template" as const,
      track: "broll",
      startSample: Math.round(fromSec * sr),
      endSample: Math.round(toSec * sr),
      params: { ...graphicParamDraft },
    };
    setProject((prev) => ({
      ...prev,
      graphics: [...(prev.graphics ?? []), item],
    }));
    enqueueSave(async () => {
      const r = await runGuiAction(project.slug, "graphic-add", {
        template: item.template,
        fromSec,
        toSec,
        params: item.params,
        track: item.track,
        ...beatsPayload,
      });
      if (r.ok) {
        const saved = r.data.result as typeof item;
        setProject((prev) => ({
          ...prev,
          graphics: (prev.graphics ?? []).map((g) =>
            g.id === optimisticId ? { ...g, ...saved } : g
          ),
        }));
      }
      return r;
    });
  };

  const addGraphicAtCutSeams = () => {
    if (!chosenGraphicTemplate) {
      return;
    }
    enqueueSave(async () => {
      const r = await runGuiAction(project.slug, "graphic-add-cuts", {
        template: chosenGraphicTemplate,
        track: "title",
        params:
          Object.keys(graphicParamDraft).length > 0
            ? graphicParamDraft
            : undefined,
      });
      if (r.ok) {
        const data = r.data.result as {
          items?: Array<{
            id: string;
            template: string;
            startSample: number;
            endSample: number;
            track: string;
            params: Record<string, string | number | boolean>;
          }>;
        };
        const placed = data.items ?? [];
        if (placed.length > 0) {
          setProject((prev) => ({
            ...prev,
            graphics: [
              ...(prev.graphics ?? []),
              ...placed.map((g) => ({
                id: g.id,
                template: g.template,
                type: "template" as const,
                track: g.track,
                startSample: g.startSample,
                endSample: g.endSample,
                params: g.params,
              })),
            ],
          }));
        }
      }
      return r;
    });
  };

  const addMusicPlacement = () => {
    if (!chosenMusicAsset) {
      return;
    }
    const durationSec = project.durationSamples / project.sampleRate;
    const fromSec = curSec;
    const toSec = Math.min(curSec + DEFAULT_MUSIC_BED_SEC, durationSec);
    if (toSec - fromSec <= 0.05) {
      return;
    }
    const optimisticId = `m${Date.now()}`;
    const item: MusicPlacementView = {
      id: optimisticId,
      assetId: chosenMusicAsset,
      startSample: Math.round(fromSec * sr),
      endSample: Math.round(toSec * sr),
      srcInSample: 0,
      gain: 1,
      fadeInSec: 0,
      fadeOutSec: 0,
      mode: "trim",
    };
    setProject((prev) => ({ ...prev, music: [...(prev.music ?? []), item] }));
    enqueueSave(async () => {
      const r = await runGuiAction(project.slug, "music-add", {
        assetId: item.assetId,
        fromSec,
        toSec,
      });
      if (r.ok) {
        const saved = r.data.result as MusicPlacementView;
        setProject((prev) => ({
          ...prev,
          music: (prev.music ?? []).map((m) =>
            m.id === optimisticId ? { ...m, ...saved } : m
          ),
        }));
      }
      return r;
    });
  };
  const patchMusicPlacement = (id: string, rawPatch: MusicPlacementPatch) => {
    const current = (project.music ?? []).find((m) => m.id === id);
    if (!current) {
      return;
    }
    // Clamp to the bounds the server's resolveMusicSpan (src/actions.ts)
    // enforces; an out-of-range value would otherwise throw server-side and
    // strand a diverged optimistic state behind an error toast.
    const clamp = (n: number, min: number, max: number) =>
      Math.max(min, Math.min(max, n));
    const durationSec = project.durationSamples / project.sampleRate;
    const patch: MusicPlacementPatch = {
      ...rawPatch,
      ...(rawPatch.fromSec === undefined
        ? {}
        : { fromSec: clamp(rawPatch.fromSec, 0, durationSec) }),
      ...(rawPatch.toSec === undefined
        ? {}
        : { toSec: clamp(rawPatch.toSec, 0, durationSec) }),
      ...(rawPatch.gain === undefined
        ? {}
        : { gain: clamp(rawPatch.gain, 0, 2) }),
      ...(rawPatch.fadeInSec === undefined
        ? {}
        : { fadeInSec: clamp(rawPatch.fadeInSec, 0, 10) }),
      ...(rawPatch.fadeOutSec === undefined
        ? {}
        : { fadeOutSec: clamp(rawPatch.fadeOutSec, 0, 10) }),
    };
    const nextFromSec = patch.fromSec ?? current.startSample / sr;
    const nextToSec = patch.toSec ?? current.endSample / sr;
    if (nextToSec <= nextFromSec) {
      return;
    }
    const music = (project.music ?? []).map((m) => {
      if (m.id !== id) {
        return m;
      }
      return {
        ...m,
        ...(patch.fromSec === undefined
          ? {}
          : { startSample: Math.round(patch.fromSec * sr) }),
        ...(patch.toSec === undefined
          ? {}
          : { endSample: Math.round(patch.toSec * sr) }),
        ...(patch.gain === undefined ? {} : { gain: patch.gain }),
        ...(patch.fadeInSec === undefined
          ? {}
          : { fadeInSec: patch.fadeInSec }),
        ...(patch.fadeOutSec === undefined
          ? {}
          : { fadeOutSec: patch.fadeOutSec }),
        ...(patch.mode === undefined ? {} : { mode: patch.mode }),
      };
    });
    setProject({ ...project, music });
    enqueueSave(async () => {
      const r = await runGuiAction(project.slug, "music-set", { id, ...patch });
      if (r.ok) {
        // Reconcile like the add path: the server's resolveMusicSpan clamps
        // trim-mode spans to the ASSET remainder (the client only clamps to
        // the project duration), so the saved placement can differ from the
        // optimistic row.
        const saved = r.data.result as MusicPlacementView;
        setProject((prev) => ({
          ...prev,
          music: (prev.music ?? []).map((m) =>
            m.id === id ? { ...m, ...saved } : m
          ),
        }));
      }
      return r;
    });
  };
  const removeMusicPlacement = (id: string) => {
    const music = (project.music ?? []).filter((m) => m.id !== id);
    setProject({ ...project, music });
    enqueueSave(() => runGuiAction(project.slug, "music-rm", { id }));
  };

  // Cleanup section: a filler candidate optimistically deletes its wordIds
  // (reanchoredWordUpdate, the same optimistic mirror cutSearchMatches uses)
  // and persists through the cut action; a dead-air candidate optimistically
  // appends a placeholder to cuts.deadAir and persists through dead-air-add,
  // reconciling the placeholder with the server-assigned id on success (the
  // music-add precedent).
  const applyCleanupCandidate = (candidate: CleanupCandidate) => {
    if (candidate.kind === "filler") {
      setProject(
        (prev) =>
          reanchoredWordUpdate(
            prev as unknown as EngineProject,
            new Set(candidate.wordIds),
            true
          ) as unknown as Project
      );
      enqueueSave(() =>
        runGuiAction(project.slug, "cut", {
          ids: candidate.wordIds,
          deleted: true,
          note: candidate.reason,
        })
      );
      return;
    }
    const optimisticId = `da${Date.now()}`;
    setProject((prev) => ({
      ...prev,
      cuts: {
        ...prev.cuts,
        deadAir: [
          ...(prev.cuts?.deadAir ?? []),
          {
            id: optimisticId,
            startSample: Math.round(candidate.startSec * prev.sampleRate),
            endSample: Math.round(candidate.endSec * prev.sampleRate),
          },
        ],
      },
    }));
    enqueueSave(async () => {
      const r = await runGuiAction(project.slug, "dead-air-add", {
        spans: [{ fromSec: candidate.startSec, toSec: candidate.endSec }],
      });
      if (r.ok) {
        const created = r.data.result as DeadAirItem[];
        setProject((prev) => ({
          ...prev,
          cuts: {
            ...prev.cuts,
            deadAir: reconcileDeadAirItems(
              prev.cuts?.deadAir ?? [],
              created,
              (id) => id === optimisticId
            ),
          },
        }));
      }
      return r;
    });
  };

  // "Apply all safe" batches every safe candidate into at most two saves (and
  // two history entries) instead of one per candidate: one cut call carrying
  // every safe filler's wordIds, one (possibly chunked, see F12 below)
  // dead-air-add call carrying every safe dead-air candidate's span.
  // partitionSafeCandidates (M2) is the same split src/cli.ts's
  // `cleanup --apply-safe` uses.
  const applyAllSafeCleanup = () => {
    const { fillerIds, deadAirSpans } = partitionSafeCandidates(
      cleanupReportView.candidates
    );
    if (fillerIds.length === 0 && deadAirSpans.length === 0) {
      return;
    }
    if (fillerIds.length > 0) {
      setProject(
        (prev) =>
          reanchoredWordUpdate(
            prev as unknown as EngineProject,
            new Set(fillerIds),
            true
          ) as unknown as Project
      );
      enqueueSave(() =>
        runGuiAction(project.slug, "cut", {
          ids: fillerIds,
          deleted: true,
          note: "cleanup: apply all safe",
        })
      );
    }
    if (deadAirSpans.length > 0) {
      const optimisticId = `da${Date.now()}`;
      setProject((prev) => ({
        ...prev,
        cuts: {
          ...prev.cuts,
          deadAir: [
            ...(prev.cuts?.deadAir ?? []),
            ...deadAirSpans.map((span, index) => ({
              id: `${optimisticId}-${index}`,
              startSample: Math.round(span.fromSec * project.sampleRate),
              endSample: Math.round(span.toSec * project.sampleRate),
            })),
          ],
        },
      }));
      // F12: dead-air-add caps at 50 spans per call (src/registry.ts). A
      // safe batch over that limit chunks into sequential calls instead of
      // zod-failing the whole request after the optimistic update above.
      enqueueSave(async () => {
        const created: DeadAirItem[] = [];
        for (let i = 0; i < deadAirSpans.length; i += DEAD_AIR_ADD_BATCH_SIZE) {
          const batch = deadAirSpans.slice(i, i + DEAD_AIR_ADD_BATCH_SIZE);
          const r = await runGuiAction(project.slug, "dead-air-add", {
            spans: batch,
          });
          if (!r.ok) {
            // An earlier batch in this loop may already be applied
            // server-side; router.refresh() re-delivers project-data from
            // the server (the same affordance F3's patchSnap uses) so
            // optimistic client state, including the placeholder above,
            // cannot diverge from it silently. enqueueSave's own failure
            // path (below) still surfaces the error toast.
            router.refresh();
            return r;
          }
          created.push(...(r.data.result as DeadAirItem[]));
        }
        setProject((prev) => ({
          ...prev,
          cuts: {
            ...prev.cuts,
            deadAir: reconcileDeadAirItems(
              prev.cuts?.deadAir ?? [],
              created,
              (id) => id.startsWith(optimisticId)
            ),
          },
        }));
        return { ok: true } as const;
      });
    }
  };

  // Remove a registered dead-air span by id. Optimistically drops the span
  // from local state then confirms via the dead-air-rm action.
  const removeDeadAirSpan = (id: string) => {
    setProject((prev) => ({
      ...prev,
      cuts: {
        ...prev.cuts,
        deadAir: (prev.cuts?.deadAir ?? []).filter((s) => s.id !== id),
      },
    }));
    enqueueSave(() => runGuiAction(project.slug, "dead-air-rm", { id }));
  };

  // Audio section: ducking/loudness/highpass patch through the audio action
  // (setAudio re-clamps bounds server-side); snap patches through the
  // existing cuts-snap action.
  const patchAudio = (patch: AudioPatch) => {
    setProject((prev) => ({
      ...prev,
      audio: mergeAudioPatch(prev.audio, patch),
    }));
    enqueueSave(() => runGuiAction(project.slug, "audio", patch));
  };
  const detectMusicBpm = useCallback(
    async (assetId: string) => {
      setBpmDetectingAssetId(assetId);
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(project.slug)}/bpm?assetId=${encodeURIComponent(assetId)}`
        );
        const data = (await res.json()) as {
          bpm?: number;
          confidence?: number;
          error?: string;
        };
        if (
          !(
            res.ok &&
            typeof data.bpm === "number" &&
            typeof data.confidence === "number"
          )
        ) {
          throw new Error(data.error ?? "BPM detection failed");
        }
        const { bpm, confidence } = data;
        setMusicBpmByAsset((prev) => ({
          ...prev,
          [assetId]: { bpm, confidence },
        }));
      } catch (e) {
        toastError((e as Error).message);
      } finally {
        setBpmDetectingAssetId(null);
      }
    },
    [project.slug]
  );
  const measureAudioLoudness = useCallback(async () => {
    setAudioMeasuring(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(project.slug)}/audio-measure`
      );
      const data = (await res.json()) as AudioMeasureView & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Loudness measure failed");
      }
      setAudioMeasure({
        integratedLufs: data.integratedLufs,
        truePeakDbtp: data.truePeakDbtp,
        lra: data.lra,
        source: data.source,
      });
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setAudioMeasuring(false);
    }
  }, [project.slug]);
  const patchExport = useCallback(
    (patch: ExportPatch) => {
      setProject((prev) => {
        const current = ExportSettingsSchema.parse(prev.export ?? {});
        const layout = patch.layout ?? current.layout ?? "fill";
        const splitVertical =
          patch.splitVertical === undefined
            ? current.splitVertical
            : {
                ...(current.splitVertical ?? {
                  ratio: 0.45,
                  speakerPosition: "top" as const,
                }),
                ...patch.splitVertical,
              };
        return {
          ...prev,
          export: {
            aspect: patch.aspect ?? current.aspect,
            crop: patch.crop
              ? { ...current.crop, ...patch.crop }
              : current.crop,
            cropMode: patch.cropMode ?? current.cropMode,
            layout,
            ...(splitVertical === undefined ? {} : { splitVertical }),
          },
        };
      });
      const input: {
        aspect?: ExportAspect;
        crop?: ExportPatch["crop"];
        cropMode?: CropMode;
        layout?: ExportPatch["layout"];
        splitVertical?: ExportPatch["splitVertical"];
      } = {};
      if (patch.aspect !== undefined) {
        input.aspect = patch.aspect;
      }
      if (patch.crop !== undefined) {
        input.crop = patch.crop;
      }
      if (patch.cropMode !== undefined) {
        input.cropMode = patch.cropMode;
      }
      if (patch.layout !== undefined) {
        input.layout = patch.layout;
      }
      if (patch.splitVertical !== undefined) {
        input.splitVertical = patch.splitVertical;
      }
      enqueueSave(() => runGuiAction(project.slug, "export-set", input));
    },
    [enqueueSave, project.slug]
  );
  const [applyingVision, setApplyingVision] = useState(false);
  const onRunVisionFocus = useCallback(async () => {
    setApplyingVision(true);
    try {
      const r = await runVisionFocus(project.slug);
      if (!r.ok) {
        setSaveError(r.error);
        return;
      }
      setProject((prev) => ({
        ...prev,
        ...(r.data.project as unknown as Project),
        brief: prev.brief,
        dirPath: prev.dirPath,
        mediaVersion: prev.mediaVersion,
        silences: prev.silences,
      }));
      patchExport({ cropMode: "scene" });
      router.refresh();
    } finally {
      setApplyingVision(false);
    }
  }, [patchExport, project.slug, router]);
  const [detectingHighlights, setDetectingHighlights] = useState(false);
  const onDetectHighlights = useCallback(async () => {
    setDetectingHighlights(true);
    try {
      const r = await runHighlightsDetect(project.slug);
      if (!r.ok) {
        setSaveError(r.error);
        return;
      }
      setProject((prev) => ({
        ...prev,
        ...(r.data.project as unknown as Project),
        brief: prev.brief,
        dirPath: prev.dirPath,
        mediaVersion: prev.mediaVersion,
        silences: prev.silences,
      }));
      router.refresh();
    } finally {
      setDetectingHighlights(false);
    }
  }, [project.slug, router]);
  const changeOrientation = useCallback(
    (next: Orientation) => {
      setOrientation(next);
      patchExport({ aspect: orientationToExportAspect(next) });
    },
    [patchExport]
  );
  const patchSnap = (patch: Partial<CutSnap>) => {
    setProject((prev) => ({
      ...prev,
      cuts: {
        ...prev.cuts,
        snap: { ...(prev.cuts?.snap ?? DEFAULT_CUT_SNAP), ...patch },
      },
    }));
    // F3: enabling snap needs project.silences, which only the server
    // component's project-data load populates (see app/lib/project-data.ts);
    // without a refresh here the preview stays unsnapped until a full page
    // reload even though export already snaps. Scoped to enabled/mode
    // changes only, so a maxShiftMs/crossfadeMs tweak (which needs no new
    // data) doesn't pay for a round trip.
    enqueueSave(async () => {
      const r = await runGuiAction(project.slug, "cuts-snap", patch);
      if (r.ok && (patch.enabled !== undefined || patch.mode !== undefined)) {
        router.refresh();
      }
      return r;
    });
  };

  const onClipTiming = useCallback(
    (
      kind: TimelineClipKind,
      id: string,
      timing: TimelineTiming,
      commit: boolean
    ) => {
      const patch = {
        startSample: timing.startSample,
        endSample: timing.endSample,
      };
      setProject((prev) => {
        if (kind === "zoom") {
          const zooms = (prev.zooms ?? []).map((z) =>
            z.id === id ? { ...z, ...patch } : z
          );
          if (commit) {
            enqueueSave(() => saveZooms(prev.slug, zooms));
          }
          return { ...prev, zooms };
        }
        if (kind === "broll") {
          const broll = (prev.broll ?? []).map((b) =>
            b.id === id ? { ...b, ...patch } : b
          );
          if (commit) {
            enqueueSave(() => saveBroll(prev.slug, broll));
          }
          return { ...prev, broll };
        }
        if (kind === "title") {
          const titles = (prev.titles ?? []).map((t) =>
            t.id === id ? { ...t, ...patch } : t
          );
          if (commit) {
            enqueueSave(() => saveTitles(prev.slug, titles));
          }
          return { ...prev, titles };
        }
        if (kind === "graphic") {
          const graphics = (prev.graphics ?? []).map((g) =>
            g.id === id ? { ...g, ...patch } : g
          );
          if (commit) {
            const graphic = graphics.find((g) => g.id === id);
            const actionName =
              graphic?.type === "json-render"
                ? "json-graphic-set"
                : "graphic-set";
            enqueueSave(() =>
              runGuiAction(prev.slug, actionName, {
                id,
                fromSec: timing.startSample / prev.sampleRate,
                toSec: timing.endSample / prev.sampleRate,
              })
            );
          }
          return { ...prev, graphics };
        }
        const stills = (prev.stills ?? []).map((s) =>
          s.id === id ? { ...s, ...patch } : s
        );
        if (commit) {
          enqueueSave(() => saveStills(prev.slug, stills));
        }
        return { ...prev, stills };
      });
    },
    [enqueueSave]
  );
  // Reorder b-roll covers in paint order from a drag (array order = paint order;
  // a later index paints on top when covers overlap). Mirrors `openklip reorder`.
  const reorderBrollOrder = (orderedIds: string[]) => {
    const map = new Map((project.broll ?? []).map((b) => [b.id, b]));
    const broll = orderedIds
      .map((id) => map.get(id))
      .filter((b): b is BrollItem => Boolean(b));
    setProject({ ...project, broll });
    enqueueSave(() => saveBroll(project.slug, broll));
  };
  const removeSelected = () => {
    if (!selected) {
      return;
    }
    if (selected.kind === "zoom") {
      const zooms = (project.zooms ?? []).filter((z) => z.id !== selected.id);
      setProject({ ...project, zooms });
      enqueueSave(() => saveZooms(project.slug, zooms));
    } else if (selected.kind === "broll") {
      const broll = (project.broll ?? []).filter((b) => b.id !== selected.id);
      setProject({ ...project, broll });
      enqueueSave(() => saveBroll(project.slug, broll));
    } else if (selected.kind === "title") {
      const titles = (project.titles ?? []).filter((t) => t.id !== selected.id);
      setProject({ ...project, titles });
      enqueueSave(() => saveTitles(project.slug, titles));
    } else if (selected.kind === "still") {
      const stills = (project.stills ?? []).filter((s) => s.id !== selected.id);
      setProject({ ...project, stills });
      enqueueSave(() => saveStills(project.slug, stills));
    } else if (selected.kind === "graphic") {
      const graphics = (project.graphics ?? []).filter(
        (g) => g.id !== selected.id
      );
      setProject({ ...project, graphics });
      enqueueSave(() =>
        runGuiAction(project.slug, "graphic-rm", { id: selected.id })
      );
    }
    setSelected(null);
  };

  const toggleCaptions = (next: boolean) => {
    setCaptionsOn(next);
    enqueueSave(() =>
      runGuiAction(project.slug, "captions", { enabled: next })
    );
  };
  const toggleVignette = (next: boolean) => {
    setVignetteOn(next);
    enqueueSave(() =>
      runGuiAction(project.slug, "look-vignette", { vignette: next })
    );
  };
  const changeFilter = (next: Filter) => {
    setFilterState(next);
    enqueueSave(() => saveLook(project.slug, { filter: next }));
  };
  const changeColor = (next: ColorAdjust) => {
    // Mirror the engine's omit-when-neutral: a fully default adjust clears.
    const neutral =
      next.temperature === 0 &&
      next.tint === 0 &&
      next.brightness === 0 &&
      next.contrast === 1 &&
      next.saturation === 1;
    setColorState(neutral ? null : next);
    enqueueSave(() => saveLook(project.slug, { color: next }));
  };
  const changeMotionSpeed = (next: number) => {
    setMotionSpeed(next);
    enqueueSave(() => runGuiAction(project.slug, "motion", { speed: next }));
  };
  const setMaxWords = (n: number) => {
    setProject((p) => ({
      ...p,
      captions: {
        enabled: p.captions?.enabled ?? true,
        ...p.captions,
        maxWords: n,
      },
    }));
    enqueueSave(() =>
      runGuiAction(project.slug, "captions-max", { maxWords: n })
    );
  };
  const setCaptionStyle = (styleId: string) => {
    setProject((p) => ({
      ...p,
      captions: {
        enabled: p.captions?.enabled ?? true,
        ...p.captions,
        style: styleId,
      },
    }));
    enqueueSave(() =>
      runGuiAction(project.slug, "captions-style", { style: styleId })
    );
  };
  const setPad = (n: number) => {
    setProject((p) => ({ ...p, padMs: n }));
    enqueueSave(() => saveProjectEdits(project.slug, { padMs: n }));
  };

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

  const onExport = async (options?: ExportDialogOptions) => {
    // export1080 only fills in a default when there is no dialog options
    // object at all (the CinemaPlayer toolbar's bare Export button, which
    // calls onExport() directly without opening the dialog). Once the dialog
    // has supplied options, its maxHeight (including undefined for
    // Manual+Source) is trusted verbatim; see web/lib/export-max-height.ts.
    const maxHeight = resolveExportMaxHeight(
      options?.maxHeight,
      options !== undefined,
      export1080
    );
    if (options?.resolution) {
      setExport1080(
        options.resolution === "1080" || options.resolution === "720"
      );
    }
    setExporting(true);
    try {
      const exportRun = (async () => {
        await saveChainRef.current;
        if (saveErrorRef.current) {
          throw new Error(saveErrorRef.current);
        }
        const r = await exportProject(project.slug, {
          compression: options?.compression,
          format: options?.format,
          fps: options?.frameRate === "source" ? undefined : options?.frameRate,
          gifMaxWidth: options?.gifMaxWidth,
          maxHeight,
          platform: options?.platform,
        });
        if (!r.ok) {
          throw new Error(r.error);
        }
        return r.data;
      })();

      void toastPromise(exportRun, exportPromiseMessages());
      const result = await exportRun;
      toastTransitionFallback(result.transition);
      if (options?.destination === "clipboard") {
        toastInfo("Export path ready", result.out, {
          duration: 15_000,
          action: {
            label: "Copy path",
            onClick: () => {
              const clipboard = navigator.clipboard;
              if (!clipboard) {
                toastError(
                  "Clipboard unavailable",
                  "Copy the path from the export toast."
                );
                return;
              }
              void clipboard
                .writeText(result.out)
                .then(() => toastSuccess("Path copied", result.out))
                .catch((error) =>
                  toastError(
                    "Could not copy path",
                    error instanceof Error ? error.message : String(error)
                  )
                );
            },
          },
        });
      }
    } catch {
      // toastPromise owns the export failure toast.
    } finally {
      setExporting(false);
    }
  };

  const fullDur = project.durationSamples / project.sampleRate;
  const inBroll = (w: Word) =>
    (project.broll ?? []).some(
      (b) => w.startSample < b.endSample && w.endSample > b.startSample
    );
  const inZoom = (w: Word) =>
    (project.zooms ?? []).some(
      (z) => w.startSample < z.endSample && w.endSample > z.startSample
    );
  const selZoom =
    selected?.kind === "zoom"
      ? project.zooms.find((z) => z.id === selected.id)
      : undefined;
  const selTitle =
    selected?.kind === "title"
      ? project.titles.find((t) => t.id === selected.id)
      : undefined;
  const selBroll =
    selected?.kind === "broll"
      ? project.broll.find((b) => b.id === selected.id)
      : undefined;
  const selStill =
    selected?.kind === "still"
      ? project.stills?.find((s) => s.id === selected.id)
      : undefined;
  const selGraphic =
    selected?.kind === "graphic"
      ? project.graphics?.find((g) => g.id === selected.id)
      : undefined;
  const selectedJsonGraphicSpec =
    selGraphic?.type === "json-render" ? selGraphic.spec : undefined;
  const selGraphicValidation = useMemo(
    () =>
      selectedJsonGraphicSpec === undefined
        ? null
        : validateProductAnnouncementSpec(selectedJsonGraphicSpec),
    [selectedJsonGraphicSpec]
  );
  const selGraphicLabel =
    selGraphic?.type === "json-render" ? "Announcement graphic" : "Graphic";
  const selGraphicKeyframes = useMemo(() => {
    if (!selGraphic?.keyframes?.length) {
      return [];
    }
    return [...selGraphic.keyframes].sort(
      (a, b) => a.sampleOffset - b.sampleOffset
    );
  }, [selGraphic?.keyframes]);
  const graphicPlayheadOffset = selGraphic
    ? playheadOffsetInClip(
        curSample,
        selGraphic.startSample,
        selGraphic.endSample
      )
    : null;
  const hasOverlayInspector = Boolean(
    selected && (selZoom || selTitle || selBroll || selStill || selGraphic)
  );
  useEffect(() => {
    if (!shouldAutoOpenConfig({ hasOverlayInspector, selRange })) {
      return;
    }
    setConfigTab("edit");
    setConfigOpen(true);
    setMobileRightPanel("config");
  }, [hasOverlayInspector, selRange, selected?.id, selected?.kind]);
  const presetOf = (z: ZoomItem) =>
    Object.entries(ZOOM_PRESETS).find(
      ([, v]) =>
        Math.abs(z.scale - v.scale) < 0.001 &&
        Math.abs(z.rampSec - v.rampSec) < 0.001
    )?.[0] ?? "";
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
      onChooseGraphicTemplate: (id) => {
        setChosenGraphicTemplate(id);
        const template = graphicTemplates.find((entry) => entry.id === id);
        if (!template) {
          setGraphicParamDraft({});
          return;
        }
        const defaults: Record<string, string | number | boolean> = {};
        for (const [key, spec] of Object.entries(template.params)) {
          defaults[key] = spec.default;
        }
        setGraphicParamDraft(defaults);
      },
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
      onSaveBrief: async (text) => {
        const r = await saveBrief(project.slug, text);
        if (r.ok) {
          setProject((prev) => ({ ...prev, brief: text }));
          return { ok: true as const };
        }
        return { ok: false as const, error: r.error };
      },
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

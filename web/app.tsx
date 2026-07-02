"use client";

import type { SilenceSpan } from "@engine/audio-analysis-core";
import { DEFAULT_CAPTION_STYLE } from "@engine/caption-styles";
import type { CleanupCandidate } from "@engine/cleanup";
import { partitionSafeCandidates } from "@engine/cleanup";
import type {
  Audio,
  ColorAdjust,
  CutSnap,
  Project as EngineProject,
  Filter,
} from "@engine/edl";
import { AudioSchema, CutSnapSchema, effectiveRanges } from "@engine/edl";
import { FILTER_OPTIONS, filterLabel } from "@engine/filter";
import { validateProductAnnouncementSpec } from "@engine/product-announcement";
import { useRouter } from "next/navigation";
import {
  type ComponentType,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActionStatusButton } from "@/components/action-status-button";
import { AgentChatProvider } from "@/components/agent-chat-context";
import { AgentChatPanel } from "@/components/agent-chat-panel";
import { AgentSidebar } from "@/components/agent-sidebar";
import { withAssetKind } from "@/components/asset-bin";
import { AudioControls, type AudioPatch } from "@/components/audio-controls";
import { BriefEditor } from "@/components/brief-editor";
import { CaptionStylePicker } from "@/components/caption-style-picker";
import {
  CHAT_WIDTH_DEFAULT,
  ChatResizeHandle,
  readStoredChatWidth,
} from "@/components/chat-resize-handle";
import { CinemaPlayer } from "@/components/cinema-player";
import {
  buildCleanupCandidates,
  CleanupPanel,
} from "@/components/cleanup-panel";
import { ColorTempPad } from "@/components/color-temp-pad";
import {
  EditTimeline,
  type TimelineClipKind,
  type TimelineTiming,
} from "@/components/edit-timeline";
import { EditorSidebarShortcuts } from "@/components/editor-sidebar-shortcuts";
import { EditorTranscriptPanel } from "@/components/editor-transcript-panel";
import {
  ExportDialog,
  type ExportDialogOptions,
} from "@/components/export-dialog";
import { FilterControls } from "@/components/filter-controls";
import { FindFillerButton } from "@/components/find-filler-button";
import type { GraphicItem } from "@/components/graphic-overlay";
import { HistoryPanel } from "@/components/history-panel";
import {
  DEFAULT_MUSIC_BED_SEC,
  type MusicPlacementPatch,
  type MusicPlacementView,
  MusicSectionControls,
} from "@/components/music-controls";
import { OverlaySortable } from "@/components/overlay-sortable";
import { PLAYER_SPEEDS, PlayerControls } from "@/components/player-controls";
import { PreviewOverlays } from "@/components/preview-overlays";
import { SettingsView } from "@/components/settings/settings-view";
import { TranscriptSearch } from "@/components/transcript-search";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VerifyCutButton } from "@/components/verify-cut-button";
import { useModShortcut } from "@/hooks/use-mod-shortcut";
import {
  type AgentModelId,
  DEFAULT_AGENT_MODEL,
  getDefaultAgentModel,
  setDefaultAgentModel,
  subscribeDefaultAgent,
} from "@/lib/agent-preferences";
import {
  toastNothingToPlay,
  toastPlaybackFailed,
  toastPromise,
  toastSaveError,
} from "@/lib/app-toast";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import { type DeadAirItem, reconcileDeadAirItems } from "@/lib/dead-air-state";
import { resolveExportMaxHeight } from "@/lib/export-max-height";
import {
  APP_ICON_CLASS,
  Captions,
  ChevronRight,
  Clock3,
  Download,
  Film,
  ImageIcon,
  MessageSquare,
  Moon,
  PanelLeft,
  PanelRight,
  Scan,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Volume2,
  ZoomIn,
} from "@/lib/icon";
import { isModKeyOnly, isTypingTarget } from "@/lib/keyboard-shortcuts";
import { musicPreviewTime } from "@/lib/music-preview";
import {
  type PhraseSearchMatch,
  type PhraseSearchMode,
  phraseSearchMatches,
} from "@/lib/phrase-search";
import {
  clampLoopRegion,
  ORIENTATION_LABEL,
  ORIENTATION_RATIO,
  type Orientation,
} from "@/lib/preview-layout";
import { buildProjectHoverContext } from "@/lib/project-context";
import type { ProjectListing } from "@/lib/project-list";
import type { SettingsSectionId } from "@/lib/settings-navigation";
import {
  applyColorScheme,
  type ColorScheme,
  getColorScheme,
  setColorScheme,
  subscribeColorScheme,
} from "@/lib/theme-preferences";
import { exportPromiseMessages } from "@/lib/toast-notifications";
import { firstToggleValue } from "@/lib/toggle-value";
import {
  reconcileTranscriptText,
  setWordRangeDeleted,
} from "@/lib/transcript-edit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "../app/actions.ts";
import {
  exportProject,
  runGuiAction,
  saveBrief,
  saveBroll,
  saveLook,
  saveProjectEdits,
  saveStills,
  saveTitles,
  saveZooms,
} from "../app/actions.ts";
import { type CaptionWord, groupCaptions } from "../src/captions.ts";
import { reanchorProject } from "../src/reanchor.ts";
import { type ZoomWindow, zoomFactorAtSec } from "../src/zoom-ramp.ts";
import { CutScheduler, type Range } from "./scheduler.ts";

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
  position: "lower" | "center" | "hero";
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
  fps: number;
  graphics?: GraphicItem[];
  height: number;
  look?: { vignette: boolean; filter?: Filter; color?: ColorAdjust };
  mediaVersion?: number;
  motion?: { speed?: number };
  music?: MusicPlacementView[];
  padMs: number;
  sampleRate: number;
  // Rides on the project object from a separate editor-page-data change
  // (VAD silence spans for dead-air detection); absent/undefined/null all
  // degrade the Cleanup section to filler-only via buildCleanupCandidates.
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

const ZOOM_PRESETS: Record<string, { scale: number; rampSec: number }> = {
  Subtle: { scale: 1.15, rampSec: 0.6 },
  Punch: { scale: 1.4, rampSec: 0.35 },
  Hold: { scale: 1.25, rampSec: 1.2 },
};

// Thin Paper-style slider: short track, small thumb, soft gray fill.
const SLIDER =
  "[&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-range]]:bg-foreground/35";
const CONFIG_SIDEBAR_WIDTH = 288;
const CHAT_WIDTH_WITH_CONFIG = 360;
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
    voiceHighpass: patch.voiceHighpass
      ? { ...base.voiceHighpass, ...patch.voiceHighpass }
      : base.voiceHighpass,
  };
}

function firstSliderValue(value: number | readonly number[]): number {
  return typeof value === "number" ? value : value[0];
}

// Kept-range math itself now lives in one place (src/edl.ts effectiveRanges),
// shared with the server (exporter/query/CLI) so preview and export truth
// cannot drift; see the two effectiveRanges(project, ...) call sites below.

function outputPos(ranges: Range[], curSec: number): number {
  let cum = 0;
  for (const r of ranges) {
    if (curSec < r.startSec) {
      return cum;
    }
    if (curSec <= r.endSec) {
      return cum + (curSec - r.startSec);
    }
    cum += r.endSec - r.startSec;
  }
  return cum;
}

/** Inverse of outputPos: map a cut-space position back to source seconds. */
function sourceAtOutput(ranges: Range[], outSec: number): number {
  let cum = 0;
  for (const r of ranges) {
    const len = r.endSec - r.startSec;
    if (outSec <= cum + len) {
      return r.startSec + (outSec - cum);
    }
    cum += len;
  }
  return ranges.at(-1)?.endSec ?? 0;
}

const fmt = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// reanchorOverlay mutates overlays and their anchors in place, so every overlay
// list is cloned before the optimistic client-side reanchor below: React state
// must never alias objects that are about to be mutated.
function cloneAnchoredOverlays<T extends object>(list: readonly T[]): T[] {
  return list.map((item) => {
    const anchor = (item as { anchor?: { phrase: string } }).anchor;
    return anchor ? { ...item, anchor: { ...anchor } } : { ...item };
  });
}

// Optimistic mirror of the server-side cut/cut-text registry actions: flip
// `deleted` on the affected words, then re-resolve phrase-anchored overlays
// with the SAME engine reanchorProject the registry runs, so the preview and
// the saved project agree before the save round-trip lands.
function reanchoredWordUpdate(
  prev: Project,
  ids: ReadonlySet<string>,
  deleted: boolean
): Project {
  const next: Project = {
    ...prev,
    words: prev.words.map((w) => (ids.has(w.id) ? { ...w, deleted } : w)),
    broll: cloneAnchoredOverlays(prev.broll),
    titles: cloneAnchoredOverlays(prev.titles),
    zooms: cloneAnchoredOverlays(prev.zooms),
    stills: prev.stills ? cloneAnchoredOverlays(prev.stills) : prev.stills,
    graphics: prev.graphics
      ? cloneAnchoredOverlays(prev.graphics)
      : prev.graphics,
  };
  reanchorProject(next as unknown as EngineProject);
  return next;
}

import type { EditorChatsSnapshot } from "../app/lib/editor-chats.ts";

export function App({
  initialChats,
  initialProject,
  projects,
}: {
  initialChats: EditorChatsSnapshot;
  initialProject: Project;
  projects: ProjectListing[];
}) {
  const router = useRouter();
  const [project, setProject] = useState<Project>(initialProject);
  const [playing, setPlaying] = useState(false);
  const [curSample, setCurSample] = useState(0);
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
  const [configOpen, setConfigOpen] = useState(true);
  const [mobileRightPanel, setMobileRightPanel] = useState<
    "chat" | "config" | null
  >(null);
  // Chat sidebar width (px), drag-adjustable. Default on server; the stored
  // value is read after mount so SSR and first client render agree.
  const [chatWidth, setChatWidth] = useState(CHAT_WIDTH_DEFAULT);
  useEffect(() => {
    setChatWidth(readStoredChatWidth());
  }, []);
  const visibleChatWidth = configOpen
    ? Math.min(chatWidth, CHAT_WIDTH_WITH_CONFIG)
    : chatWidth;
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [cinema, setCinema] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [previewRate, setPreviewRate] = useState(1);
  const [previewPip, setPreviewPip] = useState(false);
  const [selAnchor, setSelAnchor] = useState<number | null>(null);
  const [selFocus, setSelFocus] = useState<number | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  // Transcript phrase search (Milestone 3.1): query, kept/cut scope, optional
  // cut rationale, and which match is active (seek target / highlight).
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<PhraseSearchMode>("kept");
  const [searchNote, setSearchNote] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState<number | null>(null);
  const transcriptSearchInputRef = useRef<HTMLInputElement>(null);
  const searchShortcutLabel = useModShortcut("f");
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
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  // In/out work area: when set, playback loops within [inSec, outSec] (source
  // time) so a single b-roll span or transition can be tightened on repeat.
  const [loop, setLoop] = useState<{ inSec: number; outSec: number } | null>(
    null
  );
  const [loopInPending, setLoopInPending] = useState<number | null>(null);
  const loopRef = useRef<{ inSec: number; outSec: number } | null>(null);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>("light");
  useEffect(() => {
    const storedColorScheme = getColorScheme();
    setColorSchemeState(storedColorScheme);
    applyColorScheme(storedColorScheme);
    return subscribeColorScheme(setColorSchemeState);
  }, []);

  useEffect(() => {
    setDefaultAgent(getDefaultAgentModel());
    return subscribeDefaultAgent(setDefaultAgent);
  }, []);
  const toggleColorScheme = useCallback(() => {
    setColorScheme(colorScheme === "dark" ? "light" : "dark");
  }, [colorScheme]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const brollRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const schedRef = useRef<CutScheduler | null>(null);
  const projectRef = useRef<Project | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveErrorRef = useRef<string | null>(null);
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
  const rangesRef = useRef(ranges);
  rangesRef.current = ranges;

  useEffect(() => {
    if (!(videoRef.current && project) || schedRef.current) {
      return;
    }
    const sched = new CutScheduler(videoRef.current, () => rangesRef.current);
    sched.onTick = (sourceSec) => {
      const lr = loopRef.current;
      if (lr && videoRef.current && sourceSec >= lr.outSec - 0.03) {
        videoRef.current.currentTime = lr.inSec;
        setCurSample(Math.round(lr.inSec * project.sampleRate));
        return;
      }
      setCurSample(Math.round(sourceSec * project.sampleRate));
    };
    sched.onEnd = () => setPlaying(false);
    schedRef.current = sched;
  }, [project]);

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
  const keptDuration = ranges.reduce((a, r) => a + (r.endSec - r.startSec), 0);
  const sr = project?.sampleRate ?? 48_000;
  const curSec = curSample / sr;
  const outPos = useMemo(() => outputPos(ranges, curSec), [ranges, curSec]);

  const captionGroups = useMemo(() => {
    if (!project) {
      return [];
    }
    const kept: CaptionWord[] = project.words
      .filter((w) => !w.deleted)
      .map((w) => ({
        text: w.text,
        startSec: w.startSample / sr,
        endSec: w.endSample / sr,
      }));
    return groupCaptions(kept, project.captions?.maxWords ?? 6);
  }, [project, sr]);
  const activeBroll = project?.broll?.find(
    (b) => curSample >= b.startSample && curSample < b.endSample
  );
  const activeBrollDisplay = activeBroll?.display ?? "cover";
  const activeCoverBroll =
    activeBroll && activeBrollDisplay === "cover" ? activeBroll : undefined;
  const activePipBroll =
    activeBroll && activeBrollDisplay === "pip" ? activeBroll : undefined;
  const activeSplitBroll =
    activeBroll && activeBrollDisplay === "split" ? activeBroll : undefined;
  const zoomWindows = useMemo<ZoomWindow[]>(
    () =>
      project
        ? (project.zooms ?? [])
            .map((z) => ({
              endSec: outputPos(ranges, z.endSample / sr),
              rampSec: z.rampSec,
              scale: z.scale,
              startSec: outputPos(ranges, z.startSample / sr),
            }))
            .filter((z) => z.endSec - z.startSec > 0.05)
        : [],
    [project, ranges, sr]
  );
  const zoomScale = activeCoverBroll ? 1 : zoomFactorAtSec(outPos, zoomWindows);
  const assetName = (id: string) =>
    project?.assets.find((a) => a.id === id)?.name ?? id;
  const brollAssets = useMemo(
    () => project?.assets.filter((a) => (a.kind ?? "broll") === "broll") ?? [],
    [project?.assets]
  );
  const stillAssets = useMemo(
    () => project?.assets.filter((a) => a.kind === "still") ?? [],
    [project?.assets]
  );
  const musicAssets = useMemo(
    () => project?.assets.filter((a) => a.kind === "music") ?? [],
    [project?.assets]
  );
  const activeMusic = project?.music?.find(
    (m) => curSample >= m.startSample && curSample < m.endSample
  );
  // Filler + dead-air candidates for the Cleanup config section. Degrades to
  // filler-only (with a warning) until project.silences is populated by the
  // editor-page-data change that loads audio analysis for this page. Cast
  // like reanchorProject above: this file's local Project is a narrower UI
  // shape than the engine's, missing fields (version, proxy, ...) the pure
  // engine helpers don't read. F6: deps are narrowed to what
  // buildCleanupCandidates/cleanupReport actually read (words, cuts,
  // silences, and the overlay arrays it checks for proximity warnings) so an
  // unrelated project.json field (look, motion, assets, ...) doesn't force a
  // recompute on every edit.
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

  useEffect(() => {
    const v = brollRef.current;
    if (!v) {
      return;
    }
    const brollForPreview =
      activeCoverBroll ?? activePipBroll ?? activeSplitBroll;
    if (!brollForPreview) {
      if (!v.paused) {
        v.pause();
      }
      return;
    }
    const url = `/media/asset/${brollForPreview.assetId}?v=${projectRef.current?.mediaVersion ?? 0}`;
    if (v.getAttribute("src") !== url) {
      v.src = url;
    }
    const want =
      brollForPreview.srcInSample / sr +
      (curSample - brollForPreview.startSample) / sr;
    if (Number.isFinite(want) && Math.abs(v.currentTime - want) > 0.25) {
      v.currentTime = Math.max(0, want);
    }
    if (playing && v.paused) {
      void v.play().catch(() => {
        // Playback can be rejected when the browser blocks autoplay.
      });
    }
    if (!(playing || v.paused)) {
      v.pause();
    }
  }, [
    activeCoverBroll,
    activePipBroll,
    activeSplitBroll,
    curSample,
    playing,
    sr,
  ]);

  // Music bed under the voice (brollRef sibling pattern): a hidden <audio>
  // follows the active placement. Its desired position is CONTINUOUS on the
  // output timeline (cuts collapse; the bed never restarts), matching the
  // exporter's one-window-per-placement semantics. Preview fades are skipped;
  // the export is the source of truth for fades.
  useEffect(() => {
    const el = musicRef.current;
    if (!el) {
      return;
    }
    if (!activeMusic) {
      if (!el.paused) {
        el.pause();
      }
      return;
    }
    const url = `/media/asset/${activeMusic.assetId}?v=${projectRef.current?.mediaVersion ?? 0}`;
    if (el.getAttribute("src") !== url) {
      el.src = url;
    }
    const asset = projectRef.current?.assets.find(
      (a) => a.id === activeMusic.assetId
    );
    const want = musicPreviewTime({
      assetDurationSec: (asset?.durationSamples ?? 0) / sr,
      curSec: curSample / sr,
      placement: {
        mode: activeMusic.mode,
        srcInSec: activeMusic.srcInSample / sr,
        startSec: activeMusic.startSample / sr,
      },
      ranges,
    });
    if (Number.isFinite(want) && Math.abs(el.currentTime - want) > 0.25) {
      el.currentTime = want;
    }
    // Match the video element's rate; a slower/faster bed would drift past the
    // 0.25s reseek guard several times a second and stutter with seeks.
    if (el.playbackRate !== previewRate) {
      el.playbackRate = previewRate;
    }
    // The master mute silences the whole preview, music bed included; the
    // music-only toggle just drops the bed.
    el.volume = musicMuted || previewMuted ? 0 : Math.min(1, activeMusic.gain);
    if (playing && el.paused) {
      void el.play().catch(() => {
        // Playback can be rejected when the browser blocks autoplay.
      });
    }
    if (!(playing || el.paused)) {
      el.pause();
    }
  }, [
    activeMusic,
    curSample,
    musicMuted,
    playing,
    previewMuted,
    previewRate,
    ranges,
    sr,
  ]);

  const enqueueSave = useCallback((task: () => Promise<ActionResult>) => {
    const run = saveChainRef.current
      .catch(() => {
        // Keep later saves moving after one failed request.
      })
      .then(async () => {
        setPendingSaves((n) => n + 1);
        setSaveError(null);
        saveErrorRef.current = null;
        try {
          const data = await task();
          if (!data.ok) {
            throw new Error(data.error ?? "save failed");
          }
        } catch (e) {
          const message = (e as Error).message;
          saveErrorRef.current = message;
          setSaveError(message);
          toastSaveError(message);
          throw e;
        } finally {
          setPendingSaves((n) => Math.max(0, n - 1));
        }
      });
    saveChainRef.current = run.catch(() => {
      // The visible error state above is the user-facing failure path.
    });
  }, []);

  const toggleWord = useCallback(
    (id: string) => {
      setProject((prev) => {
        const words = prev.words.map((w) =>
          w.id === id ? { ...w, deleted: !w.deleted } : w
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
        const words = setWordRangeDeleted(prev.words, range, deleted);
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
        const words = reconcileTranscriptText(prev.words, editedText);
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

  // Music placement dispatches through the music-add/music-set/music-rm
  // registry actions (history logs them) with optimistic setProject; the add
  // reconciles the optimistic row with the server-assigned id and clamps.
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
      setProject((prev) =>
        reanchoredWordUpdate(prev, new Set(candidate.wordIds), true)
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
      setProject((prev) =>
        reanchoredWordUpdate(prev, new Set(fillerIds), true)
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

  const onPlay = useCallback(async () => {
    const s = schedRef.current;
    if (!s) {
      return;
    }
    if (playing) {
      s.pause();
      setPlaying(false);
    } else {
      try {
        const didStart = await s.play();
        setPlaying(didStart);
        if (!didStart) {
          toastNothingToPlay();
        }
      } catch (e) {
        setPlaying(false);
        toastPlaybackFailed((e as Error).message);
      }
    }
  }, [playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (cinema || (e.key !== " " && e.key !== "Spacebar")) {
        return;
      }
      const el = e.target as HTMLElement | null;
      if (!el) {
        return;
      }
      const tag = el.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      void onPlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cinema, onPlay]);

  const onPreviewClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("[data-preview-chrome]")) {
        return;
      }
      void onPlay();
    },
    [onPlay]
  );

  const onSeek = useCallback(
    (sourceSec: number) => {
      schedRef.current?.seek(sourceSec);
      setCurSample(
        Math.round(sourceSec * (projectRef.current?.sampleRate ?? 48_000))
      );
      if (playing) {
        schedRef.current?.pause();
        setPlaying(false);
      }
    },
    [playing]
  );

  // ── Transcript phrase search + batch cuts (Milestone 3.1). Matching runs
  // through the SAME engine phrase matcher the CLI uses (phraseSearchMatches
  // wraps findPhraseRuns), so UI spans are identical to `openklip cut --text`.
  const searchMatches = useMemo(
    () =>
      phraseSearchMatches({ words: project.words }, searchQuery, {
        mode: searchMode,
      }),
    [project.words, searchQuery, searchMode]
  );
  const activeSearchIndex =
    activeMatchIndex != null && activeMatchIndex < searchMatches.length
      ? activeMatchIndex
      : null;
  const activeSearchRange =
    activeSearchIndex == null ? null : searchMatches[activeSearchIndex].range;
  const searchMatchRanges = useMemo(
    () => searchMatches.map((m) => m.range),
    [searchMatches]
  );
  const changeSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    setActiveMatchIndex(null);
  }, []);
  const changeSearchMode = useCallback((mode: PhraseSearchMode) => {
    setSearchMode(mode);
    setActiveMatchIndex(null);
  }, []);
  const clearTranscriptSearch = useCallback(() => {
    setSearchQuery("");
    setActiveMatchIndex(null);
  }, []);
  const seekSearchMatch = useCallback(
    (match: PhraseSearchMatch, index: number) => {
      setActiveMatchIndex(index);
      onSeek(match.fromSec);
    },
    [onSeek]
  );
  const seekNextSearchMatch = useCallback(() => {
    if (searchMatches.length === 0) {
      return;
    }
    const next =
      activeSearchIndex == null
        ? 0
        : (activeSearchIndex + 1) % searchMatches.length;
    setActiveMatchIndex(next);
    onSeek(searchMatches[next].fromSec);
  }, [activeSearchIndex, onSeek, searchMatches]);
  const selectSearchMatch = useCallback(
    (match: PhraseSearchMatch, index: number) => {
      setActiveMatchIndex(index);
      selectTranscriptRange(match.range);
    },
    [selectTranscriptRange]
  );
  // Cut the first (or every) matched run: optimistic word deletion + reanchor,
  // then persist the EXACT ids through the registry cut action (history logs
  // it). Persisting the phrase (cut-text) instead would let the server
  // re-resolve matches at save time and cut a different occurrence than the
  // one shown optimistically, e.g. on a double-clicked "Cut first" or after
  // an external agent edit; explicit ids keep the UI and project.json in
  // lockstep, matching how restore already works.
  const cutSearchMatches = useCallback(
    (all: boolean) => {
      const phrase = searchQuery.trim();
      const targets = all ? searchMatches : searchMatches.slice(0, 1);
      if (!phrase || targets.length === 0) {
        return;
      }
      const ids = targets.flatMap((m) => m.ids);
      const note = searchNote.trim();
      setProject((prev) => reanchoredWordUpdate(prev, new Set(ids), true));
      setActiveMatchIndex(null);
      enqueueSave(() =>
        runGuiAction(project.slug, "cut", {
          ids,
          deleted: true,
          note: note === "" ? undefined : note,
        })
      );
    },
    [enqueueSave, project.slug, searchMatches, searchNote, searchQuery]
  );
  // Restore matched runs found among cut words (cut-mode search).
  const restoreSearchMatches = useCallback(
    (all: boolean) => {
      const targets = all ? searchMatches : searchMatches.slice(0, 1);
      const ids = targets.flatMap((m) => m.ids);
      if (ids.length === 0) {
        return;
      }
      setProject((prev) => reanchoredWordUpdate(prev, new Set(ids), false));
      setActiveMatchIndex(null);
      enqueueSave(() =>
        runGuiAction(project.slug, "cut", { ids, deleted: false })
      );
    },
    [enqueueSave, project.slug, searchMatches]
  );
  // Mod+F focuses the transcript search input (skipped while typing elsewhere).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isModKeyOnly(event) || event.key.toLowerCase() !== "f") {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      transcriptSearchInputRef.current?.focus();
      transcriptSearchInputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const togglePreviewMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }
    v.muted = !v.muted;
    setPreviewMuted(v.muted);
  }, []);

  const toggleMusicMute = useCallback(() => {
    setMusicMuted((muted) => !muted);
  }, []);

  const cyclePreviewRate = useCallback(() => {
    setPreviewRate((cur) => {
      const i = PLAYER_SPEEDS.indexOf(cur as (typeof PLAYER_SPEEDS)[number]);
      const next = PLAYER_SPEEDS[(i + 1) % PLAYER_SPEEDS.length];
      if (videoRef.current) {
        videoRef.current.playbackRate = next;
      }
      return next;
    });
  }, []);

  const togglePreviewPip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) {
      return;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await v.requestPictureInPicture();
      }
    } catch {
      // PiP can be blocked; ignore.
    }
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }
    const onEnter = () => setPreviewPip(true);
    const onLeave = () => setPreviewPip(false);
    v.addEventListener("enterpictureinpicture", onEnter);
    v.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      v.removeEventListener("enterpictureinpicture", onEnter);
      v.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

  const onTimelineSelect = useCallback((kind: TimelineClipKind, id: string) => {
    setSelAnchor(null);
    setSelFocus(null);
    setSelected({ kind, id });
    const p = projectRef.current;
    const item =
      kind === "broll"
        ? p?.broll.find((b) => b.id === id)
        : kind === "zoom"
          ? p?.zooms.find((z) => z.id === id)
          : kind === "title"
            ? p?.titles.find((t) => t.id === id)
            : kind === "graphic"
              ? p?.graphics?.find((g) => g.id === id)
              : p?.stills?.find((s) => s.id === id);
    if (item) {
      schedRef.current?.seek(item.startSample / (p?.sampleRate ?? 48_000));
      setCurSample(item.startSample);
    }
  }, []);
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
      await toastPromise(
        (async () => {
          await saveChainRef.current;
          if (saveErrorRef.current) {
            throw new Error(saveErrorRef.current);
          }
          const r = await exportProject(project.slug, {
            compression: options?.compression,
            fps:
              options?.frameRate === "source" ? undefined : options?.frameRate,
            maxHeight,
            platform: options?.platform,
          });
          if (!r.ok) {
            throw new Error(r.error);
          }
          return r.data;
        })(),
        exportPromiseMessages()
      );
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
  const InspectorIcon = selZoom
    ? ZoomIn
    : selTitle
      ? Type
      : selBroll
        ? Film
        : selStill
          ? ImageIcon
          : selGraphic
            ? Sparkles
            : selRange
              ? Sparkles
              : Captions;
  const inspectorLabel = selZoom
    ? "Push-in"
    : selTitle
      ? "Title card"
      : selBroll
        ? "B-roll"
        : selStill
          ? "Still"
          : selGraphic
            ? selGraphicLabel
            : selRange
              ? "Selection"
              : "Captions";
  const inspectorBadge = selZoom
    ? fmt(selZoom.startSample / sr)
    : selTitle
      ? fmt(selTitle.startSample / sr)
      : selBroll
        ? fmt(selBroll.startSample / sr)
        : selStill
          ? fmt(selStill.startSample / sr)
          : selGraphic
            ? fmt(selGraphic.startSample / sr)
            : selRange
              ? `${selRange[1] - selRange[0] + 1}`
              : captionsOn
                ? "On"
                : "Off";
  const inspectorMeta = selZoom
    ? [
        { icon: ZoomIn, label: "Scale", value: `${selZoom.scale.toFixed(2)}x` },
        {
          icon: Clock3,
          label: "Ramp",
          value: `${selZoom.rampSec.toFixed(1)}s`,
        },
      ]
    : selTitle
      ? [
          { icon: Type, label: "Position", value: selTitle.position },
          {
            icon: Clock3,
            label: "Starts",
            value: fmt(selTitle.startSample / sr),
          },
        ]
      : selBroll
        ? [
            { icon: Film, label: "Source", value: assetName(selBroll.assetId) },
            {
              icon: Scan,
              label: "Display",
              value:
                (selBroll.display ?? "cover") === "pip"
                  ? "PiP"
                  : (selBroll.display ?? "cover") === "split"
                    ? "Split"
                    : "Cover",
            },
            {
              icon: Volume2,
              label: "Audio",
              value:
                selBroll.audioMode === "broll"
                  ? "B-roll only"
                  : selBroll.audioMode === "mix"
                    ? "Mix"
                    : selBroll.audioMode === "duck-voice"
                      ? "Duck voice"
                      : selBroll.audioMode === "duck-broll"
                        ? "Duck b-roll"
                        : "Silent",
            },
            {
              icon: Clock3,
              label: "Starts",
              value: fmt(selBroll.startSample / sr),
            },
          ]
        : selStill
          ? [
              {
                icon: ImageIcon,
                label: "Source",
                value: assetName(selStill.assetId),
              },
              {
                icon: ZoomIn,
                label: "Scale",
                value: `${selStill.scale.toFixed(2)}x`,
              },
              {
                icon: Clock3,
                label: "Starts",
                value: fmt(selStill.startSample / sr),
              },
            ]
          : selGraphic
            ? [
                {
                  icon: Sparkles,
                  label:
                    selGraphic.type === "json-render" ? "Catalog" : "Template",
                  value:
                    selGraphic.type === "json-render"
                      ? (selGraphic.catalog ?? "product-announcement")
                      : selGraphic.template,
                },
                {
                  icon: Clock3,
                  label: "Starts",
                  value: fmt(selGraphic.startSample / sr),
                },
                {
                  icon: Captions,
                  label: "Validation",
                  value: selGraphicValidation
                    ? selGraphicValidation.success
                      ? "Valid"
                      : "Invalid"
                    : "Template",
                },
              ]
            : selRange
              ? [
                  {
                    icon: Sparkles,
                    label: "Words",
                    value: `${selRange[1] - selRange[0] + 1}`,
                  },
                  {
                    icon: Clock3,
                    label: "Start",
                    value: fmt(project.words[selRange[0]].startSample / sr),
                  },
                ]
              : [
                  {
                    icon: Captions,
                    label: "Per line",
                    value: String(project.captions?.maxWords ?? 6),
                  },
                  {
                    icon: Clock3,
                    label: "Pad",
                    value: `${project.padMs ?? 50}ms`,
                  },
                ];

  const timelineWords = useMemo(
    () =>
      project.words.map((w, index) => ({
        id: w.id,
        index,
        startSample: w.startSample,
        endSample: w.endSample,
        startSec: w.startSample / sr,
        endSec: w.endSample / sr,
        deleted: w.deleted,
      })),
    [project.words, sr]
  );
  const timelineBroll = useMemo(
    () =>
      (project.broll ?? []).map((b) => ({
        id: b.id,
        startSample: b.startSample,
        endSample: b.endSample,
        startSec: b.startSample / sr,
        endSec: b.endSample / sr,
        label: assetName(b.assetId),
      })),
    [project.assets, project.broll, sr]
  );
  const timelineZooms = useMemo(
    () =>
      (project.zooms ?? []).map((z) => ({
        id: z.id,
        startSample: z.startSample,
        endSample: z.endSample,
        startSec: z.startSample / sr,
        endSec: z.endSample / sr,
        label: `${z.scale.toFixed(2)}x`,
      })),
    [project.zooms, sr]
  );
  const timelineTitles = useMemo(
    () =>
      (project.titles ?? []).map((t) => ({
        id: t.id,
        startSample: t.startSample,
        endSample: t.endSample,
        startSec: t.startSample / sr,
        endSec: t.endSample / sr,
        label: t.text.replace(/\n/g, " · "),
      })),
    [project.titles, sr]
  );
  const timelineGraphics = useMemo(
    () =>
      (project.graphics ?? []).map((g) => ({
        id: g.id,
        startSample: g.startSample,
        endSample: g.endSample,
        startSec: g.startSample / sr,
        endSec: g.endSample / sr,
        label:
          g.type === "json-render"
            ? "Announcement graphic"
            : `Graphic: ${g.template}`,
      })),
    [project.graphics, sr]
  );
  const timelinePlacedStills = useMemo(
    () =>
      (project.stills ?? []).map((s) => ({
        id: s.id,
        startSample: s.startSample,
        endSample: s.endSample,
        startSec: s.startSample / sr,
        endSec: s.endSample / sr,
        label: assetName(s.assetId),
      })),
    [project.assets, project.stills, sr]
  );
  const timelineMusic = useMemo(
    () =>
      project.assets
        .filter((a) => a.kind === "music")
        .map((a) => ({
          id: a.id,
          startSample: 0,
          endSample: a.durationSamples,
          startSec: 0,
          endSec: a.durationSamples / sr,
          label: a.name,
        })),
    [project.assets, sr]
  );
  const timelinePlacedMusic = useMemo(
    () =>
      (project.music ?? []).map((m) => ({
        id: m.id,
        startSample: m.startSample,
        endSample: m.endSample,
        startSec: m.startSample / sr,
        endSec: m.endSample / sr,
        label: assetName(m.assetId),
      })),
    [project.assets, project.music, sr]
  );
  const timelineLibraryStills = useMemo(
    () =>
      project.assets
        .filter((a) => a.kind === "still")
        .map((a) => ({
          id: a.id,
          startSample: 0,
          endSample: a.durationSamples,
          startSec: 0,
          endSec: a.durationSamples / sr,
          label: a.name,
        })),
    [project.assets, sr]
  );
  const configCloseLabel =
    mobileRightPanel === "config" ? "Close config" : "Hide config";

  const configPanel = (
    <div className="flex min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="flex w-full flex-col overflow-hidden bg-background">
        <div className="flex h-12 shrink-0 items-center gap-2 border-border border-b px-3">
          <div className="min-w-0 flex-1 truncate font-semibold text-base">
            Config
          </div>
          <Button
            aria-label={configCloseLabel}
            className="size-8 text-muted-foreground"
            onClick={() => {
              if (mobileRightPanel === "config") {
                setMobileRightPanel(null);
                return;
              }
              setConfigOpen(false);
            }}
            size="icon-sm"
            title={configCloseLabel}
            variant="ghost"
          >
            <PanelRight />
          </Button>
        </div>
        <SidebarContent className="gap-0 overflow-visible">
          <SidebarGroup>
            <SidebarGroupLabel>Inspector</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip={inspectorLabel}>
                    <InspectorIcon />
                    <span>{inspectorLabel}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{inspectorBadge}</SidebarMenuBadge>
                  <SidebarMenuSub>
                    {inspectorMeta.map((item) => (
                      <InfoSubItem
                        icon={item.icon}
                        key={item.label}
                        label={item.label}
                        value={item.value}
                      />
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {selected &&
          (selZoom || selTitle || selBroll || selStill || selGraphic) ? (
            <div className="group-data-[collapsible=icon]:hidden">
              <div className="px-3 py-3">
                <div className="flex items-center gap-2 font-medium text-sm">
                  {selZoom ? (
                    <ZoomIn className={APP_ICON_CLASS} />
                  ) : selTitle ? (
                    <Type className={APP_ICON_CLASS} />
                  ) : selStill ? (
                    <ImageIcon className={APP_ICON_CLASS} />
                  ) : selGraphic ? (
                    <Sparkles className={APP_ICON_CLASS} />
                  ) : (
                    <Film className={APP_ICON_CLASS} />
                  )}
                  {selZoom
                    ? "Push-in"
                    : selTitle
                      ? "Title card"
                      : selStill
                        ? "Still"
                        : selGraphic
                          ? selGraphicLabel
                          : "B-roll"}
                  <span className="ml-auto text-muted-foreground text-xs tabular-nums">
                    {selZoom &&
                      `${fmt(selZoom.startSample / sr)}–${fmt(selZoom.endSample / sr)}`}
                    {selTitle &&
                      `${fmt(selTitle.startSample / sr)}–${fmt(selTitle.endSample / sr)}`}
                    {selBroll &&
                      `${fmt(selBroll.startSample / sr)}–${fmt(selBroll.endSample / sr)}`}
                    {selStill &&
                      `${fmt(selStill.startSample / sr)}–${fmt(selStill.endSample / sr)}`}
                    {selGraphic &&
                      `${fmt(selGraphic.startSample / sr)}–${fmt(selGraphic.endSample / sr)}`}
                  </span>
                </div>
              </div>

              {selZoom && (
                <>
                  <Section title="Parameters">
                    <PropRow
                      label="Scale"
                      value={`${selZoom.scale.toFixed(2)}×`}
                    >
                      <Slider
                        className={SLIDER}
                        max={3}
                        min={1}
                        onValueChange={(value) =>
                          updateZoom(selZoom.id, {
                            scale: firstSliderValue(value),
                          })
                        }
                        step={0.05}
                        value={[selZoom.scale]}
                      />
                    </PropRow>
                    <PropRow
                      label="Ramp"
                      value={`${selZoom.rampSec.toFixed(1)}s`}
                    >
                      <Slider
                        className={SLIDER}
                        max={5}
                        min={0}
                        onValueChange={(value) =>
                          updateZoom(selZoom.id, {
                            rampSec: firstSliderValue(value),
                          })
                        }
                        step={0.1}
                        value={[selZoom.rampSec]}
                      />
                    </PropRow>
                  </Section>
                  <Section title="Preset">
                    <ToggleGroup
                      className="w-full"
                      onValueChange={(value) => {
                        const preset = firstToggleValue(value);
                        if (preset && ZOOM_PRESETS[preset]) {
                          updateZoom(selZoom.id, ZOOM_PRESETS[preset]);
                        }
                      }}
                      size="sm"
                      spacing={0}
                      value={[presetOf(selZoom)].filter(Boolean)}
                      variant="outline"
                    >
                      {Object.keys(ZOOM_PRESETS).map((k) => (
                        <ToggleGroupItem className="flex-1" key={k} value={k}>
                          {k}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </Section>
                </>
              )}

              {selTitle && (
                <Section title="Title">
                  {selTitle.position === "hero" ? (
                    <Textarea
                      onChange={(e) =>
                        updateTitle(selTitle.id, {
                          text: e.target.value,
                        })
                      }
                      placeholder={"Headline\nSubtitle (optional second line)"}
                      rows={3}
                      value={selTitle.text}
                    />
                  ) : (
                    <Input
                      onChange={(e) =>
                        updateTitle(selTitle.id, {
                          text: e.target.value,
                        })
                      }
                      placeholder="Title text"
                      value={selTitle.text}
                    />
                  )}
                  <div className="mt-2">
                    <Select
                      onValueChange={(v) => {
                        if (v) {
                          updateTitle(selTitle.id, {
                            position: v as "lower" | "center" | "hero",
                          });
                        }
                      }}
                      value={selTitle.position}
                    >
                      <SelectTrigger className="w-full" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="lower">Lower third</SelectItem>
                          <SelectItem value="center">Centered</SelectItem>
                          <SelectItem value="hero">Hero card</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </Section>
              )}

              {selBroll && brollAssets.length > 0 && (
                <>
                  <Section title="Display">
                    <ToggleGroup
                      className="w-full"
                      onValueChange={(value) => {
                        const mode = firstToggleValue(value);
                        if (
                          mode === "cover" ||
                          mode === "pip" ||
                          mode === "split"
                        ) {
                          updateBroll(selBroll.id, { display: mode });
                        }
                      }}
                      size="sm"
                      spacing={0}
                      value={[selBroll.display ?? "cover"]}
                      variant="outline"
                    >
                      <ToggleGroupItem className="flex-1" value="cover">
                        Cover
                      </ToggleGroupItem>
                      <ToggleGroupItem className="flex-1" value="pip">
                        PiP
                      </ToggleGroupItem>
                      <ToggleGroupItem className="flex-1" value="split">
                        Split
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </Section>
                  <Section title="Audio">
                    <Select
                      onValueChange={(v) => {
                        if (
                          v === "silent" ||
                          v === "broll" ||
                          v === "mix" ||
                          v === "duck-voice" ||
                          v === "duck-broll"
                        ) {
                          updateBroll(selBroll.id, { audioMode: v });
                        }
                      }}
                      value={selBroll.audioMode ?? "silent"}
                    >
                      <SelectTrigger className="w-full" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="silent">
                            Silent (voice only)
                          </SelectItem>
                          <SelectItem value="broll">
                            B-roll audio only
                          </SelectItem>
                          <SelectItem value="mix">Mix with voice</SelectItem>
                          <SelectItem value="duck-voice">
                            Duck voice under b-roll
                          </SelectItem>
                          <SelectItem value="duck-broll">
                            Duck b-roll under voice
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Section>
                  <Section title="Source">
                    <Select
                      onValueChange={(v) =>
                        v &&
                        updateBroll(selBroll.id, {
                          assetId: v,
                        })
                      }
                      value={selBroll.assetId}
                    >
                      <SelectTrigger className="w-full" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {brollAssets.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {(project.broll ?? []).length > 1 && (
                      <div className="mt-3">
                        <span className="text-muted-foreground text-xs">
                          Paint order : drag to restack
                        </span>
                        <div className="mt-1.5">
                          <OverlaySortable
                            onReorder={reorderBrollOrder}
                            onSelect={(id) =>
                              setSelected({
                                kind: "broll",
                                id,
                              })
                            }
                            rows={(project.broll ?? []).map((b) => ({
                              id: b.id,
                              label: assetName(b.assetId),
                            }))}
                            selectedId={selected?.id}
                          />
                        </div>
                      </div>
                    )}
                  </Section>
                </>
              )}

              {selStill && stillAssets.length > 0 && (
                <>
                  <Section title="Source">
                    <Select
                      onValueChange={(v) =>
                        v &&
                        updateStill(selStill.id, {
                          assetId: v,
                        })
                      }
                      value={selStill.assetId}
                    >
                      <SelectTrigger className="w-full" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {stillAssets.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Section>
                  <Section title="Ken Burns">
                    <PropRow
                      label="Scale"
                      value={`${selStill.scale.toFixed(2)}×`}
                    >
                      <Slider
                        className={SLIDER}
                        max={3}
                        min={1}
                        onValueChange={(value) =>
                          updateStill(selStill.id, {
                            scale: firstSliderValue(value),
                          })
                        }
                        step={0.05}
                        value={[selStill.scale]}
                      />
                    </PropRow>
                  </Section>
                </>
              )}

              {selGraphic && (
                <Section title="Graphic">
                  <PropRow
                    label={
                      selGraphic.type === "json-render" ? "Catalog" : "Template"
                    }
                    value={
                      selGraphic.type === "json-render"
                        ? (selGraphic.catalog ?? "product-announcement")
                        : selGraphic.template
                    }
                  >
                    <span className="truncate text-muted-foreground text-xs">
                      {selGraphic.type === "json-render"
                        ? "JSON graphic"
                        : "Template graphic"}
                    </span>
                  </PropRow>
                  {selGraphic.type === "json-render" && (
                    <PropRow
                      label="Validation"
                      value={
                        selGraphicValidation?.success ? "Valid" : "Invalid"
                      }
                    >
                      <span className="truncate text-muted-foreground text-xs">
                        {selGraphicValidation?.success
                          ? "Ready to export"
                          : (selGraphicValidation?.issues[0] ?? "Invalid spec")}
                      </span>
                    </PropRow>
                  )}
                </Section>
              )}

              <div className="p-3">
                <Button
                  className="w-full"
                  onClick={removeSelected}
                  size="sm"
                  variant="destructive"
                >
                  <Trash2 data-icon="inline-start" /> Remove effect
                </Button>
              </div>
            </div>
          ) : selRange ? (
            <div className="group-data-[collapsible=icon]:hidden">
              <div className="px-3 py-3 font-medium text-sm">
                Selection
                <span className="ml-2 text-muted-foreground text-xs">
                  {selRange[1] - selRange[0] + 1} words
                </span>
              </div>
              <Section title="Add effect">
                <Button
                  className="w-full justify-start"
                  onClick={addZoom}
                  size="sm"
                  variant="secondary"
                >
                  <ZoomIn data-icon="inline-start" /> Push in
                </Button>
                <div className="mt-2 flex gap-2">
                  <Select
                    onValueChange={(value) => {
                      if (value) {
                        setChosenAsset(value);
                      }
                    }}
                    value={chosenAsset}
                  >
                    <SelectTrigger
                      className="flex-1"
                      disabled={brollAssets.length === 0}
                      size="sm"
                    >
                      <SelectValue placeholder="No b-roll" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {brollAssets.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    aria-label="Add b-roll"
                    disabled={brollAssets.length === 0}
                    onClick={addBroll}
                    size="icon-sm"
                    variant="secondary"
                  >
                    <Film />
                  </Button>
                </div>
                <div className="mt-2 flex gap-2">
                  <Select
                    onValueChange={(value) => {
                      if (value) {
                        setChosenStillAsset(value);
                      }
                    }}
                    value={chosenStillAsset}
                  >
                    <SelectTrigger
                      className="flex-1"
                      disabled={stillAssets.length === 0}
                      size="sm"
                    >
                      <SelectValue placeholder="No still" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {stillAssets.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    aria-label="Add still"
                    disabled={stillAssets.length === 0}
                    onClick={addStill}
                    size="icon-sm"
                    variant="secondary"
                  >
                    <ImageIcon />
                  </Button>
                </div>
              </Section>
              <Section title="Title">
                {titlePos === "hero" ? (
                  <Textarea
                    onChange={(e) => setTitleText(e.target.value)}
                    placeholder={"Headline\nSubtitle (optional second line)"}
                    rows={3}
                    value={titleText}
                  />
                ) : (
                  <Input
                    onChange={(e) => setTitleText(e.target.value)}
                    placeholder="Title text"
                    value={titleText}
                  />
                )}
                <div className="mt-2 flex gap-2">
                  <Select
                    onValueChange={(v) => {
                      if (v) {
                        setTitlePos(v as "lower" | "center" | "hero");
                      }
                    }}
                    value={titlePos}
                  >
                    <SelectTrigger className="flex-1" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="lower">Lower third</SelectItem>
                        <SelectItem value="center">Centered</SelectItem>
                        <SelectItem value="hero">Hero card</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    aria-label="Add title"
                    disabled={!titleText.trim()}
                    onClick={addTitle}
                    size="icon-sm"
                    variant="secondary"
                  >
                    <Type />
                  </Button>
                </div>
              </Section>
              <div className="p-3">
                <Button
                  className="text-muted-foreground"
                  onClick={clearSel}
                  size="sm"
                  variant="ghost"
                >
                  Clear selection
                </Button>
              </div>
            </div>
          ) : (
            <div className="group-data-[collapsible=icon]:hidden">
              <Section title="Color temp">
                <ColorTempPad color={color} onColorChange={changeColor} />
              </Section>
              <Section title="Captions">
                <PropRow
                  label="Per line"
                  value={String(project.captions?.maxWords ?? 6)}
                >
                  <Slider
                    className={SLIDER}
                    max={12}
                    min={1}
                    onValueChange={(value) =>
                      setMaxWords(firstSliderValue(value))
                    }
                    step={1}
                    value={[project.captions?.maxWords ?? 6]}
                  />
                </PropRow>
              </Section>
              <Section title="Caption style">
                <CaptionStylePicker
                  onSelect={setCaptionStyle}
                  selected={project.captions?.style ?? DEFAULT_CAPTION_STYLE}
                />
              </Section>
              <Section title="Timing">
                <PropRow label="Pad" value={`${project.padMs ?? 50}ms`}>
                  <Slider
                    className={SLIDER}
                    max={200}
                    min={0}
                    onValueChange={(value) => setPad(firstSliderValue(value))}
                    step={5}
                    value={[project.padMs ?? 50]}
                  />
                </PropRow>
              </Section>
              <p className="px-3 py-3 text-muted-foreground text-xs leading-relaxed">
                Select a word range in the transcript to add a push-in, b-roll,
                or title. Click an effect to edit it here.
              </p>
            </div>
          )}
          <div className="group-data-[collapsible=icon]:hidden">
            <Section title="Brief">
              <BriefEditor
                initialBrief={project.brief ?? ""}
                onSave={async (text) => {
                  const r = await saveBrief(project.slug, text);
                  if (r.ok) {
                    setProject((prev) => ({ ...prev, brief: text }));
                    return { ok: true };
                  }
                  return { ok: false, error: r.error };
                }}
                slug={project.slug}
              />
            </Section>
            <Section title="Cleanup">
              <CleanupPanel
                applying={pendingSaves > 0}
                onApply={applyCleanupCandidate}
                onApplyAllSafe={applyAllSafeCleanup}
                report={cleanupReportView}
              />
            </Section>
            <Section title="Music">
              <MusicSectionControls
                assetName={assetName}
                assets={musicAssets.map((a) => ({ id: a.id, name: a.name }))}
                chosenAssetId={
                  musicAssets.some((a) => a.id === chosenMusicAsset)
                    ? chosenMusicAsset
                    : ""
                }
                onAdd={addMusicPlacement}
                onChooseAsset={setChosenMusicAsset}
                onPatch={patchMusicPlacement}
                onRemove={removeMusicPlacement}
                placements={project.music ?? []}
                sampleRate={sr}
              />
            </Section>
            <Section title="Audio">
              <AudioControls
                applying={pendingSaves > 0}
                audio={project.audio ?? DEFAULT_AUDIO}
                onPatchAudio={patchAudio}
                onPatchSnap={patchSnap}
                snap={project.cuts?.snap ?? DEFAULT_CUT_SNAP}
              />
            </Section>
            <Section title="History">
              <HistoryPanel
                onReverted={onHistoryReverted}
                slug={project.slug}
              />
            </Section>
          </div>
        </SidebarContent>
      </div>
    </div>
  );

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
            exportDisabled={exportDisabled}
            exportLabel={exportLabel}
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
                  "--sidebar-width": `${chatWidth}px`,
                  "--sidebar-width-icon": "3.25rem",
                } as CSSProperties
              }
            >
              <EditorSidebarShortcuts agentSidebar={agentSidebar} />
              {/* CENTER : preview + transcript (or settings) */}
              <SidebarInset className="flex min-h-[28rem] min-w-0 flex-col bg-background md:min-h-0">
                {settingsOpen ? (
                  <SettingsView
                    activeSection={settingsSection}
                    defaultAgent={defaultAgent}
                    export1080={export1080}
                    onDefaultAgentChange={setDefaultAgentModel}
                    onExport1080Change={setExport1080}
                  />
                ) : (
                  <>
                    <div className="flex h-12 shrink-0 items-center gap-2 border-border border-b px-3">
                      {agentSidebar.isMobile || !agentSidebar.open ? (
                        <AgentSidebarToolbarTrigger
                          onToggle={agentSidebar.toggleSidebar}
                        />
                      ) : null}
                      {agentSidebar.isMobile || !agentSidebar.open ? (
                        <div className="h-4 w-px bg-foreground/10" />
                      ) : null}
                      <div className="min-w-0">
                        <div className="font-medium text-sm">Editor</div>
                        <div className="truncate text-muted-foreground text-xs">
                          {ranges.length} cuts · {fmt(keptDuration)} /{" "}
                          {fmt(fullDur)}
                        </div>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <ExportDialog
                          defaultResolution={export1080 ? "1080" : "4k"}
                          disabled={exportDisabled}
                          durationSec={keptDuration}
                          onExport={onExport}
                          sourceFps={project.fps}
                          sourceHeight={project.height}
                          sourceWidth={project.width}
                        >
                          <ActionStatusButton
                            busy={exporting || pendingSaves > 0}
                            disabled={exportDisabled}
                            icon={Download}
                            label={exportLabel}
                            size="sm"
                            variant="default"
                          />
                        </ExportDialog>
                        <ToggleGroup
                          aria-label="Preview aspect ratio"
                          onValueChange={(value) => {
                            const nextOrientation = Array.isArray(value)
                              ? value[0]
                              : value;
                            if (nextOrientation) {
                              setOrientation(nextOrientation as Orientation);
                            }
                          }}
                          size="sm"
                          spacing={0}
                          type="single"
                          value={orientation}
                          variant="outline"
                        >
                          {(
                            ["landscape", "portrait", "square"] as Orientation[]
                          ).map((o) => (
                            <ToggleGroupItem
                              aria-label={`Preview ${ORIENTATION_LABEL[o]}`}
                              key={o}
                              value={o}
                            >
                              {ORIENTATION_LABEL[o]}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                        <Button
                          aria-label="Toggle color scheme"
                          onClick={toggleColorScheme}
                          size="icon-sm"
                          variant="ghost"
                        >
                          {colorScheme === "dark" ? <Sun /> : <Moon />}
                        </Button>
                        <Button
                          aria-label="Open chat"
                          className="xl:hidden"
                          onClick={() => setMobileRightPanel("chat")}
                          size="icon-sm"
                          title="Open chat"
                          variant={
                            mobileRightPanel === "chat" ? "secondary" : "ghost"
                          }
                        >
                          <MessageSquare />
                        </Button>
                        <Button
                          aria-label="Open config"
                          className="xl:hidden"
                          onClick={() => setMobileRightPanel("config")}
                          size="icon-sm"
                          title="Open config"
                          variant={
                            mobileRightPanel === "config"
                              ? "secondary"
                              : "ghost"
                          }
                        >
                          <PanelRight />
                        </Button>
                        <Button
                          aria-label="Toggle config"
                          className="hidden xl:inline-flex"
                          onClick={() => setConfigOpen((open) => !open)}
                          size="icon-sm"
                          title="Toggle config"
                          variant={configOpen ? "secondary" : "ghost"}
                        >
                          <PanelRight />
                        </Button>
                      </div>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="shrink-0 space-y-3 border-border border-b p-4">
                        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2">
                          <FindFillerButton />
                          <VerifyCutButton />
                          <Drawer
                            onOpenChange={setTimelineOpen}
                            open={timelineOpen}
                          >
                            <DrawerTrigger
                              render={
                                <Button size="sm" variant="outline">
                                  Timeline
                                </Button>
                              }
                            />
                            <DrawerContent className="max-h-[85vh]">
                              <DrawerHeader className="pb-2">
                                <DrawerTitle className="flex items-center justify-between font-medium text-sm">
                                  <span>Timeline</span>
                                  <span className="font-normal text-muted-foreground tabular-nums">
                                    {fmt(curSec)} / {fmt(fullDur)}
                                  </span>
                                </DrawerTitle>
                              </DrawerHeader>
                              <EditTimeline
                                broll={timelineBroll}
                                curSec={curSec}
                                durationSamples={project.durationSamples}
                                durationSec={fullDur}
                                graphics={timelineGraphics}
                                libraryMusic={timelineMusic}
                                libraryStills={timelineLibraryStills}
                                music={timelinePlacedMusic}
                                onClipTiming={onClipTiming}
                                onSeek={onSeek}
                                onSelect={onTimelineSelect}
                                onWordClick={onTimelineWordClick}
                                ranges={ranges}
                                sampleRate={sr}
                                selected={selected}
                                selRange={selRange}
                                stills={timelinePlacedStills}
                                titles={timelineTitles}
                                wordSpans={timelineWords}
                                zooms={timelineZooms}
                              />
                            </DrawerContent>
                          </Drawer>
                        </div>
                        <div className="mx-auto w-full max-w-2xl">
                          <div
                            className="group/preview relative cursor-pointer overflow-hidden rounded-lg border border-border bg-black"
                            onClick={onPreviewClick}
                            style={
                              orientation === "landscape"
                                ? {
                                    width: "100%",
                                    aspectRatio: String(
                                      ORIENTATION_RATIO.landscape
                                    ),
                                  }
                                : {
                                    height: "min(42vh, 50vw)",
                                    aspectRatio: String(
                                      ORIENTATION_RATIO[orientation]
                                    ),
                                  }
                            }
                          >
                            {/* biome-ignore lint/a11y/useMediaCaption: editor preview; transcript is the caption source */}
                            <video
                              className={cn(
                                "block bg-black object-cover",
                                activeSplitBroll
                                  ? "absolute inset-y-0 left-0 z-0 h-full w-1/2"
                                  : "h-full w-full"
                              )}
                              playsInline
                              ref={videoRef}
                              src={`/media/proxy.mp4?v=${project.mediaVersion ?? 0}`}
                              style={{
                                transform: `scale(${zoomScale})`,
                                transformOrigin: "center",
                                transition: "transform 0.25s ease-out",
                              }}
                            />
                            <video
                              className={cn(
                                "absolute z-[1] bg-black object-cover",
                                activeCoverBroll
                                  ? "inset-0 block h-full w-full"
                                  : activePipBroll
                                    ? "right-2 bottom-2 block aspect-video w-[28%] rounded-md border border-white/25 shadow-lg"
                                    : activeSplitBroll
                                      ? "inset-y-0 right-0 block h-full w-1/2"
                                      : "hidden"
                              )}
                              muted
                              playsInline
                              ref={brollRef}
                            />
                            {/* biome-ignore lint/a11y/useMediaCaption: hidden music bed for preview; the transcript is the caption source */}
                            <audio
                              className="hidden"
                              playsInline
                              ref={musicRef}
                            />
                            {vignetteOn && (
                              <div
                                className="pointer-events-none absolute inset-0 z-[2]"
                                style={{
                                  background:
                                    "radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.62) 100%)",
                                }}
                              />
                            )}
                            <PreviewOverlays
                              captionGroups={captionGroups}
                              captionStyleId={project.captions?.style}
                              captionsOn={captionsOn}
                              curSample={curSample}
                              graphics={project.graphics ?? []}
                              sampleRate={sr}
                              titles={project.titles ?? []}
                            />
                            {(exporting || pendingSaves > 0) && (
                              <div className="pointer-events-none absolute top-2 right-2 z-[5] flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 font-medium text-white text-xs backdrop-blur">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                                {exporting ? "Exporting…" : "Rebuilding…"}
                              </div>
                            )}
                            {/* Linear-parity transport, shared with the cinema overlay */}
                            <PlayerControls
                              captionsOn={captionsOn}
                              className="absolute inset-x-0 bottom-0 z-[6] px-3 pb-2 opacity-0 transition-opacity duration-200 ease-out focus-within:opacity-100 group-hover/preview:opacity-100"
                              current={outPos}
                              duration={keptDuration}
                              fullscreenLabel="Open cinema player"
                              musicMuted={musicMuted}
                              muted={previewMuted}
                              onCycleSpeed={cyclePreviewRate}
                              onFullscreen={() => setCinema(true)}
                              onPlayToggle={onPlay}
                              onSeekFraction={(frac) =>
                                onSeek(
                                  sourceAtOutput(ranges, frac * keptDuration)
                                )
                              }
                              onToggleCaptions={() =>
                                toggleCaptions(!captionsOn)
                              }
                              onToggleMusicMute={
                                (project.music?.length ?? 0) > 0
                                  ? toggleMusicMute
                                  : undefined
                              }
                              onToggleMute={togglePreviewMute}
                              onTogglePip={togglePreviewPip}
                              pipOn={previewPip}
                              playing={playing}
                              rate={previewRate}
                            />
                          </div>
                        </div>

                        {/* OpenKlip-specific controls (no Linear analogue) */}
                        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2 md:flex-nowrap md:gap-3">
                          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                            {fmt(outPos)} / {fmt(keptDuration)}
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              aria-label="Set loop in-point"
                              onClick={() => setLoopInPending(curSec)}
                              size="sm"
                              variant="outline"
                            >
                              In
                            </Button>
                            <Button
                              aria-label="Set loop out-point"
                              onClick={() => {
                                const r = clampLoopRegion(
                                  loopInPending ?? 0,
                                  curSec,
                                  fullDur
                                );
                                if (r) {
                                  setLoop(r);
                                }
                              }}
                              size="sm"
                              variant="outline"
                            >
                              Out
                            </Button>
                            {loop && (
                              <Button
                                aria-label="Clear loop region"
                                className="text-muted-foreground text-xs"
                                onClick={() => {
                                  setLoop(null);
                                  setLoopInPending(null);
                                }}
                                size="sm"
                                variant="ghost"
                              >
                                Loop {fmt(loop.inSec)}–{fmt(loop.outSec)} ✕
                              </Button>
                            )}
                          </div>
                          <Select
                            onValueChange={(v) => {
                              if (v) {
                                changeMotionSpeed(Number(v));
                              }
                            }}
                            value={String(motionSpeed)}
                          >
                            <SelectTrigger
                              aria-label="Motion speed"
                              className="ml-auto w-[8rem]"
                              size="sm"
                            >
                              <SelectValue placeholder="Motion" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="0.7">Slower</SelectItem>
                                <SelectItem value="1">Default</SelectItem>
                                <SelectItem value="1.4">Snappy</SelectItem>
                                <SelectItem value="1.8">Snappier</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <Select
                            onValueChange={(v) => {
                              if (v) {
                                changeFilter(v as Filter);
                              }
                            }}
                            value={filter}
                          >
                            <SelectTrigger
                              aria-label="Filter"
                              className="w-[8.5rem]"
                              size="sm"
                            >
                              <SelectValue placeholder="Filter">
                                {filterLabel(filter)}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {FILTER_OPTIONS.map((g) => (
                                  <SelectItem key={g.id} value={g.id}>
                                    {g.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FilterControls
                            atSec={curSec}
                            color={color}
                            filter={filter}
                            onColor={changeColor}
                            onFilter={changeFilter}
                            slug={project.slug}
                          />
                          <Toggle
                            aria-label="Vignette"
                            onPressedChange={toggleVignette}
                            pressed={vignetteOn}
                            size="sm"
                            variant="outline"
                          >
                            Vignette
                          </Toggle>
                        </div>
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col">
                        <EditorTranscriptPanel
                          activeMatchRange={activeSearchRange}
                          curSample={curSample}
                          inBroll={inBroll}
                          inZoom={inZoom}
                          matchRanges={searchMatchRanges}
                          onCutSelection={cutSelection}
                          onRestoreSelection={restoreSelection}
                          onSelectRange={selectTranscriptRange}
                          onTextEdit={reconcileTranscriptEdit}
                          search={
                            <TranscriptSearch
                              activeMatchIndex={activeSearchIndex}
                              matches={searchMatches}
                              mode={searchMode}
                              note={searchNote}
                              onCutMatches={cutSearchMatches}
                              onModeChange={changeSearchMode}
                              onNoteChange={setSearchNote}
                              onQueryChange={changeSearchQuery}
                              onRestoreMatches={restoreSearchMatches}
                              onSearchClear={clearTranscriptSearch}
                              onSeekMatch={seekSearchMatch}
                              onSeekNextMatch={seekNextSearchMatch}
                              onSelectMatch={selectSearchMatch}
                              query={searchQuery}
                              searchInputRef={transcriptSearchInputRef}
                              shortcutLabel={searchShortcutLabel}
                            />
                          }
                          selRange={selRange}
                          words={project.words}
                        />
                      </div>
                    </div>
                  </>
                )}
              </SidebarInset>

              {/* RIGHT : chat, then config */}
              {settingsOpen ? null : (
                <>
                  <aside
                    className="relative hidden min-h-0 shrink-0 border-border border-l bg-background xl:flex"
                    style={{ width: visibleChatWidth }}
                  >
                    <ChatResizeHandle
                      onResize={setChatWidth}
                      rightOffset={configOpen ? CONFIG_SIDEBAR_WIDTH : 0}
                      width={visibleChatWidth}
                    />
                    <AgentChatPanel
                      onAssetsUpdated={applyAssetUpdate}
                      showSidebarTrigger={false}
                      slug={project.slug}
                    />
                  </aside>
                  {configOpen ? (
                    <aside
                      className="hidden min-h-0 shrink-0 border-border border-l bg-background xl:flex"
                      style={{ width: CONFIG_SIDEBAR_WIDTH }}
                    >
                      {configPanel}
                    </aside>
                  ) : null}
                  {mobileRightPanel === null ? null : (
                    <div className="fixed inset-0 z-50 xl:hidden">
                      <button
                        aria-label="Close panel"
                        className="absolute inset-0 bg-black/10"
                        onClick={() => setMobileRightPanel(null)}
                        type="button"
                      />
                      <section
                        aria-label={
                          mobileRightPanel === "chat" ? "Chat" : "Config"
                        }
                        aria-modal="true"
                        className="absolute inset-x-0 bottom-0 flex h-[88vh] max-h-[88vh] flex-col overflow-hidden rounded-t-xl border-border border-t bg-background text-foreground shadow-lg"
                        role="dialog"
                      >
                        <div className="flex min-h-0 flex-1 overflow-hidden">
                          {mobileRightPanel === "chat" ? (
                            <AgentChatPanel
                              onAssetsUpdated={applyAssetUpdate}
                              onClose={() => setMobileRightPanel(null)}
                              showSidebarTrigger={false}
                              slug={project.slug}
                            />
                          ) : null}
                          {mobileRightPanel === "config" ? configPanel : null}
                        </div>
                      </section>
                    </div>
                  )}
                </>
              )}
            </SidebarProvider>
          )}
        </SidebarContextBridge>
      </SidebarProvider>
    </AgentChatProvider>
  );
}

function InfoSubItem({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        render={
          <span>
            <Icon className={APP_ICON_CLASS} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
              {value}
            </span>
          </span>
        }
      />
    </SidebarMenuSubItem>
  );
}

function SidebarContextBridge({
  children,
}: {
  children: (context: ReturnType<typeof useSidebar>) => ReactNode;
}) {
  return children(useSidebar());
}

function AgentSidebarToolbarTrigger({ onToggle }: { onToggle: () => void }) {
  const shortcut = useModShortcut("b");
  const label = `Toggle agent sidebar (${shortcut})`;

  return (
    <Button
      aria-label={label}
      className="size-7 shrink-0 text-muted-foreground/75 hover:text-foreground"
      onClick={onToggle}
      size="icon-xs"
      title={label}
      variant="ghost"
    >
      <PanelLeft />
    </Button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SidebarGroup className="border-border border-t p-0">
      <Collapsible defaultOpen render={<div />}>
        <CollapsibleTrigger
          render={
            <Button
              className="h-12 w-full justify-start rounded-none px-3 font-semibold text-[0.78rem] text-foreground/75 uppercase tracking-normal hover:bg-muted/60 [&[data-panel-open]>svg.chevron]:rotate-90"
              type="button"
              variant="ghost"
            >
              <span className="min-w-0 flex-1 truncate text-left">{title}</span>
              <ChevronRight className="chevron size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
            </Button>
          }
        />
        <CollapsibleContent>
          <SidebarGroupContent className="px-3 pb-4">
            <FieldGroup className="gap-3">{children}</FieldGroup>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}

function PropRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <Field className="grid h-7 grid-cols-[4.25rem_1fr_2.5rem] items-center gap-2.5">
      <FieldLabel className="text-muted-foreground text-xs">{label}</FieldLabel>
      {children}
      <span className="text-right text-xs tabular-nums">{value}</span>
    </Field>
  );
}

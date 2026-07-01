"use client";

import type { ColorAdjust, Filter } from "@engine/edl";
import { FILTER_OPTIONS, filterLabel } from "@engine/filter";
import { validateProductAnnouncementSpec } from "@engine/product-announcement";
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
import {
  CHAT_WIDTH_DEFAULT,
  ChatResizeHandle,
  readStoredChatWidth,
} from "@/components/chat-resize-handle";
import { CinemaPlayer } from "@/components/cinema-player";
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
import { OverlaySortable } from "@/components/overlay-sortable";
import { PLAYER_SPEEDS, PlayerControls } from "@/components/player-controls";
import { PreviewOverlays } from "@/components/preview-overlays";
import { SettingsView } from "@/components/settings/settings-view";
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
  Sparkles,
  Sun,
  Trash2,
  Type,
  ZoomIn,
} from "@/lib/icon";
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
import {
  reconcileTranscriptText,
  setWordRangeDeleted,
} from "@/lib/transcript-edit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "../app/actions.ts";
import {
  exportProject,
  runGuiAction,
  saveBroll,
  saveLook,
  saveProjectEdits,
  saveStills,
  saveTitles,
  saveZooms,
} from "../app/actions.ts";
import { type CaptionWord, groupCaptions } from "../src/captions.ts";
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
  broll: BrollItem[];
  captions?: { enabled: boolean; maxWords?: number };
  dirPath: string;
  durationSamples: number;
  fps: number;
  graphics?: GraphicItem[];
  height: number;
  look?: { vignette: boolean; filter?: Filter; color?: ColorAdjust };
  mediaVersion?: number;
  motion?: { speed?: number };
  padMs: number;
  sampleRate: number;
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

function firstSliderValue(value: number | readonly number[]): number {
  return typeof value === "number" ? value : value[0];
}

function firstToggleValue(
  value: string | readonly string[]
): string | undefined {
  return typeof value === "string" ? value : value[0];
}

function survivingRanges(project: Project): Range[] {
  const pad = (project.padMs ?? 50) / 1000;
  const dur = project.durationSamples / project.sampleRate;
  const raw: Array<{ start: number; end: number }> = [];
  let cur: { start: number; end: number } | null = null;
  for (const w of project.words) {
    if (w.deleted) {
      if (cur) {
        raw.push(cur);
        cur = null;
      }
      continue;
    }
    const s = w.startSample / project.sampleRate;
    const e = w.endSample / project.sampleRate;
    if (cur) {
      cur.end = Math.max(cur.end, e);
    } else {
      cur = { start: s, end: e };
    }
  }
  if (cur) {
    raw.push(cur);
  }
  const padded: Range[] = raw.map((r, index) => ({
    startSec: Math.max(index === 0 ? 0 : r.start, r.start - pad),
    endSec: Math.min(
      index === raw.length - 1 ? dur || r.end + pad : r.end,
      r.end + pad
    ),
  }));
  const merged: Range[] = [];
  for (const r of padded) {
    const last = merged[merged.length - 1];
    if (last && r.startSec <= last.endSec) {
      last.endSec = Math.max(last.endSec, r.endSec);
    } else {
      merged.push({ ...r });
    }
  }
  return merged.filter((r) => r.endSec - r.startSec > 0.01);
}

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
  const [previewRate, setPreviewRate] = useState(1);
  const [previewPip, setPreviewPip] = useState(false);
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
  const schedRef = useRef<CutScheduler | null>(null);
  const projectRef = useRef<Project | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveErrorRef = useRef<string | null>(null);
  projectRef.current = project;

  useEffect(() => {
    if (!(videoRef.current && project) || schedRef.current) {
      return;
    }
    const sched = new CutScheduler(videoRef.current, () =>
      survivingRanges(projectRef.current as Project)
    );
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

  const ranges = useMemo(
    () => (project ? survivingRanges(project) : []),
    [project]
  );
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
    },
    [chosenAsset]
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
  const zoomScale = activeBroll ? 1 : zoomFactorAtSec(outPos, zoomWindows);
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

  useEffect(() => {
    const v = brollRef.current;
    if (!v) {
      return;
    }
    if (!activeBroll) {
      if (!v.paused) {
        v.pause();
      }
      return;
    }
    const url = `/media/asset/${activeBroll.assetId}?v=${projectRef.current?.mediaVersion ?? 0}`;
    if (v.getAttribute("src") !== url) {
      v.src = url;
    }
    const want =
      activeBroll.srcInSample / sr + (curSample - activeBroll.startSample) / sr;
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
  }, [activeBroll, curSample, playing, sr]);

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
      captions: { enabled: p.captions?.enabled ?? true, maxWords: n },
    }));
    enqueueSave(() =>
      runGuiAction(project.slug, "captions-max", { maxWords: n })
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

  const togglePreviewMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }
    v.muted = !v.muted;
    setPreviewMuted(v.muted);
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
    const maxHeight = options?.maxHeight ?? (export1080 ? 1080 : undefined);
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
          const r = await exportProject(project.slug, maxHeight);
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
                              className="block h-full w-full bg-black object-cover"
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
                                "absolute inset-0 z-[1] h-full w-full bg-black object-cover",
                                activeBroll ? "block" : "hidden"
                              )}
                              muted
                              playsInline
                              ref={brollRef}
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
                          curSample={curSample}
                          inBroll={inBroll}
                          inZoom={inZoom}
                          onCutSelection={cutSelection}
                          onRestoreSelection={restoreSelection}
                          onSelectRange={selectTranscriptRange}
                          onTextEdit={reconcileTranscriptEdit}
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

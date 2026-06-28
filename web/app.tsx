"use client";

import {
  createShader,
  playSweep,
  type ShaderController,
  type SweepHandle,
  type SweepOptions,
} from "glimm";
import {
  Captions,
  Check,
  Clock3,
  Download,
  Film,
  Moon,
  Palette,
  PanelLeft,
  PanelRight,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  Type,
  ZoomIn,
} from "lucide-react";
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
import { AgentModelSelect } from "@/components/agent-model-select";
import { AgentSidebar } from "@/components/agent-sidebar";
import { withAssetKind } from "@/components/asset-bin";
import { CinemaPlayer } from "@/components/cinema-player";
import { EditTimeline } from "@/components/edit-timeline";
import { EditorSidebarShortcuts } from "@/components/editor-sidebar-shortcuts";
import { HeroTitleOverlay } from "@/components/hero-title-overlay";
import { KeyboardHint } from "@/components/keyboard-hint";
import { OverlaySortable } from "@/components/overlay-sortable";
import { PLAYER_SPEEDS, PlayerControls } from "@/components/player-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  type SidebarContextProps,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useModShortcut } from "@/hooks/use-mod-shortcut";
import { AgentProviderIcon } from "@/lib/agent-icons";
import {
  type AgentModelId,
  DEFAULT_AGENT_MODEL,
  getAgentModelLabel,
  getDefaultAgentModel,
  setDefaultAgentModel,
  subscribeDefaultAgent,
} from "@/lib/agent-preferences";
import {
  clampLoopRegion,
  ORIENTATION_LABEL,
  ORIENTATION_RATIO,
  type Orientation,
} from "@/lib/preview-layout";
import { buildProjectHoverContext } from "@/lib/project-context";
import type { ProjectListing } from "@/lib/project-list";
import { getThemeLabel, THEME_CATALOG } from "@/lib/theme-catalog";
import {
  type AppThemeId,
  applyAppTheme,
  applyColorScheme,
  type ColorScheme,
  getAppTheme,
  getColorScheme,
  setAppTheme,
  setColorScheme,
  subscribeAppTheme,
  subscribeColorScheme,
} from "@/lib/theme-preferences";
import { cn } from "@/lib/utils";
import type { ActionResult } from "../app/actions.ts";
import {
  exportProject,
  saveBroll,
  saveLook,
  saveProjectEdits,
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
interface Project {
  assets: Asset[];
  broll: BrollItem[];
  captions?: { enabled: boolean; maxWords?: number };
  dirPath: string;
  durationSamples: number;
  look?: { vignette: boolean };
  mediaVersion?: number;
  padMs: number;
  sampleRate: number;
  slug: string;
  source: string;
  stills?: Array<{
    assetId: string;
    endSample: number;
    focusX: number;
    focusY: number;
    id: string;
    scale: number;
    startSample: number;
  }>;
  titles: TitleItem[];
  words: Word[];
  zooms: ZoomItem[];
}

type Selected = { kind: "zoom" | "broll" | "title"; id: string } | null;

const ZOOM_PRESETS: Record<string, { scale: number; rampSec: number }> = {
  Subtle: { scale: 1.15, rampSec: 0.6 },
  Punch: { scale: 1.4, rampSec: 0.35 },
  Hold: { scale: 1.25, rampSec: 1.2 },
};

// Thin Paper-style slider: short track, small thumb, soft gray fill.
const SLIDER =
  "[&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-range]]:bg-foreground/35";

const CUT_SWEEP_OPTIONS = {
  bandTight: 18,
  brightness: 0.9,
  direction: "ltr",
  easing: "easeOutCubic",
  midpoint: 0.42,
  outroMs: 170,
  palette: "azure",
  peakAlpha: 0.92,
  rippleAmount: 0.65,
  swellAmount: 0.55,
  sweepMs: 260,
  waveAmount: 0.7,
  waveSpeed: 1.2,
} satisfies SweepOptions;

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
  const padded: Range[] = raw.map((r) => ({
    startSec: Math.max(0, r.start - pad),
    endSec: Math.min(dur || r.end + pad, r.end + pad),
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

export function App({
  initialProject,
  projects,
}: {
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
  const [export1080, setExport1080] = useState(true);
  const [defaultAgent, setDefaultAgent] =
    useState<AgentModelId>(DEFAULT_AGENT_MODEL);
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
  const [titleText, setTitleText] = useState("");
  const [titlePos, setTitlePos] = useState<"lower" | "center" | "hero">(
    "lower"
  );
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
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
  const [appTheme, setAppThemeState] = useState<AppThemeId>(() =>
    getAppTheme()
  );
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() =>
    getColorScheme()
  );
  const projectLoaded = true;
  useEffect(() => {
    applyColorScheme(getColorScheme());
    const unsubTheme = subscribeAppTheme((theme) => {
      setAppThemeState(theme);
      applyAppTheme(theme, getColorScheme());
    });
    const unsubScheme = subscribeColorScheme((scheme) => {
      setColorSchemeState(scheme);
      applyAppTheme(getAppTheme(), scheme);
    });
    return () => {
      unsubTheme();
      unsubScheme();
    };
  }, []);
  const toggleColorScheme = useCallback(() => {
    setColorScheme(colorScheme === "dark" ? "light" : "dark");
  }, [colorScheme]);
  useEffect(() => {
    setDefaultAgent(getDefaultAgentModel());
    return subscribeDefaultAgent(setDefaultAgent);
  }, []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const brollRef = useRef<HTMLVideoElement>(null);
  const transitionCanvasRef = useRef<HTMLCanvasElement>(null);
  const transitionShaderRef = useRef<ShaderController | null>(null);
  const transitionSweepRef = useRef<SweepHandle | null>(null);
  const schedRef = useRef<CutScheduler | null>(null);
  const projectRef = useRef<Project | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveErrorRef = useRef<string | null>(null);
  projectRef.current = project;

  useEffect(() => {
    if (!projectLoaded) {
      return;
    }
    const canvas = transitionCanvasRef.current;
    if (!canvas) {
      return;
    }
    const shader = createShader({
      canvas,
      bandTight: CUT_SWEEP_OPTIONS.bandTight,
      direction: CUT_SWEEP_OPTIONS.direction,
    });
    transitionShaderRef.current = shader;
    return () => {
      transitionSweepRef.current?.cancel();
      shader?.destroy();
      transitionShaderRef.current = null;
      transitionSweepRef.current = null;
    };
  }, [projectLoaded]);

  const playCutSweep = useCallback(
    ({ jump, resume }: { jump: () => void; resume: () => void }) => {
      const shader = transitionShaderRef.current;
      const reduceMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false;
      if (reduceMotion || !shader) {
        jump();
        resume();
        return;
      }
      transitionSweepRef.current?.cancel();
      const handle = playSweep(shader, {
        ...CUT_SWEEP_OPTIONS,
        onMidpoint: jump,
      });
      transitionSweepRef.current = handle;
      void handle.done.finally(() => {
        if (transitionSweepRef.current === handle) {
          transitionSweepRef.current = null;
        }
        resume();
      });
    },
    []
  );

  useEffect(() => {
    if (!(videoRef.current && project) || schedRef.current) {
      return;
    }
    const sched = new CutScheduler(videoRef.current, () =>
      survivingRanges(projectRef.current as Project)
    );
    sched.onCutBoundary = playCutSweep;
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
  }, [playCutSweep, project]);

  const ranges = useMemo(
    () => (project ? survivingRanges(project) : []),
    [project]
  );
  const projectHover = useMemo(
    () => buildProjectHoverContext(project, project.dirPath),
    [project]
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
  const activeGroup = captionsOn
    ? captionGroups.find(
        (g) => curSec >= g.startSec - 0.05 && curSec <= g.endSec + 0.25
      )
    : undefined;

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
  const activeTitle = project?.titles?.find(
    (t) => curSample >= t.startSample && curSample < t.endSample
  );
  const heroTitle = activeTitle?.position === "hero" ? activeTitle : null;
  const standardTitle =
    activeTitle && activeTitle.position !== "hero" ? activeTitle : null;
  const captionsRaised = standardTitle?.position === "lower";
  const assetName = (id: string) =>
    project?.assets.find((a) => a.id === id)?.name ?? id;
  const brollAssets = useMemo(
    () => project?.assets.filter((a) => (a.kind ?? "broll") === "broll") ?? [],
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

  const onWordClick = (i: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      setSelected(null);
      setSelAnchor((prev) => (prev == null ? i : prev));
      setSelFocus(i);
    } else {
      toggleWord(project.words[i].id);
    }
  };

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
    } else {
      const titles = (project.titles ?? []).filter((t) => t.id !== selected.id);
      setProject({ ...project, titles });
      enqueueSave(() => saveTitles(project.slug, titles));
    }
    setSelected(null);
  };

  const toggleCaptions = (next: boolean) => {
    setCaptionsOn(next);
    enqueueSave(() =>
      saveProjectEdits(project.slug, { captions: { enabled: next } })
    );
  };
  const toggleVignette = (next: boolean) => {
    setVignetteOn(next);
    enqueueSave(() => saveLook(project.slug, { vignette: next }));
  };
  const setMaxWords = (n: number) => {
    setProject((p) => ({
      ...p,
      captions: { enabled: p.captions?.enabled ?? true, maxWords: n },
    }));
    enqueueSave(() =>
      saveProjectEdits(project.slug, { captions: { maxWords: n } })
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
          setExportMsg("Nothing to play: all words are cut.");
        }
      } catch (e) {
        setPlaying(false);
        setExportMsg(`Playback error: ${(e as Error).message}`);
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

  const onTimelineSelect = useCallback(
    (kind: "broll" | "title" | "zoom", id: string) => {
      setSelAnchor(null);
      setSelFocus(null);
      setSelected({ kind, id });
      const item =
        kind === "broll"
          ? projectRef.current?.broll.find((b) => b.id === id)
          : kind === "zoom"
            ? projectRef.current?.zooms.find((z) => z.id === id)
            : projectRef.current?.titles.find((t) => t.id === id);
      if (item) {
        schedRef.current?.seek(
          item.startSample / (projectRef.current?.sampleRate ?? 48_000)
        );
        setCurSample(item.startSample);
      }
    },
    []
  );

  const onExport = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      await saveChainRef.current;
      if (saveErrorRef.current) {
        throw new Error(`Save failed: ${saveErrorRef.current}`);
      }
      const r = await exportProject(
        project.slug,
        export1080 ? 1080 : undefined
      );
      setExportMsg(
        r.ok
          ? `Exported ${r.data.ranges} cuts @ ${r.data.height}p (${r.data.durationSec.toFixed(1)}s) to ${r.data.out}`
          : `Error: ${r.error}`
      );
    } catch (e) {
      setExportMsg(`Error: ${(e as Error).message}`);
    }
    setExporting(false);
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
        : selRange
          ? Sparkles
          : Captions;
  const inspectorLabel = selZoom
    ? "Push-in"
    : selTitle
      ? "Title card"
      : selBroll
        ? "B-roll"
        : selRange
          ? "Selection"
          : "Captions";
  const inspectorBadge = selZoom
    ? fmt(selZoom.startSample / sr)
    : selTitle
      ? fmt(selTitle.startSample / sr)
      : selBroll
        ? fmt(selBroll.startSample / sr)
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
              { icon: Clock3, label: "Pad", value: `${project.padMs ?? 50}ms` },
            ];

  const timelineWords = useMemo(
    () =>
      project.words.map((w, index) => ({
        id: w.id,
        index,
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
        startSec: t.startSample / sr,
        endSec: t.endSample / sr,
        label: t.text.replace(/\n/g, " · "),
      })),
    [project.titles, sr]
  );
  const timelineMusic = useMemo(
    () =>
      project.assets
        .filter((a) => a.kind === "music")
        .map((a) => ({
          id: a.id,
          startSec: 0,
          endSec: a.durationSamples / sr,
          label: a.name,
        })),
    [project.assets, sr]
  );
  const timelineStills = useMemo(
    () =>
      project.assets
        .filter((a) => a.kind === "still")
        .map((a) => ({
          id: a.id,
          startSec: 0,
          endSec: a.durationSamples / sr,
          label: a.name,
        })),
    [project.assets, sr]
  );

  return (
    <SidebarProvider
      className="min-h-screen flex-col overflow-auto bg-background text-foreground md:h-screen md:min-h-0 md:flex-row md:overflow-hidden"
      cookieName="openklip_sidebar_agent"
      keyboardShortcut={false}
      style={
        {
          "--sidebar-width": "18rem",
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
          projectName={project.slug}
          src={`/media/proxy.mp4?v=${project.mediaVersion ?? 0}`}
        />
      )}
      <AgentSidebar
        activeSlug={project.slug}
        assets={project.assets.map(withAssetKind)}
        mediaVersion={project.mediaVersion}
        onAssetsUpdated={(update) => {
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
        }}
        projectHover={projectHover}
        projects={projects}
        sampleRate={project.sampleRate}
      />

      <SidebarContextBridge>
        {(agentSidebar) => (
          <SidebarProvider
            className="min-h-screen flex-1 flex-col overflow-auto bg-background text-foreground md:h-screen md:min-h-0 md:flex-row md:overflow-hidden"
            cookieName="openklip_sidebar_inspector"
            keyboardShortcut={false}
            style={
              {
                "--sidebar-width": "17rem",
                "--sidebar-width-icon": "3.25rem",
              } as CSSProperties
            }
          >
            <EditorSidebarShortcuts agentSidebar={agentSidebar} />
            {/* CENTER : preview + transcript */}
            <SidebarInset className="flex min-h-[28rem] min-w-0 flex-col md:min-h-0">
              <div className="flex h-12 shrink-0 items-center gap-2 border-border border-b px-3">
                <AgentSidebarToolbarTrigger
                  onToggle={agentSidebar.toggleSidebar}
                />
                <div className="h-4 w-px bg-foreground/10" />
                <div className="min-w-0">
                  <div className="font-medium text-ui">Editor</div>
                  <div className="truncate text-caption text-muted-foreground">
                    {ranges.length} cuts · {fmt(keptDuration)} / {fmt(fullDur)}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    disabled={exportDisabled}
                    onClick={onExport}
                    size="sm"
                    variant="secondary"
                  >
                    <Download />
                    {exportLabel}
                  </Button>
                  <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
                    {(["landscape", "portrait", "square"] as Orientation[]).map(
                      (o) => (
                        <Button
                          aria-label={`Preview ${ORIENTATION_LABEL[o]}`}
                          aria-pressed={orientation === o}
                          key={o}
                          onClick={() => setOrientation(o)}
                          size="sm"
                          variant={orientation === o ? "secondary" : "ghost"}
                        >
                          {ORIENTATION_LABEL[o]}
                        </Button>
                      )
                    )}
                  </div>
                  <Button
                    aria-label="Toggle color scheme"
                    onClick={toggleColorScheme}
                    size="icon-sm"
                    variant="ghost"
                  >
                    {colorScheme === "dark" ? <Sun /> : <Moon />}
                  </Button>
                  <RightSidebarTrigger />
                </div>
              </div>
              <div className="flex flex-col gap-3 p-4">
                <div className="flex w-full justify-center">
                  <div
                    className="group/preview relative cursor-pointer overflow-hidden rounded-lg border border-border bg-black"
                    onClick={onPreviewClick}
                    style={
                      orientation === "landscape"
                        ? {
                            width: "100%",
                            aspectRatio: String(ORIENTATION_RATIO.landscape),
                          }
                        : {
                            height: "min(58vh, 70vw)",
                            aspectRatio: String(ORIENTATION_RATIO[orientation]),
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
                    <HeroTitleOverlay title={heroTitle} />
                    {standardTitle && (
                      <div
                        className={cn(
                          "pointer-events-none absolute inset-x-0 z-[3] flex justify-center",
                          standardTitle.position === "center"
                            ? "top-1/2 -translate-y-1/2"
                            : "bottom-[16%]"
                        )}
                        key={standardTitle.id}
                      >
                        <span
                          className={cn(
                            "max-w-[80%] rounded-md bg-black/60 px-4 py-2 text-center font-medium text-white backdrop-blur",
                            standardTitle.position === "center"
                              ? "text-[clamp(22px,4vw,52px)]"
                              : "text-[clamp(16px,2.6vw,32px)]"
                          )}
                        >
                          {standardTitle.text}
                        </span>
                      </div>
                    )}
                    {activeGroup && !heroTitle && (
                      <div
                        className={cn(
                          "pointer-events-none absolute inset-x-0 z-[3] flex justify-center",
                          captionsRaised ? "bottom-[28%]" : "bottom-[9%]"
                        )}
                      >
                        <div className="max-w-[82%] rounded-md bg-black/55 px-3.5 py-1.5 text-center font-medium text-[clamp(15px,2.3vw,30px)] text-white leading-tight backdrop-blur">
                          {activeGroup.words.map((w, i) => {
                            const next =
                              activeGroup.words[i + 1]?.startSec ??
                              activeGroup.endSec;
                            const on =
                              curSec >= w.startSec - 0.02 && curSec < next;
                            return (
                              <span
                                className={cn(
                                  on ? "text-live" : "text-zinc-100"
                                )}
                                key={`${w.text}-${i}`}
                              >
                                {w.text}{" "}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <canvas
                      className="pointer-events-none absolute inset-0 z-[4] h-full w-full"
                      ref={transitionCanvasRef}
                    />
                    {(exporting || pendingSaves > 0) && (
                      <div className="pointer-events-none absolute top-2 right-2 z-[5] flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 font-medium text-caption text-white backdrop-blur">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                        {exporting
                          ? (exportMsg ?? "Exporting…")
                          : "Rebuilding…"}
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
                        onSeek(sourceAtOutput(ranges, frac * keptDuration))
                      }
                      onToggleCaptions={() => toggleCaptions(!captionsOn)}
                      onToggleMute={togglePreviewMute}
                      onTogglePip={togglePreviewPip}
                      pipOn={previewPip}
                      playing={playing}
                      rate={previewRate}
                    />
                  </div>
                </div>

                {/* OpenKlip-specific controls (no Linear analogue) */}
                <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-3">
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
                        className="text-caption text-muted-foreground"
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
                  <Toggle
                    aria-label="Vignette"
                    className="ml-auto"
                    onPressedChange={toggleVignette}
                    pressed={vignetteOn}
                    size="sm"
                    variant="outline"
                  >
                    Vignette
                  </Toggle>
                </div>
              </div>

              <div className="min-h-0 flex-1 border-foreground/10 border-t">
                <ScrollArea className="h-full">
                  <div className="px-6 pt-4 pb-12">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="font-medium text-muted-foreground text-xs">
                        Transcript
                      </span>
                      <span className="ml-auto text-caption text-muted-foreground/70">
                        Click to cut · shift-click to select
                      </span>
                    </div>
                    <p className="max-w-[60ch] text-base leading-[1.95]">
                      {project.words.map((w, i) => {
                        const active =
                          curSample >= w.startSample &&
                          curSample < w.endSample &&
                          !w.deleted;
                        const isSel =
                          selRange != null &&
                          i >= selRange[0] &&
                          i <= selRange[1];
                        return (
                          <span
                            className={cn(
                              "cursor-pointer rounded px-0.5 py-px transition-colors fine-hover:hover:bg-muted active:bg-muted/80",
                              w.deleted &&
                                "text-muted-foreground/60 line-through decoration-1",
                              active && "bg-live/15 text-live",
                              inBroll(w) &&
                                "underline decoration-2 decoration-broll/70 underline-offset-4",
                              inZoom(w) && "bg-zoom/10",
                              isSel &&
                                "bg-live/10 ring-1 ring-live/40 ring-inset"
                            )}
                            key={w.id}
                            onClick={(e) => onWordClick(i, e)}
                          >
                            {w.text}{" "}
                          </span>
                        );
                      })}
                    </p>
                    {exportMsg && (
                      <p className="mt-6 max-w-[60ch] break-words border-foreground/10 border-t pt-3 text-muted-foreground text-xs">
                        {exportMsg}
                      </p>
                    )}
                    {saveError && (
                      <p className="mt-2 max-w-[60ch] break-words text-destructive text-xs">
                        Save failed: {saveError}
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
              <EditTimeline
                broll={timelineBroll}
                curSec={curSec}
                durationSec={fullDur}
                libraryMusic={timelineMusic}
                libraryStills={timelineStills}
                onSeek={onSeek}
                onSelect={onTimelineSelect}
                ranges={ranges}
                selected={selected}
                selRange={selRange}
                titles={timelineTitles}
                wordSpans={timelineWords}
                zooms={timelineZooms}
              />
            </SidebarInset>

            {/* RIGHT : actions + inspector (Paper "properties" panel) */}
            <Sidebar className="bg-background" collapsible="icon" side="right">
              <SidebarHeader className="border-border border-b">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Settings">
                      <Settings2 />
                      <span>Settings</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>
                      {getThemeLabel(appTheme)} ·{" "}
                      {export1080 ? "1080p" : "Auto"}
                    </SidebarMenuBadge>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild>
                          <label className="cursor-pointer">
                            <Switch
                              checked={export1080}
                              onCheckedChange={setExport1080}
                            />
                            <span>Limit to 1080p</span>
                          </label>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <span className="px-2 py-1 font-medium text-muted-foreground text-section-label">
                          Theme
                        </span>
                      </SidebarMenuSubItem>
                      {THEME_CATALOG.map((themeOption) => (
                        <SidebarMenuSubItem key={themeOption.id}>
                          <SidebarMenuSubButton
                            className="gap-2"
                            isActive={appTheme === themeOption.id}
                            onClick={() => setAppTheme(themeOption.id)}
                          >
                            {appTheme === themeOption.id ? (
                              <Check className="size-3.5 shrink-0" />
                            ) : (
                              <Palette className="size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="min-w-0 flex-1 truncate">
                              {themeOption.name}
                            </span>
                            {themeOption.supportedModes.length === 1 &&
                            themeOption.supportedModes[0] === "dark" ? (
                              <span className="shrink-0 text-caption text-muted-foreground">
                                dark
                              </span>
                            ) : null}
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Default agent">
                      <AgentProviderIcon
                        className="size-4 shrink-0"
                        value={defaultAgent}
                      />
                      <span>Default agent</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>
                      {getAgentModelLabel(defaultAgent)}
                    </SidebarMenuBadge>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem className="px-2 pb-2">
                        <AgentModelSelect
                          onValueChange={setDefaultAgentModel}
                          value={defaultAgent}
                        />
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarHeader>

              <SidebarContent>
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
                {selected && (selZoom || selTitle || selBroll) ? (
                  <div className="group-data-[collapsible=icon]:hidden">
                    <div className="px-3 py-3">
                      <div className="flex items-center gap-2 font-medium text-ui">
                        {selZoom ? (
                          <ZoomIn className="size-3.5 text-muted-foreground" />
                        ) : selTitle ? (
                          <Type className="size-3.5 text-muted-foreground" />
                        ) : (
                          <Film className="size-3.5 text-muted-foreground" />
                        )}
                        {selZoom
                          ? "Push-in"
                          : selTitle
                            ? "Title card"
                            : "B-roll"}
                        <span className="ml-auto text-caption text-muted-foreground tabular-nums">
                          {selZoom &&
                            `${fmt(selZoom.startSample / sr)}–${fmt(selZoom.endSample / sr)}`}
                          {selTitle &&
                            `${fmt(selTitle.startSample / sr)}–${fmt(selTitle.endSample / sr)}`}
                          {selBroll &&
                            `${fmt(selBroll.startSample / sr)}–${fmt(selBroll.endSample / sr)}`}
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
                              onValueChange={([v]) =>
                                updateZoom(selZoom.id, { scale: v })
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
                              onValueChange={([v]) =>
                                updateZoom(selZoom.id, { rampSec: v })
                              }
                              step={0.1}
                              value={[selZoom.rampSec]}
                            />
                          </PropRow>
                        </Section>
                        <Section title="Preset">
                          <ToggleGroup
                            className="w-full"
                            onValueChange={(v) =>
                              v && updateZoom(selZoom.id, ZOOM_PRESETS[v])
                            }
                            spacing={0}
                            type="single"
                            value={presetOf(selZoom)}
                            variant="outline"
                          >
                            {Object.keys(ZOOM_PRESETS).map((k) => (
                              <ToggleGroupItem
                                className="h-7 flex-1 text-xs"
                                key={k}
                                value={k}
                              >
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
                          <textarea
                            className="field-sizing-content min-h-16 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            onChange={(e) =>
                              updateTitle(selTitle.id, { text: e.target.value })
                            }
                            placeholder={
                              "Headline\nSubtitle (optional second line)"
                            }
                            rows={3}
                            value={selTitle.text}
                          />
                        ) : (
                          <Input
                            onChange={(e) =>
                              updateTitle(selTitle.id, { text: e.target.value })
                            }
                            placeholder="Title text"
                            value={selTitle.text}
                          />
                        )}
                        <div className="mt-2">
                          <Select
                            onValueChange={(v) =>
                              updateTitle(selTitle.id, {
                                position: v as "lower" | "center" | "hero",
                              })
                            }
                            value={selTitle.position}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lower">Lower third</SelectItem>
                              <SelectItem value="center">Centered</SelectItem>
                              <SelectItem value="hero">Hero card</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </Section>
                    )}

                    {selBroll && brollAssets.length > 0 && (
                      <Section title="Source">
                        <Select
                          onValueChange={(v) =>
                            updateBroll(selBroll.id, { assetId: v })
                          }
                          value={selBroll.assetId}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {brollAssets.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {(project.broll ?? []).length > 1 && (
                          <div className="mt-3">
                            <span className="text-caption text-muted-foreground">
                              Paint order : drag to restack
                            </span>
                            <div className="mt-1.5">
                              <OverlaySortable
                                onReorder={reorderBrollOrder}
                                onSelect={(id) =>
                                  setSelected({ kind: "broll", id })
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

                    <div className="p-3">
                      <Button
                        className="w-full"
                        onClick={removeSelected}
                        size="sm"
                        variant="destructive"
                      >
                        <Trash2 /> Remove effect
                      </Button>
                    </div>
                  </div>
                ) : selRange ? (
                  <div className="group-data-[collapsible=icon]:hidden">
                    <div className="px-3 py-3 font-medium text-ui">
                      Selection
                      <span className="ml-2 text-caption text-muted-foreground">
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
                        <ZoomIn /> Push in
                      </Button>
                      <div className="mt-2 flex gap-2">
                        <Select
                          onValueChange={setChosenAsset}
                          value={chosenAsset}
                        >
                          <SelectTrigger
                            className="flex-1"
                            disabled={brollAssets.length === 0}
                          >
                            <SelectValue placeholder="No b-roll" />
                          </SelectTrigger>
                          <SelectContent>
                            {brollAssets.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          aria-label="Add b-roll"
                          disabled={brollAssets.length === 0}
                          onClick={addBroll}
                          size="sm"
                          variant="secondary"
                        >
                          <Film />
                        </Button>
                      </div>
                    </Section>
                    <Section title="Title">
                      {titlePos === "hero" ? (
                        <textarea
                          className="field-sizing-content min-h-16 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          onChange={(e) => setTitleText(e.target.value)}
                          placeholder={
                            "Headline\nSubtitle (optional second line)"
                          }
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
                          onValueChange={(v) =>
                            setTitlePos(v as "lower" | "center" | "hero")
                          }
                          value={titlePos}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lower">Lower third</SelectItem>
                            <SelectItem value="center">Centered</SelectItem>
                            <SelectItem value="hero">Hero card</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          aria-label="Add title"
                          disabled={!titleText.trim()}
                          onClick={addTitle}
                          size="sm"
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
                    <Section title="Captions">
                      <PropRow
                        label="Per line"
                        value={String(project.captions?.maxWords ?? 6)}
                      >
                        <Slider
                          className={SLIDER}
                          max={12}
                          min={1}
                          onValueChange={([v]) => setMaxWords(v)}
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
                          onValueChange={([v]) => setPad(v)}
                          step={5}
                          value={[project.padMs ?? 50]}
                        />
                      </PropRow>
                    </Section>
                    <p className="px-3 py-3 text-muted-foreground text-xs leading-relaxed">
                      Select a word range in the transcript to add a push-in,
                      b-roll, or title. Click an effect to edit it here.
                    </p>
                  </div>
                )}
              </SidebarContent>
              <SidebarRail />
            </Sidebar>
          </SidebarProvider>
        )}
      </SidebarContextBridge>
    </SidebarProvider>
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
      <SidebarMenuSubButton asChild>
        <span>
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <span className="ml-auto shrink-0 text-caption text-muted-foreground/70 tabular-nums">
            {value}
          </span>
        </span>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

function SidebarContextBridge({
  children,
}: {
  children: (context: SidebarContextProps) => ReactNode;
}) {
  return children(useSidebar());
}

function AgentSidebarToolbarTrigger({ onToggle }: { onToggle: () => void }) {
  const shortcut = useModShortcut("b");
  const label = `Toggle agent sidebar (${shortcut})`;

  return (
    <Button
      aria-label={label}
      className="h-8 shrink-0 gap-1 px-2"
      onClick={onToggle}
      title={label}
      variant="ghost"
    >
      <PanelLeft className="size-4" />
      <KeyboardHint shortcutKey="b" />
    </Button>
  );
}

function RightSidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar } = useSidebar();
  const shortcut = useModShortcut("i");
  const label = `Toggle inspector (${shortcut})`;

  return (
    <Button
      aria-label={label}
      className={cn("h-8 shrink-0 gap-1 px-2", className)}
      onClick={toggleSidebar}
      title={label}
      variant="ghost"
    >
      <PanelRight className="size-4" />
      <KeyboardHint shortcutKey="i" />
    </Button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SidebarGroup className="border-foreground/10 border-t px-3 py-3">
      <SidebarGroupLabel className="mb-2.5 h-auto px-0 font-medium text-muted-foreground">
        {title}
      </SidebarGroupLabel>
      <SidebarGroupContent>{children}</SidebarGroupContent>
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
    <div className="grid h-7 grid-cols-[4.25rem_1fr_2.5rem] items-center gap-2.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
      <span className="text-right text-xs tabular-nums">{value}</span>
    </div>
  );
}

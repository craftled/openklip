"use client";

import {
  Download,
  Film,
  Moon,
  Pause,
  Play,
  Plus,
  Sun,
  Trash2,
  Type,
  ZoomIn,
} from "lucide-react";
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
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
  name: string;
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
  position: "lower" | "center";
  startSample: number;
  text: string;
}
interface Project {
  assets: Asset[];
  broll: BrollItem[];
  captions?: { enabled: boolean; maxWords?: number };
  durationSamples: number;
  look?: { vignette: boolean };
  mediaVersion?: number;
  padMs: number;
  sampleRate: number;
  slug: string;
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

const fmt = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [playing, setPlaying] = useState(false);
  const [curSample, setCurSample] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [vignetteOn, setVignetteOn] = useState(false);
  const [export1080, setExport1080] = useState(true);
  const [selAnchor, setSelAnchor] = useState<number | null>(null);
  const [selFocus, setSelFocus] = useState<number | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [chosenAsset, setChosenAsset] = useState("");
  const [titleText, setTitleText] = useState("");
  const [titlePos, setTitlePos] = useState<"lower" | "center">("lower");
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? "dark"
      : "light"
  );
  const themeMounted = useRef(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (themeMounted.current) {
      try {
        localStorage.setItem("openklip-theme", theme);
      } catch {
        // ignore unavailable storage
      }
    }
    themeMounted.current = true;
  }, [theme]);
  const toggleTheme = useCallback(
    () => setTheme((p) => (p === "dark" ? "light" : "dark")),
    []
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const brollRef = useRef<HTMLVideoElement>(null);
  const schedRef = useRef<CutScheduler | null>(null);
  const projectRef = useRef<Project | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveErrorRef = useRef<string | null>(null);
  projectRef.current = project;

  useEffect(() => {
    fetch("/api/project")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || data.ok === false) {
          throw new Error(data.error ?? "could not load project");
        }
        return data;
      })
      .then((p: Project) => {
        setProject(p);
        setCaptionsOn(p.captions?.enabled ?? true);
        setVignetteOn(p.look?.vignette ?? false);
        setChosenAsset(p.assets?.[0]?.id ?? "");
      })
      .catch((e) => setLoadError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!(videoRef.current && project) || schedRef.current) {
      return;
    }
    const sched = new CutScheduler(videoRef.current, () =>
      survivingRanges(projectRef.current as Project)
    );
    sched.onTick = (sourceSec) =>
      setCurSample(Math.round(sourceSec * project.sampleRate));
    sched.onEnd = () => setPlaying(false);
    schedRef.current = sched;
  }, [project]);

  const ranges = useMemo(
    () => (project ? survivingRanges(project) : []),
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
  const captionsRaised = activeTitle?.position === "lower";
  const assetName = (id: string) =>
    project?.assets.find((a) => a.id === id)?.name ?? id;

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

  const post = useCallback((path: string, body: unknown) => {
    const task = saveChainRef.current
      .catch(() => {
        // Keep later saves moving after one failed request.
      })
      .then(async () => {
        setPendingSaves((n) => n + 1);
        setSaveError(null);
        saveErrorRef.current = null;
        try {
          const res = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || data?.ok === false) {
            throw new Error(data?.error ?? `save failed (${res.status})`);
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
    saveChainRef.current = task.catch(() => {
      // The visible error state above is the user-facing failure path.
    });
  }, []);

  const toggleWord = useCallback((id: string) => {
    setProject((prev) => {
      if (!prev) {
        return prev;
      }
      const words = prev.words.map((w) =>
        w.id === id ? { ...w, deleted: !w.deleted } : w
      );
      post("/api/project", {
        words: words.map((w) => ({ id: w.id, deleted: w.deleted })),
      });
      return { ...prev, words };
    });
  }, []);

  const onWordClick = (i: number, e: React.MouseEvent) => {
    if (!project) {
      return;
    }
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
    if (!(project && selRange)) {
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
    post("/api/zooms", { zooms });
    clearSel();
    setSelected({ kind: "zoom", id });
  };
  const addBroll = () => {
    if (!(project && selRange && chosenAsset)) {
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
    post("/api/broll", { broll });
    clearSel();
    setSelected({ kind: "broll", id });
  };
  const addTitle = () => {
    if (!(project && selRange && titleText.trim())) {
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
    post("/api/titles", { titles });
    setTitleText("");
    clearSel();
    setSelected({ kind: "title", id });
  };

  const updateZoom = (id: string, patch: Partial<ZoomItem>) => {
    if (!project) {
      return;
    }
    const zooms = (project.zooms ?? []).map((z) =>
      z.id === id ? { ...z, ...patch } : z
    );
    setProject({ ...project, zooms });
    post("/api/zooms", { zooms });
  };
  const updateTitle = (id: string, patch: Partial<TitleItem>) => {
    if (!project) {
      return;
    }
    const titles = (project.titles ?? []).map((t) =>
      t.id === id ? { ...t, ...patch } : t
    );
    setProject({ ...project, titles });
    post("/api/titles", { titles });
  };
  const updateBroll = (id: string, patch: Partial<BrollItem>) => {
    if (!project) {
      return;
    }
    const broll = (project.broll ?? []).map((b) =>
      b.id === id ? { ...b, ...patch } : b
    );
    setProject({ ...project, broll });
    post("/api/broll", { broll });
  };
  const removeSelected = () => {
    if (!(project && selected)) {
      return;
    }
    if (selected.kind === "zoom") {
      const zooms = (project.zooms ?? []).filter((z) => z.id !== selected.id);
      setProject({ ...project, zooms });
      post("/api/zooms", { zooms });
    } else if (selected.kind === "broll") {
      const broll = (project.broll ?? []).filter((b) => b.id !== selected.id);
      setProject({ ...project, broll });
      post("/api/broll", { broll });
    } else {
      const titles = (project.titles ?? []).filter((t) => t.id !== selected.id);
      setProject({ ...project, titles });
      post("/api/titles", { titles });
    }
    setSelected(null);
  };

  const toggleCaptions = (next: boolean) => {
    setCaptionsOn(next);
    post("/api/project", { captions: { enabled: next } });
  };
  const toggleVignette = (next: boolean) => {
    setVignetteOn(next);
    post("/api/look", { vignette: next });
  };
  const setMaxWords = (n: number) => {
    setProject((p) =>
      p
        ? {
            ...p,
            captions: { enabled: p.captions?.enabled ?? true, maxWords: n },
          }
        : p
    );
    post("/api/project", { captions: { maxWords: n } });
  };
  const setPad = (n: number) => {
    setProject((p) => (p ? { ...p, padMs: n } : p));
    post("/api/project", { padMs: n });
  };

  const onPlay = async () => {
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
  };

  const onExport = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      await saveChainRef.current;
      if (saveErrorRef.current) {
        throw new Error(`Save failed: ${saveErrorRef.current}`);
      }
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxHeight: export1080 ? 1080 : undefined }),
      });
      const r = await res.json();
      setExportMsg(
        res.ok && r.ok
          ? `Exported ${r.ranges} cuts @ ${r.height}p (${r.durationSec.toFixed(1)}s) to ${r.out}`
          : `Error: ${r.error}`
      );
    } catch (e) {
      setExportMsg(`Error: ${(e as Error).message}`);
    }
    setExporting(false);
  };

  if (!project) {
    return (
      <div className="grid h-screen place-items-center bg-background text-muted-foreground text-sm">
        {loadError
          ? `Could not load project: ${loadError}`
          : "Loading project…"}
      </div>
    );
  }

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
  const effectCount =
    (project.broll?.length ?? 0) +
    (project.zooms?.length ?? 0) +
    (project.titles?.length ?? 0);
  const exportDisabled = exporting || pendingSaves > 0 || saveError !== null;
  const exportLabel = exporting
    ? "Exporting…"
    : pendingSaves > 0
      ? "Saving…"
      : "Export";

  return (
    <div className="grid h-screen min-h-0 grid-cols-[15rem_1fr_17rem] bg-background text-foreground">
      {/* LEFT — sources + effects (Paper "layers" sidebar) */}
      <aside className="flex min-h-0 flex-col border-border border-r">
        <div className="flex h-12 shrink-0 items-center gap-2 px-3">
          <span className="size-2 rounded-full bg-live" />
          <span className="font-semibold text-[13px] tracking-tight">
            OpenKlip
          </span>
          <span className="ml-auto truncate text-muted-foreground text-xs">
            {project.slug}
          </span>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-2 pb-3">
            <SidebarHead
              action={<Plus className="size-3.5 text-muted-foreground/70" />}
              title="Sources"
            />
            {project.assets.length === 0 && <Empty>No b-roll registered</Empty>}
            {project.assets.map((a) => (
              <LayerRow
                icon={Film}
                key={a.id}
                label={a.name}
                time={fmt(a.durationSamples / sr)}
              />
            ))}

            <SidebarHead title="Effects" />
            {effectCount === 0 && (
              <Empty>Select words, then add an effect</Empty>
            )}
            {project.zooms?.map((z) => (
              <LayerRow
                active={selected?.kind === "zoom" && selected.id === z.id}
                icon={ZoomIn}
                key={z.id}
                label={`Push-in ${z.scale.toFixed(2)}×`}
                onClick={() => {
                  clearSel();
                  setSelected({ kind: "zoom", id: z.id });
                }}
                time={fmt(z.startSample / sr)}
              />
            ))}
            {project.broll?.map((b) => (
              <LayerRow
                active={selected?.kind === "broll" && selected.id === b.id}
                icon={Film}
                key={b.id}
                label={assetName(b.assetId)}
                onClick={() => {
                  clearSel();
                  setSelected({ kind: "broll", id: b.id });
                }}
                time={fmt(b.startSample / sr)}
              />
            ))}
            {project.titles?.map((t) => (
              <LayerRow
                active={selected?.kind === "title" && selected.id === t.id}
                icon={Type}
                key={t.id}
                label={t.text}
                onClick={() => {
                  clearSel();
                  setSelected({ kind: "title", id: t.id });
                }}
                time={fmt(t.startSample / sr)}
              />
            ))}
          </div>
        </ScrollArea>
        <div className="flex shrink-0 items-center gap-1.5 border-border border-t px-3 py-2 text-[11px] text-muted-foreground tabular-nums">
          {ranges.length} cuts
          <span className="text-muted-foreground/40">·</span>
          {fmt(keptDuration)} / {fmt(fullDur)}
        </div>
      </aside>

      {/* CENTER — preview + transcript */}
      <main className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-col gap-3 p-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
            {/* biome-ignore lint/a11y/useMediaCaption: editor preview; transcript is the caption source */}
            <video
              className="block h-full w-full bg-black"
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
            {activeTitle && (
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 z-[3] flex justify-center",
                  activeTitle.position === "center"
                    ? "top-1/2 -translate-y-1/2"
                    : "bottom-[16%]"
                )}
                key={activeTitle.id}
              >
                <span
                  className={cn(
                    "max-w-[80%] rounded-md bg-black/60 px-4 py-2 text-center font-semibold text-white backdrop-blur",
                    activeTitle.position === "center"
                      ? "text-[clamp(22px,4vw,52px)]"
                      : "text-[clamp(16px,2.6vw,32px)]"
                  )}
                >
                  {activeTitle.text}
                </span>
              </div>
            )}
            {activeGroup && (
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 z-[3] flex justify-center",
                  captionsRaised ? "bottom-[28%]" : "bottom-[9%]"
                )}
              >
                <div className="max-w-[82%] rounded-md bg-black/55 px-3.5 py-1.5 text-center font-semibold text-[clamp(15px,2.3vw,30px)] text-white leading-tight backdrop-blur">
                  {activeGroup.words.map((w, i) => {
                    const next =
                      activeGroup.words[i + 1]?.startSec ?? activeGroup.endSec;
                    const on = curSec >= w.startSec - 0.02 && curSec < next;
                    return (
                      <span
                        className={cn(on ? "text-live" : "text-zinc-100")}
                        key={`${w.text}-${i}`}
                      >
                        {w.text}{" "}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              aria-label={playing ? "Pause" : "Play cut"}
              onClick={onPlay}
              size="icon"
              variant="secondary"
            >
              {playing ? <Pause /> : <Play />}
            </Button>
            <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-foreground/40"
                style={{
                  width: `${keptDuration ? Math.min(100, (outPos / keptDuration) * 100) : 0}%`,
                }}
              />
            </div>
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {fmt(outPos)} / {fmt(keptDuration)}
            </span>
            <Toggle
              aria-label="Captions"
              onPressedChange={toggleCaptions}
              pressed={captionsOn}
              size="sm"
              variant="outline"
            >
              Captions
            </Toggle>
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

        <div className="min-h-0 flex-1 border-border border-t">
          <ScrollArea className="h-full">
            <div className="px-6 pt-4 pb-12">
              <div className="mb-3 flex items-center gap-2">
                <span className="font-medium text-muted-foreground text-xs">
                  Transcript
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground/70">
                  Click to cut · shift-click to select
                </span>
              </div>
              <p className="max-w-[60ch] text-[15px] leading-[1.95]">
                {project.words.map((w, i) => {
                  const active =
                    curSample >= w.startSample &&
                    curSample < w.endSample &&
                    !w.deleted;
                  const isSel =
                    selRange != null && i >= selRange[0] && i <= selRange[1];
                  return (
                    <span
                      className={cn(
                        "cursor-pointer rounded px-0.5 py-px transition-colors hover:bg-muted",
                        w.deleted &&
                          "text-muted-foreground/60 line-through decoration-1",
                        active && "bg-live/15 text-live",
                        inBroll(w) &&
                          "underline decoration-2 decoration-broll/70 underline-offset-4",
                        inZoom(w) && "bg-zoom/10",
                        isSel && "bg-live/10 ring-1 ring-live/40 ring-inset"
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
                <p className="mt-6 max-w-[60ch] break-words border-border border-t pt-3 text-muted-foreground text-xs">
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
      </main>

      {/* RIGHT — actions + inspector (Paper "properties" panel) */}
      <aside className="flex min-h-0 flex-col border-border border-l">
        <div className="flex shrink-0 flex-col gap-2 border-border border-b p-3">
          <Button
            className="w-full"
            disabled={exportDisabled}
            onClick={onExport}
          >
            <Download /> {exportLabel}
          </Button>
          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-muted-foreground text-xs">
              <Switch checked={export1080} onCheckedChange={setExport1080} />{" "}
              1080p
            </label>
            <Button
              aria-label="Toggle theme"
              onClick={toggleTheme}
              size="icon-sm"
              variant="ghost"
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {selected && (selZoom || selTitle || selBroll) ? (
            <div>
              <div className="px-3 py-3">
                <div className="flex items-center gap-2 font-medium text-[13px]">
                  {selZoom ? (
                    <ZoomIn className="size-3.5 text-muted-foreground" />
                  ) : selTitle ? (
                    <Type className="size-3.5 text-muted-foreground" />
                  ) : (
                    <Film className="size-3.5 text-muted-foreground" />
                  )}
                  {selZoom ? "Push-in" : selTitle ? "Title card" : "B-roll"}
                  <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
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
                  <Input
                    onChange={(e) =>
                      updateTitle(selTitle.id, { text: e.target.value })
                    }
                    placeholder="Title text"
                    value={selTitle.text}
                  />
                  <div className="mt-2">
                    <Select
                      onValueChange={(v) =>
                        updateTitle(selTitle.id, {
                          position: v as "lower" | "center",
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
                      </SelectContent>
                    </Select>
                  </div>
                </Section>
              )}

              {selBroll && project.assets.length > 0 && (
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
                      {project.assets.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
            <div>
              <div className="px-3 py-3 font-medium text-[13px]">
                Selection
                <span className="ml-2 font-normal text-[11px] text-muted-foreground">
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
                  <Select onValueChange={setChosenAsset} value={chosenAsset}>
                    <SelectTrigger
                      className="flex-1"
                      disabled={project.assets.length === 0}
                    >
                      <SelectValue placeholder="No b-roll" />
                    </SelectTrigger>
                    <SelectContent>
                      {project.assets.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    aria-label="Add b-roll"
                    disabled={project.assets.length === 0}
                    onClick={addBroll}
                    size="sm"
                    variant="secondary"
                  >
                    <Film />
                  </Button>
                </div>
              </Section>
              <Section title="Title">
                <Input
                  onChange={(e) => setTitleText(e.target.value)}
                  placeholder="Title text"
                  value={titleText}
                />
                <div className="mt-2 flex gap-2">
                  <Select
                    onValueChange={(v) => setTitlePos(v as "lower" | "center")}
                    value={titlePos}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lower">Lower third</SelectItem>
                      <SelectItem value="center">Centered</SelectItem>
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
            <div>
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
                Select a word range in the transcript to add a push-in, b-roll,
                or title. Click an effect to edit it here.
              </p>
            </div>
          )}
        </ScrollArea>
      </aside>
    </div>
  );
}

function SidebarHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex h-7 items-center justify-between px-2 pt-3">
      <span className="font-medium text-muted-foreground text-xs">{title}</span>
      {action}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1.5 text-muted-foreground/70 text-xs">
      {children}
    </div>
  );
}

function LayerRow({
  icon: Icon,
  label,
  time,
  active,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  time: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(
        "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left transition-colors",
        onClick && "hover:bg-muted",
        active && "bg-muted"
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span
        className={cn(
          "truncate text-[13px]",
          active ? "text-foreground" : "text-foreground/90"
        )}
      >
        {label}
      </span>
      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70 tabular-nums">
        {time}
      </span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-border border-t px-3 py-3">
      <h4 className="mb-2.5 font-medium text-muted-foreground text-xs">
        {title}
      </h4>
      {children}
    </div>
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

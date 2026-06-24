import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CaptionWord, groupCaptions } from "../src/captions.ts";
import { CutScheduler, type Range } from "./scheduler.ts";

interface Word {
  id: string;
  text: string;
  startSample: number;
  endSample: number;
  deleted: boolean;
}
interface Asset {
  id: string;
  name: string;
  durationSamples: number;
}
interface BrollItem {
  id: string;
  assetId: string;
  startSample: number;
  endSample: number;
  srcInSample: number;
}
interface Project {
  slug: string;
  sampleRate: number;
  padMs: number;
  durationSamples: number;
  captions?: { enabled: boolean; maxWords?: number };
  assets: Asset[];
  broll: BrollItem[];
  words: Word[];
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
    if (!cur) cur = { start: s, end: e };
    else cur.end = Math.max(cur.end, e);
  }
  if (cur) raw.push(cur);
  const padded: Range[] = raw.map((r) => ({
    startSec: Math.max(0, r.start - pad),
    endSec: Math.min(dur || r.end + pad, r.end + pad),
  }));
  const merged: Range[] = [];
  for (const r of padded) {
    const last = merged[merged.length - 1];
    if (last && r.startSec <= last.endSec) last.endSec = Math.max(last.endSec, r.endSec);
    else merged.push({ ...r });
  }
  return merged.filter((r) => r.endSec - r.startSec > 0.01);
}

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [playing, setPlaying] = useState(false);
  const [curSample, setCurSample] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [selAnchor, setSelAnchor] = useState<number | null>(null);
  const [selFocus, setSelFocus] = useState<number | null>(null);
  const [chosenAsset, setChosenAsset] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const brollRef = useRef<HTMLVideoElement>(null);
  const schedRef = useRef<CutScheduler | null>(null);
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;

  useEffect(() => {
    fetch("/api/project")
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        setCaptionsOn(p.captions?.enabled ?? true);
        setChosenAsset(p.assets?.[0]?.id ?? "");
      })
      .catch(() => setExportMsg("could not load project"));
  }, []);

  useEffect(() => {
    if (!videoRef.current || !project || schedRef.current) return;
    const sched = new CutScheduler(videoRef.current, () => survivingRanges(projectRef.current as Project));
    sched.onTick = (sourceSec) => setCurSample(Math.round(sourceSec * project.sampleRate));
    sched.onEnd = () => setPlaying(false);
    schedRef.current = sched;
  }, [project]);

  const ranges = useMemo(() => (project ? survivingRanges(project) : []), [project]);
  const keptDuration = ranges.reduce((a, r) => a + (r.endSec - r.startSec), 0);
  const sr = project?.sampleRate ?? 48000;
  const curSec = curSample / sr;

  const captionGroups = useMemo(() => {
    if (!project) return [];
    const kept: CaptionWord[] = project.words
      .filter((w) => !w.deleted)
      .map((w) => ({ text: w.text, startSec: w.startSample / sr, endSec: w.endSample / sr }));
    return groupCaptions(kept, project.captions?.maxWords ?? 6);
  }, [project, sr]);
  const activeGroup = captionsOn ? captionGroups.find((g) => curSec >= g.startSec - 0.05 && curSec <= g.endSec + 0.25) : undefined;

  const activeBroll = project?.broll?.find((b) => curSample >= b.startSample && curSample < b.endSample);
  const assetName = (id: string) => project?.assets.find((a) => a.id === id)?.name ?? id;

  // drive the b-roll overlay video
  useEffect(() => {
    const v = brollRef.current;
    if (!v) return;
    if (!activeBroll) {
      if (!v.paused) v.pause();
      return;
    }
    const url = `/media/asset/${activeBroll.assetId}`;
    if (!v.src.endsWith(url)) v.src = url;
    const want = activeBroll.srcInSample / sr + (curSample - activeBroll.startSample) / sr;
    if (Number.isFinite(want) && Math.abs(v.currentTime - want) > 0.25) v.currentTime = Math.max(0, want);
    if (playing && v.paused) void v.play().catch(() => {});
    if (!playing && !v.paused) v.pause();
  }, [activeBroll, curSample, playing, sr]);

  const persist = (patch: { words?: Array<{ id: string; deleted: boolean }> }) => {
    void fetch("/api/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  };
  const persistBroll = (broll: BrollItem[]) => {
    void fetch("/api/broll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ broll }) });
  };

  const toggleWord = useCallback((id: string) => {
    setProject((prev) => {
      if (!prev) return prev;
      const words = prev.words.map((w) => (w.id === id ? { ...w, deleted: !w.deleted } : w));
      persist({ words: words.map((w) => ({ id: w.id, deleted: w.deleted })) });
      return { ...prev, words };
    });
  }, []);

  const onWordClick = (i: number, e: React.MouseEvent) => {
    if (!project) return;
    if (e.shiftKey) {
      setSelAnchor((prev) => (prev == null ? i : prev));
      setSelFocus(i);
    } else {
      toggleWord(project.words[i].id);
    }
  };

  const selRange = selAnchor != null && selFocus != null ? ([Math.min(selAnchor, selFocus), Math.max(selAnchor, selFocus)] as const) : null;

  const addBroll = () => {
    if (!project || !selRange || !chosenAsset) return;
    const [a, b] = selRange;
    const item: BrollItem = {
      id: `br${Date.now()}`,
      assetId: chosenAsset,
      startSample: project.words[a].startSample,
      endSample: project.words[b].endSample,
      srcInSample: 0,
    };
    const broll = [...(project.broll ?? []), item];
    setProject({ ...project, broll });
    persistBroll(broll);
    setSelAnchor(null);
    setSelFocus(null);
  };

  const removeBroll = (id: string) => {
    if (!project) return;
    const broll = (project.broll ?? []).filter((b) => b.id !== id);
    setProject({ ...project, broll });
    persistBroll(broll);
  };

  const toggleCaptions = () => {
    setCaptionsOn((prev) => {
      const next = !prev;
      void fetch("/api/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ captions: { enabled: next } }) });
      return next;
    });
  };

  const onPlay = () => {
    const s = schedRef.current;
    if (!s) return;
    if (playing) {
      s.pause();
      setPlaying(false);
    } else {
      void s.play();
      setPlaying(true);
    }
  };

  const onExport = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      const r = await fetch("/api/export", { method: "POST" }).then((x) => x.json());
      setExportMsg(
        r.ok
          ? `exported ${r.ranges} cuts${r.broll ? ` + ${r.broll} b-roll` : ""}${r.captions ? " + captions" : ""} (${r.durationSec.toFixed(1)}s)  ->  ${r.out}`
          : `error: ${r.error}`,
      );
    } catch (e) {
      setExportMsg(`error: ${(e as Error).message}`);
    }
    setExporting(false);
  };

  if (!project) return <div className="loading">loading project...</div>;

  const fullDur = project.durationSamples / project.sampleRate;
  const isCovered = (w: Word) => (project.broll ?? []).some((b) => w.startSample < b.endSample && w.endSample > b.startSample);

  return (
    <div className="app">
      <header className="bar">
        <div className="brand">
          <span className="dot" /> openklip <span className="sep">/</span> <span className="muted">{project.slug}</span>
        </div>
        <div className="stats muted">
          {ranges.length} cuts · {(project.broll ?? []).length} b-roll · {fmt(keptDuration)} / {fmt(fullDur)}
        </div>
        <button type="button" className="export" onClick={onExport} disabled={exporting}>
          {exporting ? "exporting..." : "Export"}
        </button>
      </header>

      <div className="body">
        <section className="stage">
          <div className="videoWrap">
            {/* biome-ignore lint/a11y/useMediaCaption: editor preview; transcript is the caption source */}
            <video ref={videoRef} src="/media/proxy.mp4" playsInline />
            {/* biome-ignore lint/a11y/useMediaCaption: b-roll overlay, muted */}
            <video ref={brollRef} className={`brollVideo${activeBroll ? " on" : ""}`} muted playsInline />
            {activeGroup && (
              <div className="captions">
                <div className="capbox">
                  {activeGroup.words.map((w, i) => {
                    const next = activeGroup.words[i + 1]?.startSec ?? activeGroup.endSec;
                    const on = curSec >= w.startSec - 0.02 && curSec < next;
                    return (
                      <span key={`${w.text}-${i}`} className={`capw${on ? " on" : ""}`}>
                        {w.text}{" "}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="controls">
            <button type="button" onClick={onPlay}>
              {playing ? "Pause" : "Play cut"}
            </button>
            <label className="cap-toggle">
              <input type="checkbox" checked={captionsOn} onChange={toggleCaptions} /> Captions
            </label>
          </div>

          {selRange ? (
            <div className="brollbar">
              <span className="muted small">cover {selRange[1] - selRange[0] + 1} words with</span>
              {project.assets.length > 0 ? (
                <>
                  <select value={chosenAsset} onChange={(e) => setChosenAsset(e.target.value)}>
                    {project.assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={addBroll}>
                    Add b-roll
                  </button>
                </>
              ) : (
                <span className="muted small">no b-roll registered — run: bun run broll {project.slug} &lt;file&gt;</span>
              )}
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setSelAnchor(null);
                  setSelFocus(null);
                }}
              >
                clear
              </button>
            </div>
          ) : (
            <div className="hint muted small">click a word to cut · shift-click two words to select a range for b-roll</div>
          )}

          {(project.broll ?? []).length > 0 && (
            <div className="brolllist">
              {(project.broll ?? []).map((b) => (
                <div key={b.id} className="brollrow">
                  <span className="tag">b-roll</span>
                  <span className="muted small">
                    {assetName(b.assetId)} · {fmt(b.startSample / sr)}–{fmt(b.endSample / sr)}
                  </span>
                  <button type="button" className="ghost" onClick={() => removeBroll(b.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {exportMsg && <div className="exportmsg">{exportMsg}</div>}
        </section>

        <section className="transcript">
          <h2>Transcript</h2>
          <p className="words">
            {project.words.map((w, i) => {
              const active = curSample >= w.startSample && curSample < w.endSample && !w.deleted;
              const selected = selRange != null && i >= selRange[0] && i <= selRange[1];
              return (
                <span
                  key={w.id}
                  className={`word${w.deleted ? " deleted" : ""}${active ? " active" : ""}${selected ? " sel" : ""}${isCovered(w) ? " covered" : ""}`}
                  onClick={(e) => onWordClick(i, e)}
                  title={w.deleted ? "click to restore" : "click to cut · shift-click to select for b-roll"}
                >
                  {w.text}{" "}
                </span>
              );
            })}
          </p>
        </section>
      </div>
    </div>
  );
}

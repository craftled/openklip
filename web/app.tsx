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

interface Project {
  slug: string;
  sampleRate: number;
  padMs: number;
  durationSamples: number;
  captions?: { enabled: boolean; maxWords?: number };
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
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const schedRef = useRef<CutScheduler | null>(null);
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;

  useEffect(() => {
    fetch("/api/project")
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        setCaptionsOn(p.captions?.enabled ?? true);
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

  const captionGroups = useMemo(() => {
    if (!project) return [];
    const kept: CaptionWord[] = project.words
      .filter((w) => !w.deleted)
      .map((w) => ({ text: w.text, startSec: w.startSample / project.sampleRate, endSec: w.endSample / project.sampleRate }));
    return groupCaptions(kept, project.captions?.maxWords ?? 6);
  }, [project]);

  const curSec = project ? curSample / project.sampleRate : 0;
  const activeGroup = captionsOn
    ? captionGroups.find((g) => curSec >= g.startSec - 0.05 && curSec <= g.endSec + 0.25)
    : undefined;

  const toggleWord = useCallback((id: string) => {
    setProject((prev) => {
      if (!prev) return prev;
      const words = prev.words.map((w) => (w.id === id ? { ...w, deleted: !w.deleted } : w));
      void fetch("/api/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: words.map((w) => ({ id: w.id, deleted: w.deleted })) }),
      });
      return { ...prev, words };
    });
  }, []);

  const toggleCaptions = () => {
    setCaptionsOn((prev) => {
      const next = !prev;
      void fetch("/api/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captions: { enabled: next } }),
      });
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
          ? `exported ${r.ranges} cuts${r.captions ? " + captions" : ""} (${r.durationSec.toFixed(1)}s)  ->  ${r.out}`
          : `error: ${r.error}`,
      );
    } catch (e) {
      setExportMsg(`error: ${(e as Error).message}`);
    }
    setExporting(false);
  };

  if (!project) return <div className="loading">loading project...</div>;

  const fullDur = project.durationSamples / project.sampleRate;

  return (
    <div className="app">
      <header className="bar">
        <div className="brand">
          <span className="dot" /> openklip <span className="sep">/</span>{" "}
          <span className="muted">{project.slug}</span>
        </div>
        <div className="stats muted">
          {ranges.length} cuts · {fmt(keptDuration)} / {fmt(fullDur)}
        </div>
        <button type="button" className="export" onClick={onExport} disabled={exporting}>
          {exporting ? "exporting..." : "Export"}
        </button>
      </header>

      <div className="body">
        <section className="stage">
          <div className="videoWrap">
            {/* biome-ignore lint/a11y/useMediaCaption: editor preview; the transcript is the caption source being edited */}
            <video ref={videoRef} src="/media/proxy.mp4" playsInline />
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
            <span className="muted small">strike words on the right to cut them</span>
          </div>
          {exportMsg && <div className="exportmsg">{exportMsg}</div>}
        </section>

        <section className="transcript">
          <h2>Transcript</h2>
          <p className="words">
            {project.words.map((w) => {
              const active = curSample >= w.startSample && curSample < w.endSample && !w.deleted;
              return (
                <span
                  key={w.id}
                  className={`word${w.deleted ? " deleted" : ""}${active ? " active" : ""}`}
                  onClick={() => toggleWord(w.id)}
                  title={w.deleted ? "click to restore" : "click to cut"}
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

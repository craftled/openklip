"use client";

import type { Project as EngineProject, Range } from "@engine/edl";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CutTransitionSweepHandle } from "@/components/cut-transition-sweep";
import type { TimelineClipKind } from "@/components/edit-timeline";
import { PLAYER_SPEEDS } from "@/components/player-controls";
import { toastNothingToPlay, toastPlaybackFailed } from "@/lib/app-toast";
import { musicPreviewTime } from "@/lib/music-preview";
import { setMusicPreviewGain } from "@/lib/music-preview-audio";
import { outputPositionSec } from "../../src/schedulerLogic.ts";
import { type ZoomWindow, zoomFactorAtSec } from "../../src/zoom-ramp.ts";
import { CutScheduler } from "../scheduler.ts";

interface PreviewBroll {
  assetId: string;
  display?: "cover" | "pip" | "split";
  endSample: number;
  srcInSample: number;
  startSample: number;
}

interface PreviewMusic {
  assetId: string;
  endSample: number;
  gain: number;
  mode?: "loop" | "trim";
  srcInSample: number;
  startSample: number;
}

export interface UsePreviewPlaybackParams {
  broll: PreviewBroll[];
  cinema: boolean;
  mediaVersion?: number;
  music?: PreviewMusic[];
  project: EngineProject | null;
  ranges: Range[];
  sampleRate: number;
  zooms: {
    endSample: number;
    rampSec: number;
    scale: number;
    startSample: number;
  }[];
}

export function usePreviewPlayback({
  broll,
  cinema,
  mediaVersion,
  music,
  project,
  ranges,
  sampleRate: sr,
  zooms,
}: UsePreviewPlaybackParams) {
  const [playing, setPlaying] = useState(false);
  const [curSample, setCurSample] = useState(0);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [previewRate, setPreviewRate] = useState(1);
  const [previewPip, setPreviewPip] = useState(false);
  const [loop, setLoop] = useState<{ inSec: number; outSec: number } | null>(
    null
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const brollRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const schedRef = useRef<CutScheduler | null>(null);
  const sweepRef = useRef<CutTransitionSweepHandle>(null);
  const projectRef = useRef(project);
  const loopRef = useRef(loop);
  const rangesRef = useRef(ranges);

  projectRef.current = project;
  loopRef.current = loop;
  rangesRef.current = ranges;

  const curSec = curSample / sr;
  const outPos = useMemo(
    () => outputPositionSec(ranges, curSec),
    [ranges, curSec]
  );
  const keptDuration = ranges.reduce((a, r) => a + (r.endSec - r.startSec), 0);

  const activeBroll = broll.find(
    (item) => curSample >= item.startSample && curSample < item.endSample
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
      zooms
        .map((z) => ({
          endSec: outputPositionSec(ranges, z.endSample / sr),
          rampSec: z.rampSec,
          scale: z.scale,
          startSec: outputPositionSec(ranges, z.startSample / sr),
        }))
        .filter((z) => z.endSec - z.startSec > 0.05),
    [ranges, sr, zooms]
  );
  const zoomScale = activeCoverBroll ? 1 : zoomFactorAtSec(outPos, zoomWindows);

  const activeMusic = music?.find(
    (item) => curSample >= item.startSample && curSample < item.endSample
  );

  useEffect(() => {
    if (!(videoRef.current && project) || schedRef.current) {
      return;
    }
    const sched = new CutScheduler(
      videoRef.current,
      () => rangesRef.current,
      () =>
        projectRef.current?.look?.transition ?? {
          type: "none",
          durationMs: 500,
        }
    );
    sched.onTick = (sourceSec) => {
      const lr = loopRef.current;
      if (lr && videoRef.current && sourceSec >= lr.outSec - 0.03) {
        videoRef.current.currentTime = lr.inSec;
        setCurSample(
          Math.round(lr.inSec * (projectRef.current?.sampleRate ?? sr))
        );
        return;
      }
      setCurSample(
        Math.round(sourceSec * (projectRef.current?.sampleRate ?? sr))
      );
    };
    sched.onEnd = () => setPlaying(false);
    sched.onCutBoundary = (transition) => sweepRef.current?.play(transition);
    schedRef.current = sched;
  }, [project, sr]);

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
    const url = `/media/asset/${brollForPreview.assetId}?v=${mediaVersion ?? 0}`;
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
    mediaVersion,
    playing,
    sr,
  ]);

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
    const url = `/media/asset/${activeMusic.assetId}?v=${mediaVersion ?? 0}`;
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
        mode: activeMusic.mode ?? "trim",
        srcInSec: activeMusic.srcInSample / sr,
        startSec: activeMusic.startSample / sr,
      },
      ranges,
    });
    if (Number.isFinite(want) && Math.abs(el.currentTime - want) > 0.25) {
      el.currentTime = want;
    }
    if (el.playbackRate !== previewRate) {
      el.playbackRate = previewRate;
    }
    setMusicPreviewGain(el, activeMusic.gain, musicMuted || previewMuted);
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
    mediaVersion,
    musicMuted,
    playing,
    previewMuted,
    previewRate,
    ranges,
    sr,
  ]);

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
        Math.round(sourceSec * (projectRef.current?.sampleRate ?? sr))
      );
      if (playing) {
        schedRef.current?.pause();
        setPlaying(false);
      }
    },
    [playing, sr]
  );

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

  const seekToSample = useCallback(
    (sample: number) => {
      schedRef.current?.seek(sample / sr);
      setCurSample(sample);
    },
    [sr]
  );

  const onTimelineSelect = useCallback(
    (kind: TimelineClipKind, id: string) => {
      const p = projectRef.current;
      if (!p) {
        return;
      }
      const item =
        kind === "broll"
          ? p.broll?.find((b) => b.id === id)
          : kind === "zoom"
            ? p.zooms?.find((z) => z.id === id)
            : kind === "title"
              ? p.titles?.find((t) => t.id === id)
              : kind === "graphic"
                ? p.graphics?.find((g) => g.id === id)
                : kind === "music"
                  ? p.music?.find((m) => m.id === id)
                  : p.stills?.find((s) => s.id === id);
      if (item) {
        seekToSample(item.startSample);
      }
    },
    [seekToSample]
  );

  return {
    activeCoverBroll: Boolean(activeCoverBroll),
    activePipBroll: Boolean(activePipBroll),
    activeSplitBroll: Boolean(activeSplitBroll),
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
    onTimelineSelect,
    outPos,
    playing,
    previewMuted,
    previewPip,
    previewRate,
    rangesRef,
    schedRef,
    setCurSample,
    setLoop,
    sweepRef,
    toggleMusicMute,
    togglePreviewMute,
    togglePreviewPip,
    videoRef,
    zoomScale,
  };
}

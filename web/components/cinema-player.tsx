"use client";

import type { CutTransition, Range } from "@engine/edl";
import {
  outputPositionSec,
  sourceSecForOutputPosition,
} from "@engine/schedulerLogic";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CutTransitionSweep,
  type CutTransitionSweepHandle,
} from "@/components/cut-transition-sweep";
import {
  PlayerControls,
  PLAYER_SPEEDS as SPEEDS,
} from "@/components/player-controls";
import { Button } from "@/components/ui/button";
import { Download, Play, X } from "@/lib/icon";
import { cn } from "@/lib/utils";
import { CutScheduler } from "@/scheduler";

const HIDE_DELAY_MS = 2600;
const DEFAULT_TRANSITION: CutTransition = { type: "none", durationMs: 500 };

interface CinemaPlayerProps {
  /** Live caption / overlay node rendered over the video, bottom-centered. */
  captionSlot?: ReactNode;
  /** Whether the captions toggle starts on. */
  captionsOn?: boolean;
  /** Total kept (cut-space/output) duration in seconds, matching the
   * inline preview's keptDuration - drives the scrubber's total length. */
  durationSec: number;
  exportDisabled?: boolean;
  exportLabel?: string;
  /**
   * Kept source-time ranges to skip deleted material during playback,
   * matching the inline preview exactly. Read live (like CutScheduler's
   * getRanges elsewhere), not snapshotted, so the caller can pass a cheap
   * ref-backed getter (e.g. `() => rangesRef.current`) without CinemaPlayer
   * recomputing effectiveRanges a second time.
   */
  getRanges: () => Range[];
  /** Decorative cut-boundary sweep transition, matching project.look.transition. */
  getTransition?: () => CutTransition;
  /** Optional eyebrow above/beside the name (e.g. "Cut preview"). */
  label?: string;
  /** Close the cinema overlay. */
  onClose: () => void;
  /** Top-right primary action, replacing "Watch on YouTube". */
  onExport?: () => void;
  onToggleCaptions?: (next: boolean) => void;
  /**
   * Live overlay stack (titles/graphics/captions) rendered aligned to the
   * letterboxed video box, driven by THIS player's current SOURCE time in
   * seconds (post cut-jump), matching the sample-position space
   * titles/captions/graphics are stored in.
   */
  overlay?: (curSourceSec: number) => ReactNode;
  poster?: string;
  /** Shown top-left, replacing Linear's "Episode 01". */
  projectName: string;
  /** Source URL for the video (e.g. the proxy). */
  src: string;
}

interface VideoBox {
  height: number;
  left: number;
  top: number;
  width: number;
}

/**
 * Fullscreen "cinema" video player with visual parity to Linear's player.
 * White-on-black chrome, auto-hiding controls, a hairline scrubber with a
 * dot handle, and a left→right control row: play · volume · time · scrubber ·
 * remaining · speed · captions · PiP · fullscreen.
 *
 * Playback is cut-aware: a dedicated CutScheduler instance (this player's own
 * video element cannot share the inline preview's scheduler, since a
 * scheduler drives exactly one <video> via direct currentTime writes) skips
 * deleted ranges exactly like the inline preview does, so the fullscreen view
 * never shows raw, uncut source material.
 */
export function CinemaPlayer({
  src,
  projectName,
  label,
  onExport,
  exportLabel = "Export",
  exportDisabled,
  onClose,
  captionSlot,
  captionsOn = true,
  onToggleCaptions,
  overlay,
  poster,
  getRanges,
  getTransition,
  durationSec,
}: CinemaPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedRef = useRef<CutScheduler | null>(null);
  const sweepRef = useRef<CutTransitionSweepHandle>(null);

  // Ref-mirrors of the latest callback props, assigned during render (same
  // pattern as app.tsx's rangesRef): the scheduler is constructed exactly
  // once on mount below, so its closures must read through a ref to stay
  // current rather than closing over a stale first-render callback.
  const getRangesRef = useRef(getRanges);
  getRangesRef.current = getRanges;
  const getTransitionRef = useRef(getTransition);
  getTransitionRef.current = getTransition;

  const [playing, setPlaying] = useState(false);
  // Cut-space (output) position, in seconds: what the scrubber shows.
  const [curOutputSec, setCurOutputSec] = useState(0);
  // Raw source-timeline position, in seconds (post cut-jump): what overlays
  // (titles/captions/graphics) are keyed against.
  const [curSourceSec, setCurSourceSec] = useState(0);
  // Raw proxy duration, used only for the buffered-fraction indicator; the
  // scrubber's total length is durationSec (cut-space), not this.
  const [rawDur, setRawDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [fs, setFs] = useState(false);
  const [pip, setPip] = useState(false);
  const [caps, setCaps] = useState(captionsOn);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [box, setBox] = useState<VideoBox | null>(null);

  // Keep the live overlay aligned to the letterboxed (object-contain) video box,
  // not the full black surround, so a lower-third lands on the video edge.
  const measureBox = useCallback(() => {
    const v = videoRef.current;
    const r = rootRef.current;
    if (!(v && r)) {
      return;
    }
    const vr = v.getBoundingClientRect();
    const rr = r.getBoundingClientRect();
    setBox({
      left: vr.left - rr.left,
      top: vr.top - rr.top,
      width: vr.width,
      height: vr.height,
    });
  }, []);

  useEffect(() => {
    measureBox();
    const v = videoRef.current;
    const ro = new ResizeObserver(measureBox);
    if (v) {
      ro.observe(v);
    }
    window.addEventListener("resize", measureBox);
    document.addEventListener("fullscreenchange", measureBox);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureBox);
      document.removeEventListener("fullscreenchange", measureBox);
    };
  }, [measureBox]);

  // --- controls auto-hide -------------------------------------------------
  const showChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = setTimeout(() => {
      // Keep chrome up while paused or interacting.
      if (videoRef.current && !videoRef.current.paused) {
        setChromeVisible(false);
      }
    }, HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    showChrome();
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [showChrome]);

  // --- CutScheduler wiring -------------------------------------------------
  // Constructed exactly once per mount (CinemaPlayer itself is mounted and
  // unmounted whole by the caller when the cinema overlay opens/closes, so
  // an empty dependency array is enough - no need for app.tsx's extra
  // schedRef guard, which exists there to survive re-renders of a
  // never-unmounting component).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }
    const sched = new CutScheduler(
      v,
      () => getRangesRef.current(),
      () => getTransitionRef.current?.() ?? DEFAULT_TRANSITION
    );
    sched.onTick = (sourceSec) => {
      setCurSourceSec(sourceSec);
      setCurOutputSec(outputPositionSec(getRangesRef.current(), sourceSec));
    };
    sched.onEnd = () => setPlaying(false);
    sched.onCutBoundary = (transition) => sweepRef.current?.play(transition);
    schedRef.current = sched;
    return () => {
      sched.dispose();
      schedRef.current = null;
    };
  }, []);

  // --- video element wiring ----------------------------------------------
  const togglePlay = useCallback(() => {
    const sched = schedRef.current;
    if (!sched) {
      return;
    }
    if (sched.isPlaying) {
      sched.pause();
    } else {
      void sched.play();
    }
  }, []);

  const seekTo = useCallback(
    (outSec: number) => {
      const sched = schedRef.current;
      if (!sched) {
        return;
      }
      const clamped = Math.max(0, Math.min(durationSec, outSec));
      sched.seek(sourceSecForOutputPosition(getRangesRef.current(), clamped));
    },
    [durationSec]
  );

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  }, []);

  const togglePip = useCallback(async () => {
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

  const cycleSpeed = useCallback(() => {
    const i = SPEEDS.indexOf(rate as (typeof SPEEDS)[number]);
    const next = SPEEDS[(i + 1) % SPEEDS.length];
    setRate(next);
    if (videoRef.current) {
      videoRef.current.playbackRate = next;
    }
  }, [rate]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const toggleCaps = useCallback(() => {
    const next = !caps;
    setCaps(next);
    onToggleCaptions?.(next);
  }, [caps, onToggleCaptions]);

  // Keyboard shortcuts (Linear-style).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        return;
      }
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          seekTo(curOutputSec - 5);
          break;
        case "ArrowRight":
          seekTo(curOutputSec + 5);
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m":
          toggleMute();
          break;
        case "c":
          toggleCaps();
          break;
        case "Escape":
          if (!document.fullscreenElement) {
            onClose();
          }
          break;
        default:
          break;
      }
      showChrome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    curOutputSec,
    onClose,
    seekTo,
    showChrome,
    toggleCaps,
    toggleFullscreen,
    toggleMute,
    togglePlay,
  ]);

  useEffect(() => {
    const onFsChange = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }
    const onEnter = () => setPip(true);
    const onLeave = () => setPip(false);
    v.addEventListener("enterpictureinpicture", onEnter);
    v.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      v.removeEventListener("enterpictureinpicture", onEnter);
      v.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex select-none items-center justify-center bg-black"
      onPointerMove={showChrome}
      ref={rootRef}
      style={{ cursor: chromeVisible ? "auto" : "none" }}
    >
      {/* Vignette surround : soft black falloff at the edges, like Linear. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 120% at 50% 45%, transparent 55%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* Video */}
      {/* biome-ignore lint/a11y/useMediaCaption: captions rendered via captionSlot overlay */}
      <video
        className="relative max-h-full max-w-full cursor-pointer object-contain"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onDurationChange={(e) => setRawDur(e.currentTarget.duration)}
        onLoadedMetadata={(e) => {
          setRawDur(e.currentTarget.duration);
          measureBox();
        }}
        onPause={() => {
          setPlaying(false);
          showChrome();
        }}
        onPlay={() => setPlaying(true)}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.buffered.length) {
            setBuffered(v.buffered.end(v.buffered.length - 1));
          }
        }}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted);
          setVolume(e.currentTarget.volume);
        }}
        playsInline
        poster={poster}
        ref={videoRef}
        src={src}
      />

      {/* Live overlay stack (titles / graphics / captions), aligned to the
          letterboxed video box and synced to this player's playback time. */}
      {overlay && box && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            height: box.height,
            left: box.left,
            top: box.top,
            width: box.width,
          }}
        >
          {overlay(curSourceSec)}
        </div>
      )}

      {/* Live caption overlay (caller-provided, e.g. transcript words) */}
      {caps && captionSlot && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[14%] z-10 flex justify-center px-6">
          {captionSlot}
        </div>
      )}

      {/* Decorative cut-boundary sweep, matching the inline preview. */}
      <CutTransitionSweep ref={sweepRef} />

      {/* Center play affordance when paused */}
      {!playing && (
        <Button
          aria-label="Play"
          className="absolute top-1/2 left-1/2 z-20 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40 text-white backdrop-blur-sm fine-hover:hover:scale-105 fine-hover:hover:bg-black/55 active:scale-[0.97]"
          onClick={togglePlay}
          size="icon-lg"
          type="button"
          variant="ghost"
        >
          <Play />
        </Button>
      )}

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-4 bg-gradient-to-b from-black/55 to-transparent px-5 pt-4 pb-10 transition-opacity duration-200 ease-out",
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <div className="min-w-0 leading-tight">
          {label && (
            <div className="truncate font-medium text-white/45 text-xs uppercase tracking-wide">
              {label}
            </div>
          )}
          <div className="truncate font-medium text-base text-white/90">
            {projectName}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onExport && (
            <Button
              className="h-auto gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-medium text-sm text-white/90 backdrop-blur-sm fine-hover:hover:bg-white/20 active:scale-[0.97] disabled:cursor-not-allowed"
              disabled={exportDisabled}
              onClick={onExport}
              type="button"
              variant="ghost"
            >
              <Download data-icon="inline-start" />
              {exportLabel}
            </Button>
          )}
          <Button
            aria-label="Close player"
            className="size-8 rounded-full text-white/70 fine-hover:hover:bg-white/10 fine-hover:hover:text-white active:scale-[0.97]"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      </div>

      {/* ── Bottom control bar (shared chrome) ──────────────────── */}
      <PlayerControls
        bufferedFraction={rawDur ? buffered / rawDur : 0}
        captionsOn={caps}
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 px-5 pb-4 transition-opacity duration-200 ease-out",
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        current={curOutputSec}
        duration={durationSec}
        fullscreenActive={fs}
        muted={muted}
        onCycleSpeed={cycleSpeed}
        onFullscreen={toggleFullscreen}
        onPlayToggle={togglePlay}
        onSeekFraction={(frac) => seekTo(frac * durationSec)}
        onToggleCaptions={toggleCaps}
        onToggleMute={toggleMute}
        onTogglePip={togglePip}
        pipOn={pip}
        playing={playing}
        rate={rate}
        volume={volume}
      />
    </div>
  );
}

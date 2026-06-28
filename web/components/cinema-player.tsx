"use client";

import { Download, Play, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  PlayerControls,
  PLAYER_SPEEDS as SPEEDS,
} from "@/components/player-controls";
import { cn } from "@/lib/utils";

const HIDE_DELAY_MS = 2600;

interface CinemaPlayerProps {
  /** Live caption / overlay node rendered over the video, bottom-centered. */
  captionSlot?: ReactNode;
  /** Whether the captions toggle starts on. */
  captionsOn?: boolean;
  exportDisabled?: boolean;
  exportLabel?: string;
  /** Optional eyebrow above/beside the name (e.g. "Cut preview"). */
  label?: string;
  /** Close the cinema overlay. */
  onClose: () => void;
  /** Top-right primary action, replacing "Watch on YouTube". */
  onExport?: () => void;
  onToggleCaptions?: (next: boolean) => void;
  poster?: string;
  /** Shown top-left, replacing Linear's "Episode 01". */
  projectName: string;
  /** Source URL for the video (e.g. the proxy). */
  src: string;
}

/**
 * Fullscreen "cinema" video player with visual parity to Linear's player.
 * White-on-black chrome, auto-hiding controls, a hairline scrubber with a
 * dot handle, and a left→right control row: play · volume · time · scrubber ·
 * remaining · speed · captions · PiP · fullscreen.
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
  poster,
}: CinemaPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [fs, setFs] = useState(false);
  const [pip, setPip] = useState(false);
  const [caps, setCaps] = useState(captionsOn);
  const [chromeVisible, setChromeVisible] = useState(true);

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

  // --- video element wiring ----------------------------------------------
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }
    if (v.paused) {
      void v.play();
    } else {
      v.pause();
    }
  }, []);

  const seekTo = useCallback(
    (sec: number) => {
      const v = videoRef.current;
      if (!v) {
        return;
      }
      v.currentTime = Math.max(0, Math.min(dur || v.duration || 0, sec));
      setCur(v.currentTime);
    },
    [dur]
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
          seekTo(cur - 5);
          break;
        case "ArrowRight":
          seekTo(cur + 5);
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
    cur,
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
      {/* Vignette surround — soft black falloff at the edges, like Linear. */}
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
        onDurationChange={(e) => setDur(e.currentTarget.duration)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
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
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted);
          setVolume(e.currentTarget.volume);
        }}
        playsInline
        poster={poster}
        ref={videoRef}
        src={src}
      />

      {/* Live caption overlay (caller-provided, e.g. transcript words) */}
      {caps && captionSlot && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[14%] z-10 flex justify-center px-6">
          {captionSlot}
        </div>
      )}

      {/* Center play affordance when paused */}
      {!playing && (
        <button
          aria-label="Play"
          className="absolute top-1/2 left-1/2 z-20 flex size-16 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-[transform,background-color] duration-150 ease-out fine-hover:hover:scale-105 fine-hover:hover:bg-black/55 active:scale-[0.97]"
          onClick={togglePlay}
          type="button"
        >
          <Play className="ml-0.5 size-7 fill-current" />
        </button>
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
            <div className="truncate text-section-label text-white/45">
              {label}
            </div>
          )}
          <div className="truncate font-medium text-base text-white/90">
            {projectName}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onExport && (
            <button
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-medium text-ui text-white/90 backdrop-blur-sm transition-[transform,background-color] duration-150 ease-out fine-hover:hover:bg-white/20 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={exportDisabled}
              onClick={onExport}
              type="button"
            >
              <Download className="size-3.5" />
              {exportLabel}
            </button>
          )}
          <button
            aria-label="Close player"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full text-white/70 transition-[transform,background-color,color] duration-150 ease-out fine-hover:hover:bg-white/10 fine-hover:hover:text-white active:scale-[0.97]"
            onClick={onClose}
            type="button"
          >
            <X className="size-[18px]" />
          </button>
        </div>
      </div>

      {/* ── Bottom control bar (shared chrome) ──────────────────── */}
      <PlayerControls
        bufferedFraction={dur ? buffered / dur : 0}
        captionsOn={caps}
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 px-5 pb-4 transition-opacity duration-200 ease-out",
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        current={cur}
        duration={dur}
        fullscreenActive={fs}
        muted={muted}
        onCycleSpeed={cycleSpeed}
        onFullscreen={toggleFullscreen}
        onPlayToggle={togglePlay}
        onSeekFraction={(frac) => seekTo(frac * dur)}
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

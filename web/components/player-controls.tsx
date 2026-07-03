"use client";

import { type ReactNode, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Captions,
  Maximize,
  Minimize,
  Music,
  MusicOff,
  Pause,
  PictureInPicture2,
  Play,
  Volume2,
  VolumeX,
} from "@/lib/icon";
import { cn } from "@/lib/utils";

export const PLAYER_SPEEDS = [0.5, 1, 1.25, 1.5, 2] as const;

const TRANSPORT_NUM =
  "shrink-0 font-black text-xs tabular-nums leading-none tracking-tight";

export function fmtClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) {
    return "0:00";
  }
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const ss = String(r).padStart(2, "0");
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  }
  return `${m}:${ss}`;
}

/** Zero-padded minutes for scrubber hover preview (e.g. 04:33 / 17:29). */
function fmtScrubClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) {
    return "00:00";
  }
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  if (h > 0) {
    return `${h}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

interface PlayerControlsProps {
  bufferedFraction?: number;
  captionsOn: boolean;
  className?: string;
  /** Current position, in cut-space (output) display seconds - both the
   * inline preview and the cinema player report this space. */
  current: number;
  /** Total length, in display seconds. */
  duration: number;
  fullscreenActive?: boolean;
  fullscreenLabel?: string;
  musicMuted?: boolean;
  muted: boolean;
  onCycleSpeed: () => void;
  onFullscreen: () => void;
  onPlayToggle: () => void;
  /** Seek to a fraction (0–1) of the duration. */
  onSeekFraction: (frac: number) => void;
  onToggleCaptions: () => void;
  onToggleMusicMute?: () => void;
  onToggleMute: () => void;
  onTogglePip?: () => void;
  pipOn?: boolean;
  playing: boolean;
  rate: number;
  volume?: number;
}

/**
 * Linear-parity transport bar: play · volume · time · hairline scrubber ·
 * remaining · speed · captions · PiP · fullscreen. White-on-dark chrome over a
 * bottom gradient scrim. Shared by the cinema overlay and the inline preview so
 * both surfaces look identical.
 */
export function PlayerControls({
  bufferedFraction = 0,
  captionsOn,
  className,
  current,
  duration,
  fullscreenActive,
  fullscreenLabel,
  musicMuted,
  muted,
  onCycleSpeed,
  onFullscreen,
  onPlayToggle,
  onSeekFraction,
  onToggleCaptions,
  onToggleMusicMute,
  onToggleMute,
  onTogglePip,
  pipOn,
  playing,
  rate,
  volume = 1,
}: PlayerControlsProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [hoverFrac, setHoverFrac] = useState<number | null>(null);

  const fractionFromPointer = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) {
      return null;
    }
    const r = track.getBoundingClientRect();
    if (r.width <= 0) {
      return null;
    }
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }, []);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const frac = fractionFromPointer(clientX);
      if (frac !== null) {
        onSeekFraction(frac);
      }
    },
    [fractionFromPointer, onSeekFraction]
  );

  const updateHoverFromPointer = useCallback(
    (clientX: number) => {
      setHoverFrac(fractionFromPointer(clientX));
    },
    [fractionFromPointer]
  );

  const onScrubDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setScrubbing(true);
      updateHoverFromPointer(e.clientX);
      seekFromPointer(e.clientX);
    },
    [seekFromPointer, updateHoverFromPointer]
  );

  const onScrubMove = useCallback(
    (e: React.PointerEvent) => {
      updateHoverFromPointer(e.clientX);
      if (scrubbing) {
        seekFromPointer(e.clientX);
      }
    },
    [scrubbing, seekFromPointer, updateHoverFromPointer]
  );

  const onScrubLeave = useCallback(() => {
    if (!scrubbing) {
      setHoverFrac(null);
    }
  }, [scrubbing]);

  const onScrubUp = useCallback(
    (e: React.PointerEvent) => {
      setScrubbing(false);
      const track = trackRef.current;
      if (!track) {
        setHoverFrac(null);
        return;
      }
      const r = track.getBoundingClientRect();
      const inside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;
      setHoverFrac(inside ? fractionFromPointer(e.clientX) : null);
    },
    [fractionFromPointer]
  );

  const pct = duration ? Math.min(100, (current / duration) * 100) : 0;
  const bufPct = Math.min(100, bufferedFraction * 100);
  const remaining = Math.max(0, duration - current);
  const hoverSec =
    hoverFrac !== null && duration > 0 ? hoverFrac * duration : null;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 bg-gradient-to-t from-black/65 to-transparent px-4 pt-12 pb-3",
        className
      )}
      data-preview-chrome
      onClick={(e) => e.stopPropagation()}
    >
      <CtrlButton label={playing ? "Pause" : "Play"} onClick={onPlayToggle}>
        {playing ? <Pause /> : <Play />}
      </CtrlButton>

      <CtrlButton label={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>
        {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
      </CtrlButton>

      {onToggleMusicMute && (
        <Button
          aria-label={musicMuted ? "Unmute music" : "Mute music"}
          aria-pressed={musicMuted}
          className={cn(
            "size-7 shrink-0 rounded-full text-white/75 fine-hover:hover:bg-white/10 fine-hover:hover:text-white active:scale-[0.97]",
            musicMuted && "text-white/40"
          )}
          data-music-mute
          onClick={onToggleMusicMute}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {musicMuted ? <MusicOff /> : <Music />}
        </Button>
      )}

      <span className={cn(TRANSPORT_NUM, "text-white")}>
        {fmtClock(current)}
      </span>
      <span className="shrink-0 text-white/30 text-xs leading-none">•</span>

      {/* Hairline scrubber with dot handle + hover preview */}
      <div
        aria-label="Seek"
        aria-valuemax={Math.round(duration)}
        aria-valuemin={0}
        aria-valuenow={Math.round(current)}
        className="group/scrub relative flex min-w-16 flex-1 cursor-pointer items-center py-2"
        onPointerDown={onScrubDown}
        onPointerEnter={(e) => updateHoverFromPointer(e.clientX)}
        onPointerLeave={onScrubLeave}
        onPointerMove={onScrubMove}
        onPointerUp={onScrubUp}
        ref={trackRef}
        role="slider"
        tabIndex={0}
      >
        {hoverFrac !== null && hoverSec !== null && (
          <>
            <div
              className="pointer-events-none absolute -top-1.5 -bottom-1.5 z-10 w-px bg-white/50"
              style={{ left: `${hoverFrac * 100}%` }}
            />
            <div
              className="pointer-events-none absolute bottom-full z-10 mb-3.5 -translate-x-1/2 whitespace-nowrap text-[0.6875rem] text-white/75 tabular-nums leading-none tracking-tight"
              style={{
                left: `clamp(2rem, ${hoverFrac * 100}%, calc(100% - 2rem))`,
              }}
            >
              {fmtScrubClock(hoverSec)}
              <span className="text-white/30">
                {" "}
                / {fmtScrubClock(duration)}
              </span>
            </div>
          </>
        )}
        <div className="relative h-[3px] w-full rounded-full bg-white/20 transition-[height] group-hover/scrub:h-[5px]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/25"
            style={{ width: `${bufPct}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white"
            style={{ width: `${pct}%` }}
          />
          <div
            className={cn(
              "absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-white transition-opacity",
              scrubbing
                ? "opacity-100"
                : "opacity-0 group-hover/scrub:opacity-100"
            )}
            style={{ left: `calc(${pct}% - 5px)` }}
          />
        </div>
      </div>

      <span className={cn(TRANSPORT_NUM, "text-white/70")}>
        -{fmtClock(remaining)}
      </span>

      <Button
        aria-label="Playback speed"
        className={cn(
          TRANSPORT_NUM,
          "h-auto rounded-md px-1 py-0.5 text-white/90 fine-hover:hover:bg-white/10 fine-hover:hover:text-white active:scale-[0.97]"
        )}
        onClick={onCycleSpeed}
        type="button"
        variant="ghost"
      >
        {rate}×
      </Button>

      <CtrlButton
        active={captionsOn}
        label="Captions"
        onClick={onToggleCaptions}
      >
        <Captions />
      </CtrlButton>

      {onTogglePip && (
        <CtrlButton
          active={pipOn}
          label="Picture in picture"
          onClick={onTogglePip}
        >
          <PictureInPicture2 />
        </CtrlButton>
      )}

      <CtrlButton
        active={fullscreenActive}
        label={
          fullscreenLabel ??
          (fullscreenActive ? "Exit fullscreen" : "Fullscreen")
        }
        onClick={onFullscreen}
      >
        {fullscreenActive ? <Minimize /> : <Maximize />}
      </CtrlButton>
    </div>
  );
}

export function CtrlButton({
  active,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "size-7 shrink-0 rounded-full text-white/75 fine-hover:hover:bg-white/10 fine-hover:hover:text-white active:scale-[0.97]",
        active && "text-white ring-1 ring-white/40 ring-inset"
      )}
      onClick={onClick}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

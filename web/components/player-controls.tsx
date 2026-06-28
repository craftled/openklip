"use client";

import { type ReactNode, useCallback, useRef, useState } from "react";
import {
  Captions,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Volume2,
  VolumeX,
} from "@/lib/icon";
import { cn } from "@/lib/utils";

export const PLAYER_SPEEDS = [0.5, 1, 1.25, 1.5, 2] as const;

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

interface PlayerControlsProps {
  bufferedFraction?: number;
  captionsOn: boolean;
  className?: string;
  /** Current position, in display seconds (cut-space inline, raw in cinema). */
  current: number;
  /** Total length, in display seconds. */
  duration: number;
  fullscreenActive?: boolean;
  fullscreenLabel?: string;
  muted: boolean;
  onCycleSpeed: () => void;
  onFullscreen: () => void;
  onPlayToggle: () => void;
  /** Seek to a fraction (0–1) of the duration. */
  onSeekFraction: (frac: number) => void;
  onToggleCaptions: () => void;
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
  muted,
  onCycleSpeed,
  onFullscreen,
  onPlayToggle,
  onSeekFraction,
  onToggleCaptions,
  onToggleMute,
  onTogglePip,
  pipOn,
  playing,
  rate,
  volume = 1,
}: PlayerControlsProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      const r = track.getBoundingClientRect();
      onSeekFraction(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
    },
    [onSeekFraction]
  );

  const onScrubDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setScrubbing(true);
      seekFromPointer(e.clientX);
    },
    [seekFromPointer]
  );

  const onScrubMove = useCallback(
    (e: React.PointerEvent) => {
      if (scrubbing) {
        seekFromPointer(e.clientX);
      }
    },
    [scrubbing, seekFromPointer]
  );

  const pct = duration ? Math.min(100, (current / duration) * 100) : 0;
  const bufPct = Math.min(100, bufferedFraction * 100);
  const remaining = Math.max(0, duration - current);

  return (
    <div
      className={cn(
        "flex items-center gap-3 bg-gradient-to-t from-black/65 to-transparent px-4 pt-12 pb-3",
        className
      )}
      data-preview-chrome
      onClick={(e) => e.stopPropagation()}
    >
      <CtrlButton label={playing ? "Pause" : "Play"} onClick={onPlayToggle}>
        {playing ? (
          <Pause className="size-[18px] fill-current" />
        ) : (
          <Play className="size-[18px] fill-current" />
        )}
      </CtrlButton>

      <CtrlButton label={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>
        {muted || volume === 0 ? (
          <VolumeX className="size-[18px]" />
        ) : (
          <Volume2 className="size-[18px]" />
        )}
      </CtrlButton>

      <span className="shrink-0 text-ui text-white/85 tabular-nums">
        {fmtClock(current)}
      </span>
      <span className="shrink-0 text-ui text-white/30">•</span>

      {/* Hairline scrubber with dot handle */}
      <div
        aria-label="Seek"
        aria-valuemax={Math.round(duration)}
        aria-valuemin={0}
        aria-valuenow={Math.round(current)}
        className="group/scrub relative flex min-w-16 flex-1 cursor-pointer items-center py-2"
        onPointerDown={onScrubDown}
        onPointerMove={onScrubMove}
        onPointerUp={() => setScrubbing(false)}
        ref={trackRef}
        role="slider"
        tabIndex={0}
      >
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
              "absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-white transition-opacity",
              scrubbing
                ? "opacity-100"
                : "opacity-0 group-hover/scrub:opacity-100"
            )}
            style={{ left: `calc(${pct}% - 6px)` }}
          />
        </div>
      </div>

      <span className="shrink-0 text-ui text-white/55 tabular-nums">
        -{fmtClock(remaining)}
      </span>

      <button
        aria-label="Playback speed"
        className="shrink-0 cursor-pointer rounded-md px-1.5 py-1 text-ui text-white/75 tabular-nums transition-[transform,background-color,color] duration-150 ease-out fine-hover:hover:bg-white/10 fine-hover:hover:text-white active:scale-[0.97]"
        onClick={onCycleSpeed}
        type="button"
      >
        {rate}×
      </button>

      <CtrlButton
        active={captionsOn}
        label="Captions"
        onClick={onToggleCaptions}
      >
        <Captions className="size-[18px]" />
      </CtrlButton>

      {onTogglePip && (
        <CtrlButton
          active={pipOn}
          label="Picture in picture"
          onClick={onTogglePip}
        >
          <PictureInPicture2 className="size-[18px]" />
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
        {fullscreenActive ? (
          <Minimize className="size-[18px]" />
        ) : (
          <Maximize className="size-[18px]" />
        )}
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
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/75 transition-[transform,background-color,color] duration-150 ease-out fine-hover:hover:bg-white/10 fine-hover:hover:text-white active:scale-[0.97]",
        active && "text-white ring-1 ring-white/40 ring-inset"
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

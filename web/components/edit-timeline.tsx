"use client";

import { Film, ImageIcon, Music, Scissors, Type, ZoomIn } from "lucide-react";
import type { ComponentType, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TimelineClip {
  endSec: number;
  id: string;
  label: string;
  startSec: number;
}

export interface TimelineRange {
  endSec: number;
  startSec: number;
}

export interface TimelineWord {
  deleted: boolean;
  endSec: number;
  id: string;
  index: number;
  startSec: number;
}

interface EditTimelineProps {
  broll: TimelineClip[];
  curSec: number;
  durationSec: number;
  libraryMusic?: TimelineClip[];
  libraryStills?: TimelineClip[];
  onSeek: (sec: number) => void;
  onSelect: (kind: "broll" | "title" | "zoom", id: string) => void;
  ranges: TimelineRange[];
  selected: { id: string; kind: "broll" | "title" | "zoom" } | null;
  selRange: readonly [number, number] | null;
  titles: TimelineClip[];
  wordSpans: TimelineWord[];
  zooms: TimelineClip[];
}

const LABEL_W = 76;
const RULER_H = 22;
const TRACK_H = 30;

function pct(sec: number, dur: number): number {
  return dur > 0 ? Math.min(100, Math.max(0, (sec / dur) * 100)) : 0;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function rulerTicks(durationSec: number): number[] {
  if (durationSec <= 0) {
    return [0];
  }
  const step =
    durationSec <= 30
      ? 5
      : durationSec <= 120
        ? 15
        : durationSec <= 600
          ? 60
          : 120;
  const ticks: number[] = [];
  for (let t = 0; t <= durationSec; t += step) {
    ticks.push(t);
  }
  if (ticks[ticks.length - 1] !== durationSec) {
    ticks.push(durationSec);
  }
  return ticks;
}

function seekFromClick(
  e: MouseEvent<HTMLElement>,
  durationSec: number,
  onSeek: (sec: number) => void
): void {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const ratio = rect.width > 0 ? x / rect.width : 0;
  onSeek(ratio * durationSec);
}

function LibraryBlock({
  clip,
  durationSec,
  className,
}: {
  clip: TimelineClip;
  durationSec: number;
  className: string;
}) {
  const left = pct(clip.startSec, durationSec);
  const width = Math.max(
    0.6,
    pct(clip.endSec, durationSec) - pct(clip.startSec, durationSec)
  );
  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 truncate rounded border border-dashed px-1 text-caption leading-none opacity-75",
        className
      )}
      style={{ left: `${left}%`, width: `${width}%` }}
      title={`${clip.label} (registered, not placed on edit)`}
    >
      {clip.label}
    </div>
  );
}
function ClipBlock({
  clip,
  durationSec,
  active,
  className,
  onClick,
}: {
  clip: TimelineClip;
  durationSec: number;
  active: boolean;
  className: string;
  onClick: () => void;
}) {
  const left = pct(clip.startSec, durationSec);
  const width = Math.max(
    0.6,
    pct(clip.endSec, durationSec) - pct(clip.startSec, durationSec)
  );
  return (
    <button
      className={cn(
        "absolute top-1 bottom-1 cursor-pointer truncate rounded px-1 text-left text-caption leading-none transition-opacity hover:opacity-100",
        active
          ? "ring-2 ring-live ring-offset-1 ring-offset-background"
          : "opacity-90",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ left: `${left}%`, width: `${width}%` }}
      title={clip.label}
      type="button"
    >
      {clip.label}
    </button>
  );
}

function TrackRow({
  icon: Icon,
  label,
  durationSec,
  onSeek,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  durationSec: number;
  onSeek: (sec: number) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex border-foreground/10 border-b last:border-b-0">
      <div
        className="flex shrink-0 items-center gap-1.5 border-border border-r bg-surface-1 px-2 text-caption text-tertiary"
        style={{ width: LABEL_W }}
      >
        <Icon className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div
        className="relative min-w-0 flex-1 cursor-pointer bg-background/50"
        onClick={(e) => seekFromClick(e, durationSec, onSeek)}
        role="presentation"
        style={{ height: TRACK_H }}
      >
        {children}
      </div>
    </div>
  );
}

export function EditTimeline({
  broll,
  curSec,
  durationSec,
  libraryMusic = [],
  libraryStills = [],
  onSeek,
  onSelect,
  ranges,
  selected,
  selRange,
  titles,
  wordSpans,
  zooms,
}: EditTimelineProps) {
  const ticks = rulerTicks(durationSec);
  const playhead = pct(curSec, durationSec);

  return (
    <div className="bg-foreground/2">
      <div className="overflow-x-auto">
        <div className="relative min-w-[520px]">
          <div className="flex border-foreground/10 border-b">
            <div
              className="shrink-0 border-foreground/10 border-r bg-foreground/3"
              style={{ width: LABEL_W, height: RULER_H }}
            />
            <div
              className="relative min-w-0 flex-1 cursor-pointer"
              onClick={(e) => seekFromClick(e, durationSec, onSeek)}
              role="presentation"
              style={{ height: RULER_H }}
            >
              {ticks.map((t) => (
                <span
                  className="absolute top-0 text-caption text-quaternary tabular-nums"
                  key={t}
                  style={{
                    left: `${pct(t, durationSec)}%`,
                    transform: "translateX(-50%)",
                  }}
                >
                  {fmtTime(t)}
                </span>
              ))}
            </div>
          </div>

          <TrackRow
            durationSec={durationSec}
            icon={Scissors}
            label="Words"
            onSeek={onSeek}
          >
            {ranges.map((r, i) => (
              <div
                className="absolute top-1 bottom-1 rounded bg-live/20 ring-1 ring-live/30"
                key={`${r.startSec}-${r.endSec}-${i}`}
                style={{
                  left: `${pct(r.startSec, durationSec)}%`,
                  width: `${Math.max(0.4, pct(r.endSec, durationSec) - pct(r.startSec, durationSec))}%`,
                }}
              />
            ))}
            {wordSpans.map((w) => {
              const inSel =
                selRange != null &&
                w.index >= selRange[0] &&
                w.index <= selRange[1];
              return (
                <div
                  className={cn(
                    "absolute top-2 bottom-2 rounded-sm border border-transparent",
                    w.deleted
                      ? "bg-foreground/10"
                      : "bg-foreground/10 hover:bg-foreground/20",
                    inSel && "border-live/50 bg-live/15"
                  )}
                  key={w.id}
                  style={{
                    left: `${pct(w.startSec, durationSec)}%`,
                    width: `${Math.max(0.25, pct(w.endSec, durationSec) - pct(w.startSec, durationSec))}%`,
                  }}
                  title={w.deleted ? "Cut" : "Kept"}
                />
              );
            })}
          </TrackRow>

          <TrackRow
            durationSec={durationSec}
            icon={Film}
            label="B-roll"
            onSeek={onSeek}
          >
            {broll.map((clip) => (
              <ClipBlock
                active={selected?.kind === "broll" && selected.id === clip.id}
                className="bg-broll/25 text-foreground"
                clip={clip}
                durationSec={durationSec}
                key={clip.id}
                onClick={() => onSelect("broll", clip.id)}
              />
            ))}
          </TrackRow>

          <TrackRow
            durationSec={durationSec}
            icon={ZoomIn}
            label="Push-in"
            onSeek={onSeek}
          >
            {zooms.map((clip) => (
              <ClipBlock
                active={selected?.kind === "zoom" && selected.id === clip.id}
                className="bg-zoom/20 text-foreground"
                clip={clip}
                durationSec={durationSec}
                key={clip.id}
                onClick={() => onSelect("zoom", clip.id)}
              />
            ))}
          </TrackRow>

          <TrackRow
            durationSec={durationSec}
            icon={Type}
            label="Titles"
            onSeek={onSeek}
          >
            {titles.map((clip) => (
              <ClipBlock
                active={selected?.kind === "title" && selected.id === clip.id}
                className="border border-title/30 bg-title/15 text-foreground"
                clip={clip}
                durationSec={durationSec}
                key={clip.id}
                onClick={() => onSelect("title", clip.id)}
              />
            ))}
          </TrackRow>

          {libraryMusic.length > 0 && (
            <TrackRow
              durationSec={durationSec}
              icon={Music}
              label="Music"
              onSeek={onSeek}
            >
              {libraryMusic.map((clip) => (
                <LibraryBlock
                  className="border-info/40 bg-info/10 text-foreground"
                  clip={clip}
                  durationSec={durationSec}
                  key={clip.id}
                />
              ))}
            </TrackRow>
          )}

          {libraryStills.length > 0 && (
            <TrackRow
              durationSec={durationSec}
              icon={ImageIcon}
              label="Stills"
              onSeek={onSeek}
            >
              {libraryStills.map((clip) => (
                <LibraryBlock
                  className="border-zoom/40 bg-zoom/10 text-foreground"
                  clip={clip}
                  durationSec={durationSec}
                  key={clip.id}
                />
              ))}
            </TrackRow>
          )}

          <div
            className="pointer-events-none absolute inset-y-0 z-30"
            style={{ left: LABEL_W, right: 0 }}
          >
            <div
              className="absolute inset-y-0 w-px bg-live"
              style={{ left: `${playhead}%` }}
            />
            <div
              className="absolute top-0 size-2 -translate-x-1/2 rounded-full bg-live"
              style={{ left: `${playhead}%`, marginTop: RULER_H - 4 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

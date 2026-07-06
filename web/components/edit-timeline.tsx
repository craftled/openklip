"use client";

import type { Keyframe } from "@engine/keyframes";
import {
  type ComponentType,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  APP_ICON_CLASS,
  Film,
  ImageIcon,
  Music,
  Scan,
  Scissors,
  Sparkles,
  Type,
  ZoomIn,
} from "@/lib/icon";
import { keyframePositionFraction } from "@/lib/keyframe-ui";
import {
  minClipSpanSamples,
  moveClipSpan,
  resizeClipSpan,
} from "@/lib/timeline-clip-edit";
import {
  buildTimelineSnapPoints,
  defaultSnapThresholdSamples,
  type SnapPoint,
  snapSample,
} from "@/lib/timeline-snap";
import {
  clampTimelineZoom,
  clipLeftPx,
  clipWidthPx,
  MAX_TIMELINE_ZOOM,
  MIN_TIMELINE_ZOOM,
  pointerXToSample,
  pointerXToSec,
  secToPx,
  TIMELINE_ZOOM_STEP,
  timelineContentWidthPx,
} from "@/lib/timeline-zoom";
import { cn } from "@/lib/utils";

export type TimelineClipKind =
  | "broll"
  | "zoom"
  | "title"
  | "still"
  | "graphic"
  | "music";

export interface TimelineClip {
  endSample: number;
  endSec: number;
  id: string;
  keyframes?: Keyframe[];
  label: string;
  startSample: number;
  startSec: number;
}

export interface TimelineRange {
  endSec: number;
  startSec: number;
}

export interface TimelineWord {
  deleted: boolean;
  endSample: number;
  endSec: number;
  id: string;
  index: number;
  startSample: number;
  startSec: number;
}

export interface TimelineTiming {
  endSample: number;
  startSample: number;
}

interface EditTimelineProps {
  broll: TimelineClip[];
  curSec: number;
  durationSamples: number;
  durationSec: number;
  graphics: TimelineClip[];
  libraryMusic?: TimelineClip[];
  libraryStills?: TimelineClip[];
  /** Placed music beds (project.music); rendered as simple spans, no drag-trim. */
  music?: TimelineClip[];
  onClipTiming: (
    kind: TimelineClipKind,
    id: string,
    timing: TimelineTiming,
    commit: boolean
  ) => void;
  onSeek: (sec: number) => void;
  onSelect: (kind: TimelineClipKind, id: string) => void;
  onWordClick: (index: number, shiftKey: boolean) => void;
  ranges: TimelineRange[];
  sampleRate: number;
  selected: { id: string; kind: TimelineClipKind } | null;
  selRange: readonly [number, number] | null;
  stills: TimelineClip[];
  titles: TimelineClip[];
  wordSpans: TimelineWord[];
  zooms: TimelineClip[];
}

const LABEL_W = 104;
const RULER_H = 20;
const TRACK_H = 28;
const HANDLE_W = 6;

function TimelineToolbar({
  onSnapToggle,
  onZoomIn,
  onZoomOut,
  snappingEnabled,
  zoom,
}: {
  onSnapToggle: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  snappingEnabled: boolean;
  zoom: number;
}) {
  return (
    <div className="flex h-8 items-center justify-end gap-1 border-border/60 border-b bg-muted/20 px-2 text-[11px]">
      <Button
        aria-label={snappingEnabled ? "Disable snap" : "Enable snap"}
        aria-pressed={snappingEnabled}
        className={cn(
          "h-6 rounded px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground",
          snappingEnabled && "bg-muted text-foreground"
        )}
        onClick={onSnapToggle}
        size="sm"
        title="Snap to words and clips"
        variant="ghost"
      >
        <Scan data-icon="inline-start" />
      </Button>
      <Button
        aria-label="Zoom out"
        className="size-6 rounded text-muted-foreground"
        disabled={zoom <= MIN_TIMELINE_ZOOM}
        onClick={onZoomOut}
        size="icon-sm"
        variant="ghost"
      >
        −
      </Button>
      <span className="min-w-9 text-center font-medium text-[11px] text-muted-foreground tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        aria-label="Zoom in"
        className="size-6 rounded text-muted-foreground"
        disabled={zoom >= MAX_TIMELINE_ZOOM}
        onClick={onZoomIn}
        size="icon-sm"
        variant="ghost"
      >
        +
      </Button>
    </div>
  );
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
  onSeek: (sec: number) => void,
  scrollLeft: number,
  zoom: number
): void {
  const rect = e.currentTarget.getBoundingClientRect();
  onSeek(pointerXToSec({ clientX: e.clientX, rect, scrollLeft, zoom }));
}

function LibraryBlock({
  clip,
  className,
  zoom,
}: {
  clip: TimelineClip;
  className: string;
  zoom: number;
}) {
  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 truncate rounded-[4px] border border-dashed px-1.5 pt-1 font-medium text-[11px] leading-none opacity-70",
        className
      )}
      style={{
        left: clipLeftPx(clip.startSec, zoom),
        width: clipWidthPx(clip.startSec, clip.endSec, zoom),
      }}
      title={`${clip.label} (registered, not placed on edit)`}
    >
      {clip.label}
    </div>
  );
}

function EditableClipBlock({
  active,
  className,
  clip,
  durationSamples,
  onSelect,
  onTiming,
  sampleRate,
  scrollRef,
  snapPoints,
  snappingEnabled,
  snapThresholdSamples,
  trackEl,
  zoom,
}: {
  active: boolean;
  className: string;
  clip: TimelineClip;
  durationSamples: number;
  onSelect: () => void;
  onTiming: (timing: TimelineTiming, commit: boolean) => void;
  sampleRate: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  snapPoints: SnapPoint[];
  snappingEnabled: boolean;
  snapThresholdSamples: number;
  trackEl: HTMLDivElement | null;
  zoom: number;
}) {
  const dragRef = useRef<{
    lastTiming: TimelineTiming;
    mode: "move" | "resize-end" | "resize-start";
    originEnd: number;
    originSample: number;
    originStart: number;
  } | null>(null);

  const sampleAtPointer = useCallback(
    (clientX: number) => {
      if (!trackEl) {
        return 0;
      }
      const rect = trackEl.getBoundingClientRect();
      const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
      const raw = pointerXToSample({
        clientX,
        rect,
        scrollLeft,
        durationSamples,
        zoom,
        sampleRate,
      });
      return snapSample({
        sample: raw,
        enabled: snappingEnabled,
        snapPoints,
        thresholdSamples: snapThresholdSamples,
      }).snappedSample;
    },
    [
      durationSamples,
      sampleRate,
      scrollRef,
      snapPoints,
      snapThresholdSamples,
      snappingEnabled,
      trackEl,
      zoom,
    ]
  );

  const updateFromPointer = useCallback(
    (clientX: number) => {
      if (!(dragRef.current && trackEl)) {
        return;
      }
      const minSpan = minClipSpanSamples(sampleRate);
      const d = dragRef.current;
      let timing: TimelineTiming;
      if (d.mode === "move") {
        const anchor = sampleAtPointer(clientX);
        const delta = anchor - d.originSample;
        timing = moveClipSpan(
          d.originStart,
          d.originEnd,
          delta,
          durationSamples,
          minSpan
        );
      } else {
        const edgeSample = sampleAtPointer(clientX);
        timing = resizeClipSpan(
          d.originStart,
          d.originEnd,
          d.mode === "resize-start" ? "start" : "end",
          edgeSample,
          durationSamples,
          minSpan
        );
      }
      d.lastTiming = timing;
      onTiming(timing, false);
    },
    [durationSamples, onTiming, sampleAtPointer, sampleRate, trackEl]
  );

  const endDrag = useCallback(() => {
    if (dragRef.current) {
      onTiming(dragRef.current.lastTiming, true);
      dragRef.current = null;
    }
  }, [onTiming]);

  const beginDrag = (
    e: PointerEvent<HTMLElement>,
    mode: "move" | "resize-end" | "resize-start"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (!trackEl) {
      return;
    }
    onSelect();
    dragRef.current = {
      mode,
      originSample: sampleAtPointer(e.clientX),
      originStart: clip.startSample,
      originEnd: clip.endSample,
      lastTiming: {
        startSample: clip.startSample,
        endSample: clip.endSample,
      },
    };
  };

  return (
    <div
      className={cn(
        "absolute top-[4px] bottom-[4px] cursor-grab truncate rounded-[4px] border border-black/10 font-medium text-[11px] leading-none transition-opacity hover:opacity-100 active:cursor-grabbing dark:border-white/10",
        active
          ? "z-20 ring-1 ring-ring ring-offset-1 ring-offset-background"
          : "z-10 opacity-90",
        className
      )}
      onPointerCancel={endDrag}
      onPointerDown={(e) => beginDrag(e, "move")}
      onPointerMove={(e) => {
        if (dragRef.current?.mode) {
          updateFromPointer(e.clientX);
        }
      }}
      onPointerUp={endDrag}
      style={{
        left: clipLeftPx(clip.startSec, zoom),
        width: clipWidthPx(clip.startSec, clip.endSec, zoom),
      }}
      title={clip.label}
    >
      <button
        aria-label={`Resize start: ${clip.label}`}
        className="absolute top-0 bottom-0 left-0 z-30 cursor-ew-resize rounded-l bg-foreground/20 opacity-0 hover:opacity-100"
        data-handle="start"
        onPointerDown={(e) => beginDrag(e, "resize-start")}
        style={{ width: HANDLE_W }}
        type="button"
      />
      <span className="pointer-events-none block truncate px-1.5 pt-1 text-left">
        {clip.label}
      </span>
      {clip.keyframes?.map((kf, index) => {
        const clipLength = clip.endSample - clip.startSample;
        if (clipLength <= 0) {
          return null;
        }
        const fraction = keyframePositionFraction(kf.sampleOffset, clipLength);
        return (
          <button
            aria-label={`Keyframe ${kf.property} at ${Math.round(fraction * 100)}%`}
            className="absolute bottom-0.5 z-40 size-1.5 rotate-45 border border-background/70 bg-foreground/80 shadow-sm hover:bg-foreground"
            key={`${kf.sampleOffset}-${kf.property}-${index}`}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect();
            }}
            style={{
              left: `calc(${fraction * 100}% - 3px)`,
            }}
            type="button"
          />
        );
      })}
      <button
        aria-label={`Resize end: ${clip.label}`}
        className="absolute top-0 right-0 bottom-0 z-30 cursor-ew-resize rounded-r bg-foreground/20 opacity-0 hover:opacity-100"
        data-handle="end"
        onPointerDown={(e) => beginDrag(e, "resize-end")}
        style={{ width: HANDLE_W }}
        type="button"
      />
    </div>
  );
}

function TrackRow({
  children,
  contentWidthPx,
  icon: Icon,
  label,
  onSeek,
  scrollLeft,
  ticks = [],
  trackRef,
  zoom,
}: {
  children: ReactNode;
  contentWidthPx: number;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onSeek: (sec: number) => void;
  scrollLeft: number;
  ticks?: number[];
  trackRef?: (el: HTMLDivElement | null) => void;
  zoom: number;
}) {
  return (
    <div className="flex w-full border-border/50 border-b last:border-b-0">
      <div
        className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-border/60 border-r bg-muted/35 px-3 font-medium text-[11px] text-muted-foreground shadow-[1px_0_0_var(--border)]"
        style={{ width: LABEL_W }}
      >
        <Icon className={cn(APP_ICON_CLASS, "size-3.5 opacity-50")} />
        <span className="truncate">{label}</span>
      </div>
      <div
        className="relative shrink-0 cursor-pointer overflow-hidden bg-muted/15"
        onClick={(e) => seekFromClick(e, onSeek, scrollLeft, zoom)}
        ref={trackRef}
        role="presentation"
        style={{ width: contentWidthPx, height: TRACK_H }}
      >
        {ticks.map((t) => (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-border/40"
            key={t}
            style={{ left: secToPx(t, zoom) }}
          />
        ))}
        {children}
      </div>
      <div
        aria-hidden="true"
        className="min-w-0 flex-1 bg-muted/15"
        style={{ height: TRACK_H }}
      />
    </div>
  );
}

function ClipTrack({
  allOverlays,
  clips,
  clipClassName,
  contentWidthPx,
  durationSamples,
  icon,
  label,
  onClipTiming,
  onSeek,
  onSelect,
  playheadSample,
  sampleRate,
  scrollRef,
  scrollLeft,
  selected,
  snappingEnabled,
  snapThresholdSamples,
  ticks,
  trackKind,
  wordSpans,
  zoom,
}: {
  allOverlays: TimelineClip[];
  clips: TimelineClip[];
  clipClassName: string;
  contentWidthPx: number;
  durationSamples: number;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClipTiming: EditTimelineProps["onClipTiming"];
  onSeek: (sec: number) => void;
  onSelect: EditTimelineProps["onSelect"];
  playheadSample: number;
  sampleRate: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollLeft: number;
  selected: EditTimelineProps["selected"];
  snappingEnabled: boolean;
  snapThresholdSamples: number;
  ticks: number[];
  trackKind: TimelineClipKind;
  wordSpans: TimelineWord[];
  zoom: number;
}) {
  const [trackEl, setTrackEl] = useState<HTMLDivElement | null>(null);

  return (
    <TrackRow
      contentWidthPx={contentWidthPx}
      icon={icon}
      label={label}
      onSeek={onSeek}
      scrollLeft={scrollLeft}
      ticks={ticks}
      trackRef={setTrackEl}
      zoom={zoom}
    >
      {clips.map((clip) => {
        const snapPoints = buildTimelineSnapPoints({
          words: wordSpans,
          overlays: allOverlays,
          excludeClipId: clip.id,
          playheadSample,
        });
        return (
          <EditableClipBlock
            active={selected?.kind === trackKind && selected.id === clip.id}
            className={clipClassName}
            clip={clip}
            durationSamples={durationSamples}
            key={clip.id}
            onSelect={() => onSelect(trackKind, clip.id)}
            onTiming={(timing, commit) =>
              onClipTiming(trackKind, clip.id, timing, commit)
            }
            sampleRate={sampleRate}
            scrollRef={scrollRef}
            snapPoints={snapPoints}
            snappingEnabled={snappingEnabled}
            snapThresholdSamples={snapThresholdSamples}
            trackEl={trackEl}
            zoom={zoom}
          />
        );
      })}
    </TrackRow>
  );
}

export function EditTimeline({
  broll,
  curSec,
  durationSamples,
  durationSec,
  libraryMusic = [],
  libraryStills = [],
  music = [],
  graphics,
  onClipTiming,
  onSeek,
  onSelect,
  onWordClick,
  ranges,
  sampleRate,
  selected,
  selRange,
  stills,
  titles,
  wordSpans,
  zooms,
}: EditTimelineProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  const [scrollLeft, setScrollLeft] = useState(0);

  const contentWidthPx = timelineContentWidthPx(durationSec, zoom);
  const canvasWidthPx = LABEL_W + contentWidthPx;
  const canvasWidth = `max(100%, ${canvasWidthPx}px)`;
  const playheadPx = secToPx(curSec, zoom);
  const playheadSample = Math.round(curSec * sampleRate);
  const snapThresholdSamples = defaultSnapThresholdSamples(sampleRate);
  const ticks = rulerTicks(durationSec);
  const gridTicks = ticks.filter((t) => t > 0 && t < durationSec);

  const allOverlays = useMemo(
    () => [...broll, ...zooms, ...titles, ...stills, ...graphics, ...music],
    [broll, graphics, music, stills, titles, zooms]
  );

  const onScroll = useCallback(() => {
    setScrollLeft(scrollRef.current?.scrollLeft ?? 0);
  }, []);

  const clipTrackProps = {
    allOverlays,
    contentWidthPx,
    durationSamples,
    onClipTiming,
    onSeek,
    onSelect,
    playheadSample,
    sampleRate,
    scrollRef,
    scrollLeft,
    selected,
    snappingEnabled,
    snapThresholdSamples,
    ticks: gridTicks,
    wordSpans,
    zoom,
  };

  return (
    <div className="overflow-hidden border-border/60 border-t bg-background text-[11px] shadow-[inset_0_1px_0_rgb(255_255_255/0.45)] dark:shadow-none">
      <TimelineToolbar
        onSnapToggle={() => setSnappingEnabled((v) => !v)}
        onZoomIn={() =>
          setZoom((z) => clampTimelineZoom(z + TIMELINE_ZOOM_STEP))
        }
        onZoomOut={() =>
          setZoom((z) => clampTimelineZoom(z - TIMELINE_ZOOM_STEP))
        }
        snappingEnabled={snappingEnabled}
        zoom={zoom}
      />
      <div
        className="overflow-x-auto overscroll-x-contain"
        onScroll={onScroll}
        ref={scrollRef}
      >
        <div className="relative" style={{ width: canvasWidth }}>
          <div className="flex w-full border-border/50 border-b">
            <div
              className="sticky left-0 z-30 shrink-0 border-border/60 border-r bg-muted/35 shadow-[1px_0_0_var(--border)]"
              style={{ width: LABEL_W, height: RULER_H }}
            />
            <div
              className="relative shrink-0 cursor-pointer bg-muted/15"
              onClick={(e) => seekFromClick(e, onSeek, scrollLeft, zoom)}
              role="presentation"
              style={{ width: contentWidthPx, height: RULER_H }}
            >
              {gridTicks.map((t) => (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 w-px bg-border/50"
                  key={`tick-line-${t}`}
                  style={{ left: secToPx(t, zoom) }}
                />
              ))}
              {ticks.map((t) => (
                <span
                  className="absolute top-1 font-medium text-[10px] text-muted-foreground tabular-nums"
                  key={t}
                  style={{
                    left: secToPx(t, zoom),
                    transform: "translateX(-50%)",
                  }}
                >
                  {fmtTime(t)}
                </span>
              ))}
            </div>
            <div
              aria-hidden="true"
              className="min-w-0 flex-1 bg-muted/15"
              style={{ height: RULER_H }}
            />
          </div>

          <TrackRow
            contentWidthPx={contentWidthPx}
            icon={Scissors}
            label="Words"
            onSeek={onSeek}
            scrollLeft={scrollLeft}
            ticks={gridTicks}
            zoom={zoom}
          >
            {ranges.map((r, i) => (
              <div
                className="absolute top-1 bottom-1 rounded bg-primary/15 ring-1 ring-primary/20"
                key={`${r.startSec}-${r.endSec}-${i}`}
                style={{
                  left: clipLeftPx(r.startSec, zoom),
                  width: clipWidthPx(r.startSec, r.endSec, zoom),
                }}
              />
            ))}
            {wordSpans.map((w) => {
              const inSel =
                selRange != null &&
                w.index >= selRange[0] &&
                w.index <= selRange[1];
              return (
                <button
                  aria-label={
                    w.deleted
                      ? "Cut word (click to restore)"
                      : "Kept word (click to cut)"
                  }
                  aria-pressed={w.deleted}
                  className={cn(
                    "absolute top-[9px] bottom-[9px] cursor-pointer rounded-[2px] border border-transparent",
                    w.deleted
                      ? "bg-muted hover:bg-muted/80"
                      : "bg-muted-foreground/25 hover:bg-muted-foreground/35",
                    inSel && "border-ring bg-primary/30"
                  )}
                  key={w.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onWordClick(w.index, e.shiftKey);
                  }}
                  style={{
                    left: clipLeftPx(w.startSec, zoom),
                    width: clipWidthPx(w.startSec, w.endSec, zoom),
                  }}
                  title={
                    w.deleted ? "Cut (click to restore)" : "Kept (click to cut)"
                  }
                  type="button"
                />
              );
            })}
          </TrackRow>

          <ClipTrack
            {...clipTrackProps}
            clipClassName="bg-sky-600/85 text-white"
            clips={broll}
            icon={Film}
            label="B-roll"
            trackKind="broll"
          />

          <ClipTrack
            {...clipTrackProps}
            clipClassName="bg-violet-600/80 text-white"
            clips={zooms}
            icon={ZoomIn}
            label="Push-in"
            trackKind="zoom"
          />

          <ClipTrack
            {...clipTrackProps}
            clipClassName="bg-fuchsia-700/80 text-white"
            clips={titles}
            icon={Type}
            label="Titles"
            trackKind="title"
          />

          <ClipTrack
            {...clipTrackProps}
            clipClassName="bg-cyan-700/80 text-white"
            clips={graphics}
            icon={Sparkles}
            label="Graphics"
            trackKind="graphic"
          />

          <ClipTrack
            {...clipTrackProps}
            clipClassName="bg-amber-700/80 text-white"
            clips={stills}
            icon={ImageIcon}
            label="Stills"
            trackKind="still"
          />

          {music.length > 0 && (
            <ClipTrack
              {...clipTrackProps}
              clipClassName="bg-emerald-700/80 text-white"
              clips={music}
              icon={Music}
              label="Music"
              trackKind="music"
            />
          )}

          {libraryMusic.length > 0 && (
            <TrackRow
              contentWidthPx={contentWidthPx}
              icon={Music}
              label="Music lib"
              onSeek={onSeek}
              scrollLeft={scrollLeft}
              ticks={gridTicks}
              zoom={zoom}
            >
              {libraryMusic.map((clip) => (
                <LibraryBlock
                  className="border-border bg-muted/60 text-muted-foreground"
                  clip={clip}
                  key={clip.id}
                  zoom={zoom}
                />
              ))}
            </TrackRow>
          )}

          {libraryStills.length > 0 && (
            <TrackRow
              contentWidthPx={contentWidthPx}
              icon={ImageIcon}
              label="Still lib"
              onSeek={onSeek}
              scrollLeft={scrollLeft}
              ticks={gridTicks}
              zoom={zoom}
            >
              {libraryStills.map((clip) => (
                <LibraryBlock
                  className="border-border bg-muted/50 text-muted-foreground"
                  clip={clip}
                  key={clip.id}
                  zoom={zoom}
                />
              ))}
            </TrackRow>
          )}

          <div
            className="pointer-events-none absolute inset-y-0 z-30"
            style={{ left: LABEL_W, width: contentWidthPx }}
          >
            <div
              className="absolute inset-y-0 w-px bg-[#2494ff]"
              style={{ left: playheadPx }}
            />
            <div
              className="absolute top-0 -translate-x-1/2 rounded-sm bg-[#2494ff] px-1.5 py-0.5 font-medium text-[10px] text-white tabular-nums"
              style={{ left: playheadPx }}
            >
              {fmtTime(curSec)}
            </div>
            <div
              className="absolute top-0 size-2 -translate-x-1/2 rounded-full bg-[#2494ff]"
              style={{ left: playheadPx, marginTop: RULER_H - 4 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

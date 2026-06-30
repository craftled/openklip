"use client";

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
  Type,
  ZoomIn,
} from "@/lib/icon";
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

export type TimelineClipKind = "broll" | "zoom" | "title" | "still";

export interface TimelineClip {
  endSample: number;
  endSec: number;
  id: string;
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
  libraryMusic?: TimelineClip[];
  libraryStills?: TimelineClip[];
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

const LABEL_W = 76;
const RULER_H = 22;
const TRACK_H = 30;
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
    <div className="flex items-center justify-end gap-1 border-foreground/10 border-b px-2 py-1.5">
      <Button
        aria-label={snappingEnabled ? "Disable snap" : "Enable snap"}
        aria-pressed={snappingEnabled}
        onClick={onSnapToggle}
        size="sm"
        title="Snap to words and clips"
        variant={snappingEnabled ? "secondary" : "ghost"}
      >
        <Scan data-icon="inline-start" />
      </Button>
      <Button
        aria-label="Zoom out"
        disabled={zoom <= MIN_TIMELINE_ZOOM}
        onClick={onZoomOut}
        size="sm"
        variant="ghost"
      >
        −
      </Button>
      <span className="min-w-[3rem] text-center text-muted-foreground text-xs tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        aria-label="Zoom in"
        disabled={zoom >= MAX_TIMELINE_ZOOM}
        onClick={onZoomIn}
        size="sm"
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
        "absolute top-1 bottom-1 truncate rounded border border-dashed px-1 text-xs leading-none opacity-75",
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
        "absolute top-1 bottom-1 truncate rounded text-xs leading-none transition-opacity hover:opacity-100",
        active
          ? "z-20 ring-2 ring-live ring-offset-1 ring-offset-background"
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
        className="absolute top-0 bottom-0 left-0 z-30 cursor-ew-resize rounded-l bg-foreground/15 opacity-0 hover:opacity-100"
        data-handle="start"
        onPointerDown={(e) => beginDrag(e, "resize-start")}
        style={{ width: HANDLE_W }}
        type="button"
      />
      <span className="pointer-events-none block truncate px-1.5 py-0.5 text-left">
        {clip.label}
      </span>
      <button
        aria-label={`Resize end: ${clip.label}`}
        className="absolute top-0 right-0 bottom-0 z-30 cursor-ew-resize rounded-r bg-foreground/15 opacity-0 hover:opacity-100"
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
  trackRef,
  zoom,
}: {
  children: ReactNode;
  contentWidthPx: number;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onSeek: (sec: number) => void;
  scrollLeft: number;
  trackRef?: (el: HTMLDivElement | null) => void;
  zoom: number;
}) {
  return (
    <div className="flex border-foreground/10 border-b last:border-b-0">
      <div
        className="flex shrink-0 items-center gap-1.5 border-border border-r bg-muted px-2 text-muted-foreground text-xs"
        style={{ width: LABEL_W }}
      >
        <Icon className={APP_ICON_CLASS} />
        <span className="truncate">{label}</span>
      </div>
      <div
        className="relative shrink-0 cursor-pointer bg-background/50"
        onClick={(e) => seekFromClick(e, onSeek, scrollLeft, zoom)}
        ref={trackRef}
        role="presentation"
        style={{ width: contentWidthPx, height: TRACK_H }}
      >
        {children}
      </div>
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
  const playheadPx = secToPx(curSec, zoom);
  const playheadSample = Math.round(curSec * sampleRate);
  const snapThresholdSamples = defaultSnapThresholdSamples(sampleRate);
  const ticks = rulerTicks(durationSec);

  const allOverlays = useMemo(
    () => [...broll, ...zooms, ...titles, ...stills],
    [broll, stills, titles, zooms]
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
    wordSpans,
    zoom,
  };

  return (
    <div className="bg-foreground/2">
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
      <div className="overflow-x-auto" onScroll={onScroll} ref={scrollRef}>
        <div className="relative" style={{ width: canvasWidthPx }}>
          <div className="flex border-foreground/10 border-b">
            <div
              className="shrink-0 border-foreground/10 border-r bg-foreground/3"
              style={{ width: LABEL_W, height: RULER_H }}
            />
            <div
              className="relative shrink-0 cursor-pointer"
              onClick={(e) => seekFromClick(e, onSeek, scrollLeft, zoom)}
              role="presentation"
              style={{ width: contentWidthPx, height: RULER_H }}
            >
              {ticks.map((t) => (
                <span
                  className="absolute top-0 text-muted-foreground text-xs tabular-nums"
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
          </div>

          <TrackRow
            contentWidthPx={contentWidthPx}
            icon={Scissors}
            label="Words"
            onSeek={onSeek}
            scrollLeft={scrollLeft}
            zoom={zoom}
          >
            {ranges.map((r, i) => (
              <div
                className="absolute top-1 bottom-1 rounded bg-live/20 ring-1 ring-live/30"
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
                    "absolute top-2 bottom-2 rounded-sm border border-transparent",
                    w.deleted
                      ? "bg-foreground/10 hover:bg-foreground/15"
                      : "bg-foreground/10 hover:bg-foreground/20",
                    inSel && "border-live/50 bg-live/15"
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
            clipClassName="bg-broll/25 text-foreground"
            clips={broll}
            icon={Film}
            label="B-roll"
            trackKind="broll"
          />

          <ClipTrack
            {...clipTrackProps}
            clipClassName="bg-zoom/20 text-foreground"
            clips={zooms}
            icon={ZoomIn}
            label="Push-in"
            trackKind="zoom"
          />

          <ClipTrack
            {...clipTrackProps}
            clipClassName="border border-title/30 bg-title/15 text-foreground"
            clips={titles}
            icon={Type}
            label="Titles"
            trackKind="title"
          />

          <ClipTrack
            {...clipTrackProps}
            clipClassName="border border-zoom/40 bg-zoom/10 text-foreground"
            clips={stills}
            icon={ImageIcon}
            label="Stills"
            trackKind="still"
          />

          {libraryMusic.length > 0 && (
            <TrackRow
              contentWidthPx={contentWidthPx}
              icon={Music}
              label="Music lib"
              onSeek={onSeek}
              scrollLeft={scrollLeft}
              zoom={zoom}
            >
              {libraryMusic.map((clip) => (
                <LibraryBlock
                  className="border-border bg-muted/50 text-foreground"
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
              zoom={zoom}
            >
              {libraryStills.map((clip) => (
                <LibraryBlock
                  className="border-border bg-muted/40 text-foreground"
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
              className="absolute inset-y-0 w-px bg-live"
              style={{ left: playheadPx }}
            />
            <div
              className="absolute top-0 size-2 -translate-x-1/2 rounded-full bg-live"
              style={{ left: playheadPx, marginTop: RULER_H - 4 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

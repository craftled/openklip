"use client";

import type { ExportAspect, ExportCrop } from "@engine/edl";
import { cropObjectPosition } from "@engine/export-aspect";
import type { SafeAreaPlatform } from "@engine/safe-areas";
import {
  type ComponentProps,
  type MouseEvent,
  type RefObject,
  useEffect,
  useState,
} from "react";
import { AudioDrawer } from "@/components/audio-drawer";
import {
  CutTransitionSweep,
  type CutTransitionSweepHandle,
} from "@/components/cut-transition-sweep";
import { EditorPreviewHeader } from "@/components/editor/editor-preview-header";
import type {
  ExportDialogOptions,
  ExportResolution,
} from "@/components/export-dialog";
import type { GraphicItem } from "@/components/graphic-overlay";
import { PlayerControls } from "@/components/player-controls";
import { PreviewOverlays } from "@/components/preview-overlays";
import { PreviewTransitionNotice } from "@/components/preview-transition-notice";
import { SafeAreaGuides } from "@/components/safe-area-guides";
import { TimelineDrawer } from "@/components/timeline-drawer";
import { useMomentDropZone } from "@/hooks/use-moment-keep";
import { Aperture, Search, Spline, Volume2 } from "@/lib/icon";
import { ORIENTATION_RATIO, type Orientation } from "@/lib/preview-layout";
import { cn } from "@/lib/utils";
import type { CaptionGroup } from "../../../src/captions";

export interface EditorPreviewPaneProps {
  activeCoverBroll: boolean;
  activePipBroll: boolean;
  activeSplitBroll: boolean;
  audio: ComponentProps<typeof AudioDrawer>;
  brollRef: RefObject<HTMLVideoElement | null>;
  captionGroups: CaptionGroup[];
  captionStyleId?: string;
  captionsOn: boolean;
  curSample: number;
  cutCount: number;
  exportAspect: ExportAspect;
  exportDefaultResolution: ExportResolution;
  exportDisabled: boolean;
  exporting: boolean;
  exportLabel: string;
  exportSettingsCrop: ExportCrop;
  fmtTime: (sec: number) => string;
  graphics: GraphicItem[];
  keepMoment: (fromSec: number, toSec: number) => void;
  keptDurationSec: number;
  mediaVersion: number;
  mobileChatOpen?: boolean;
  musicBedCount: number;
  musicMuted: boolean;
  musicRef: RefObject<HTMLAudioElement | null>;
  onCycleSpeed: () => void;
  onExport: (options: ExportDialogOptions) => void | Promise<void>;
  onFocusTranscriptSearch: () => void;
  onFullscreen: () => void;
  onOpenChat?: () => void;
  onOrientationChange: (orientation: Orientation) => void;
  onPlayToggle: () => void | Promise<void>;
  onPreviewClick: (event: MouseEvent<HTMLDivElement>) => void;
  onSafeAreaGuideChange: (platform: SafeAreaPlatform) => void;
  onSeekFraction: (fraction: number) => void;
  onToggleCaptions: () => void;
  onToggleMusicMute?: () => void;
  onToggleMute: () => void;
  onTogglePip: () => void;
  onToggleVignette: () => void;
  orientation: Orientation;
  outPos: number;
  pendingSaves: number;
  playing: boolean;
  previewMuted: boolean;
  previewPip: boolean;
  previewRate: number;
  previewReframe: boolean;
  previewTransitionNoticeText?: string | null;
  safeAreaGuide: SafeAreaPlatform;
  sampleRate: number;
  slug: string;
  sourceFps: number;
  sourceHeight: number;
  sourceWidth: number;
  sweepRef: RefObject<CutTransitionSweepHandle | null>;
  timeline: Omit<
    ComponentProps<typeof TimelineDrawer>,
    "fmtTime" | "keepMoment"
  >;
  titles: {
    endSample: number;
    id: string;
    startSample: number;
    text: string;
  }[];
  videoRef: RefObject<HTMLVideoElement | null>;
  vignetteOn: boolean;
  zoomScale: number;
}

export function EditorPreviewPane({
  activeCoverBroll,
  activePipBroll,
  activeSplitBroll,
  brollRef,
  captionGroups,
  captionStyleId,
  captionsOn,
  curSample,
  cutCount,
  exportAspect,
  exportDefaultResolution,
  exportDisabled,
  exportLabel,
  exportSettingsCrop,
  exporting,
  fmtTime,
  graphics,
  keepMoment,
  keptDurationSec,
  mediaVersion,
  mobileChatOpen,
  musicBedCount,
  musicMuted,
  musicRef,
  onCycleSpeed,
  onExport,
  onFocusTranscriptSearch,
  onFullscreen,
  onOpenChat,
  onOrientationChange,
  onPlayToggle,
  onPreviewClick,
  onSeekFraction,
  onToggleCaptions,
  onToggleMusicMute,
  onToggleMute,
  onTogglePip,
  onToggleVignette,
  onSafeAreaGuideChange,
  orientation,
  outPos,
  pendingSaves,
  playing,
  previewMuted,
  previewPip,
  previewRate,
  previewReframe,
  previewTransitionNoticeText,
  sampleRate,
  safeAreaGuide,
  slug,
  sourceFps,
  sourceHeight,
  sourceWidth,
  sweepRef,
  audio,
  timeline,
  titles,
  videoRef,
  vignetteOn,
  zoomScale,
}: EditorPreviewPaneProps) {
  const [previewMediaFailed, setPreviewMediaFailed] = useState(false);
  const momentDrop = useMomentDropZone(keepMoment);

  useEffect(() => {
    setPreviewMediaFailed(false);
  }, [mediaVersion, slug]);

  return (
    <div className="shrink-0 px-5 pt-5 pb-6">
      <div className="mx-auto w-full max-w-2xl space-y-1">
        <EditorPreviewHeader
          currentSec={outPos}
          cutCount={cutCount}
          exportAspect={exportAspect}
          exportDefaultResolution={exportDefaultResolution}
          exportDisabled={exportDisabled}
          exporting={exporting}
          exportLabel={exportLabel}
          fmtTime={fmtTime}
          keptDurationSec={keptDurationSec}
          mobileChatOpen={mobileChatOpen}
          onExport={onExport}
          onOpenChat={onOpenChat}
          onOrientationChange={onOrientationChange}
          onSafeAreaGuideChange={onSafeAreaGuideChange}
          orientation={orientation}
          pendingSaves={pendingSaves}
          projectName={slug}
          safeAreaGuide={safeAreaGuide}
          sourceFps={sourceFps}
          sourceHeight={sourceHeight}
          sourceWidth={sourceWidth}
        />
        <div
          className={cn(
            "group/preview relative cursor-pointer overflow-hidden bg-black",
            orientation !== "landscape" && "mx-auto",
            momentDrop.dropClassName
          )}
          onClick={onPreviewClick}
          onDragEnter={momentDrop.onDragEnter}
          onDragLeave={momentDrop.onDragLeave}
          onDragOver={momentDrop.onDragOver}
          onDrop={momentDrop.onDrop}
          style={
            orientation === "landscape"
              ? {
                  width: "100%",
                  aspectRatio: String(ORIENTATION_RATIO.landscape),
                }
              : {
                  height: "min(42vh, 50vw)",
                  aspectRatio: String(ORIENTATION_RATIO[orientation]),
                }
          }
        >
          {/* biome-ignore lint/a11y/useMediaCaption: editor preview; transcript is the caption source */}
          <video
            className={cn(
              "block bg-black object-cover",
              activeSplitBroll
                ? "absolute inset-y-0 left-0 z-0 h-full w-1/2"
                : "h-full w-full"
            )}
            onError={() => setPreviewMediaFailed(true)}
            onLoadedData={() => setPreviewMediaFailed(false)}
            playsInline
            ref={videoRef}
            src={`/media/proxy.mp4?v=${mediaVersion}`}
            style={{
              transform: `scale(${zoomScale})`,
              transformOrigin: "center",
              transition: "transform 0.25s ease-out",
              ...(previewReframe
                ? {
                    objectPosition: cropObjectPosition(exportSettingsCrop),
                  }
                : {}),
            }}
          />
          <video
            className={cn(
              "absolute z-0 bg-black object-cover",
              activeCoverBroll
                ? "inset-0 block h-full w-full"
                : activePipBroll
                  ? "right-2 bottom-2 block aspect-video w-[28%] rounded-md border border-white/25 shadow-lg"
                  : activeSplitBroll
                    ? "inset-y-0 right-0 block h-full w-1/2"
                    : "hidden"
            )}
            muted
            playsInline
            ref={brollRef}
          />
          {/* biome-ignore lint/a11y/useMediaCaption: hidden music bed for preview; the transcript is the caption source */}
          <audio className="hidden" playsInline ref={musicRef} />
          <SafeAreaGuides platform={safeAreaGuide} />
          {vignetteOn ? (
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                background:
                  "radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.62) 100%)",
              }}
            />
          ) : null}
          <PreviewOverlays
            captionGroups={captionGroups}
            captionStyleId={captionStyleId}
            captionsOn={captionsOn}
            curSample={curSample}
            graphics={graphics}
            sampleRate={sampleRate}
            slug={slug}
            titles={titles}
          />
          <PreviewTransitionNotice
            message={previewTransitionNoticeText ?? null}
          />
          {previewMediaFailed ? (
            <div
              className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/70 p-4 text-center font-medium text-white text-xs"
              role="alert"
            >
              Preview media could not be decoded. Rebuild or re-ingest this
              project.
            </div>
          ) : null}
          <CutTransitionSweep ref={sweepRef} />
          {exporting || pendingSaves > 0 ? (
            <div className="pointer-events-none absolute top-2 right-2 z-20 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 font-medium text-white text-xs backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {exporting ? "Exporting…" : "Rebuilding…"}
            </div>
          ) : null}
          <PlayerControls
            captionsOn={captionsOn}
            className="absolute inset-x-0 bottom-0 z-30 px-3 pb-3 opacity-0 transition-opacity duration-200 ease-out focus-within:opacity-100 group-hover/preview:opacity-100"
            current={outPos}
            duration={keptDurationSec}
            fullscreenLabel="Open cinema player"
            musicMuted={musicMuted}
            muted={previewMuted}
            onCycleSpeed={onCycleSpeed}
            onFullscreen={onFullscreen}
            onPlayToggle={onPlayToggle}
            onSeekFraction={onSeekFraction}
            onToggleCaptions={onToggleCaptions}
            onToggleMusicMute={
              musicBedCount > 0 ? onToggleMusicMute : undefined
            }
            onToggleMute={onToggleMute}
            onTogglePip={onTogglePip}
            pipOn={previewPip}
            playing={playing}
            rate={previewRate}
          />
        </div>
        <div className="flex items-center gap-1.5 px-0.5 pt-1 text-[10px] text-muted-foreground">
          <button
            className="relative inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-muted px-1 py-px text-[10px] text-muted-foreground leading-none transition-colors after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onFocusTranscriptSearch}
            type="button"
          >
            <Search className="size-2.5" />
            <span>Search transcript</span>
          </button>
          <TimelineDrawer
            {...timeline}
            fmtTime={fmtTime}
            keepMoment={keepMoment}
            triggerChildren={
              <>
                <Spline className="size-2.5" />
                <span>Timeline</span>
              </>
            }
            triggerClassName="relative h-auto min-w-0 cursor-pointer gap-1 rounded-full border-0 bg-muted px-1 py-px font-normal text-[10px] text-muted-foreground leading-none shadow-none transition-colors after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-muted/80 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring sm:h-auto"
            triggerVariant="ghost"
          />
          <AudioDrawer
            {...audio}
            triggerChildren={
              <>
                <Volume2 className="size-2.5" />
                <span>Improve sound</span>
              </>
            }
            triggerClassName="relative h-auto min-w-0 cursor-pointer gap-1 rounded-full border-0 bg-muted px-1 py-px font-normal text-[10px] text-muted-foreground leading-none shadow-none transition-colors after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-muted/80 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring sm:h-auto"
            triggerVariant="ghost"
          />
          <button
            aria-label={vignetteOn ? "Turn vignette off" : "Turn vignette on"}
            aria-pressed={vignetteOn}
            className={cn(
              "relative inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-1 py-px text-[10px] leading-none transition-colors after:absolute after:inset-x-0 after:-inset-y-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              vignetteOn
                ? "bg-foreground/10 text-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
            onClick={onToggleVignette}
            type="button"
          >
            <Aperture className="size-2.5" />
            <span>Vignette</span>
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import type { ExportCrop } from "@engine/edl";
import { cropObjectPosition } from "@engine/export-aspect";
import type { SafeAreaPlatform } from "@engine/safe-areas";
import type { MouseEvent, RefObject } from "react";
import {
  CutTransitionSweep,
  type CutTransitionSweepHandle,
} from "@/components/cut-transition-sweep";
import type { GraphicItem } from "@/components/graphic-overlay";
import { PlayerControls } from "@/components/player-controls";
import { PreviewOverlays } from "@/components/preview-overlays";
import { PreviewTransitionNotice } from "@/components/preview-transition-notice";
import { SafeAreaGuides } from "@/components/safe-area-guides";
import { ORIENTATION_RATIO, type Orientation } from "@/lib/preview-layout";
import { cn } from "@/lib/utils";
import type { CaptionGroup } from "../../../src/captions";

export interface EditorPreviewPaneProps {
  activeCoverBroll: boolean;
  activePipBroll: boolean;
  activeSplitBroll: boolean;
  brollRef: RefObject<HTMLVideoElement | null>;
  captionGroups: CaptionGroup[];
  captionStyleId?: string;
  captionsOn: boolean;
  curSample: number;
  exporting: boolean;
  exportSettingsCrop: ExportCrop;
  graphics: GraphicItem[];
  keptDurationSec: number;
  mediaVersion: number;
  musicBedCount: number;
  musicMuted: boolean;
  musicRef: RefObject<HTMLAudioElement | null>;
  onCycleSpeed: () => void;
  onFullscreen: () => void;
  onPlayToggle: () => void | Promise<void>;
  onPreviewClick: (event: MouseEvent<HTMLDivElement>) => void;
  onSeekFraction: (fraction: number) => void;
  onToggleCaptions: () => void;
  onToggleMusicMute?: () => void;
  onToggleMute: () => void;
  onTogglePip: () => void;
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
  sweepRef: RefObject<CutTransitionSweepHandle | null>;
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
  exportSettingsCrop,
  exporting,
  graphics,
  keptDurationSec,
  mediaVersion,
  musicBedCount,
  musicMuted,
  musicRef,
  onCycleSpeed,
  onFullscreen,
  onPlayToggle,
  onPreviewClick,
  onSeekFraction,
  onToggleCaptions,
  onToggleMusicMute,
  onToggleMute,
  onTogglePip,
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
  sweepRef,
  titles,
  videoRef,
  vignetteOn,
  zoomScale,
}: EditorPreviewPaneProps) {
  return (
    <div className="shrink-0 space-y-3 border-border border-b p-4">
      <div className="mx-auto w-full max-w-2xl">
        <div
          className="group/preview relative cursor-pointer overflow-hidden rounded-lg border border-border bg-black"
          onClick={onPreviewClick}
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
          <CutTransitionSweep ref={sweepRef} />
          {exporting || pendingSaves > 0 ? (
            <div className="pointer-events-none absolute top-2 right-2 z-20 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 font-medium text-white text-xs backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {exporting ? "Exporting…" : "Rebuilding…"}
            </div>
          ) : null}
          <PlayerControls
            captionsOn={captionsOn}
            className="absolute inset-x-0 bottom-0 z-30 px-3 pb-2 opacity-0 transition-opacity duration-200 ease-out focus-within:opacity-100 group-hover/preview:opacity-100"
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
      </div>
    </div>
  );
}

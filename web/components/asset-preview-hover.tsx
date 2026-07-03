"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { BinAsset } from "@/components/asset-bin";
import { MediaAudioVisualizerWave } from "@/components/media-audio-visualizer-wave";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { APP_ICON_CLASS, Music } from "@/lib/icon";
import { cn } from "@/lib/utils";

const PREVIEW_WIDTH = 192;
const HIDE_DELAY_MS = 120;

export function assetPreviewUrl(
  slug: string,
  assetId: string,
  mediaVersion?: number
): string {
  const params = new URLSearchParams({ slug });
  if (mediaVersion != null) {
    params.set("v", String(mediaVersion));
  }
  return `/media/asset/${encodeURIComponent(assetId)}?${params.toString()}`;
}

function previewMediaHeight(kind: BinAsset["kind"]): number {
  if (kind === "still") {
    return PREVIEW_WIDTH;
  }
  return Math.round((PREVIEW_WIDTH * 9) / 16);
}

function MusicPreview({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    setPlaying(false);
    setFailed(false);
    void audio.play().then(
      () => setPlaying(true),
      () => setFailed(true)
    );
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [src]);

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-2 bg-black">
      {playing ? (
        <MediaAudioVisualizerWave
          active={playing}
          className="mx-auto aspect-square size-auto h-full max-h-[min(56%,120px)] w-full max-w-[85%]"
          colorShift={0.3}
          lineWidth={2}
          mediaRef={audioRef}
          size="md"
          state="speaking"
        />
      ) : (
        <>
          <Music className={APP_ICON_CLASS} />
          <span className="text-white/50 text-xs">
            {failed ? "Preview unavailable" : "Loading…"}
          </span>
        </>
      )}
      {/* biome-ignore lint/a11y/useMediaCaption: asset preview */}
      <audio className="hidden" preload="metadata" ref={audioRef} src={src} />
    </div>
  );
}

function AssetPreviewBody({ asset, src }: { asset: BinAsset; src: string }) {
  const mediaHeight = previewMediaHeight(asset.kind);

  return (
    <>
      <div
        className="relative flex items-center justify-center bg-black"
        style={{ height: mediaHeight }}
      >
        {asset.kind === "still" ? (
          // biome-ignore lint/performance/noImgElement: hover preview for local asset proxy
          <img
            alt={asset.name}
            className="h-full w-full object-contain"
            height={mediaHeight}
            src={src}
            width={PREVIEW_WIDTH}
          />
        ) : asset.kind === "music" ? (
          <MusicPreview src={src} />
        ) : (
          <video
            autoPlay
            className="h-full w-full object-contain"
            loop
            muted
            playsInline
            src={src}
          />
        )}
      </div>
      <p className="truncate px-2 py-1.5 text-muted-foreground text-xs">
        {asset.name}
      </p>
    </>
  );
}

interface AssetPreviewRowProps {
  asset: BinAsset;
  children: ReactNode;
  className?: string;
  mediaVersion?: number;
  slug: string;
}

export function AssetPreviewRow({
  asset,
  children,
  className,
  mediaVersion,
  slug,
}: AssetPreviewRowProps) {
  const src = assetPreviewUrl(slug, asset.id, mediaVersion);

  return (
    <HoverCard>
      <HoverCardTrigger
        closeDelay={HIDE_DELAY_MS}
        delay={0}
        render={<li className={cn(className)} data-slot="asset-preview-row" />}
      >
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-48 overflow-hidden p-0"
        side="right"
      >
        <AssetPreviewBody asset={asset} src={src} />
      </HoverCardContent>
    </HoverCard>
  );
}

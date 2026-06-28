"use client";

import { Music } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BinAsset } from "@/components/asset-bin";
import { MediaAudioVisualizerWave } from "@/components/media-audio-visualizer-wave";
import { cn } from "@/lib/utils";

const PREVIEW_WIDTH = 192;
const PREVIEW_PAD = 8;
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
    <div className="relative flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-zinc-900 to-black">
      {playing ? (
        <MediaAudioVisualizerWave
          active={playing}
          className="mx-auto aspect-square size-auto h-full max-h-[min(56%,120px)] w-full max-w-[85%]"
          color="#FA954C"
          colorShift={0.3}
          lineWidth={2}
          mediaRef={audioRef}
          size="md"
          state="speaking"
        />
      ) : (
        <>
          <Music className="size-10 text-white/40" />
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

interface AssetPreviewPanelProps {
  anchor: DOMRect;
  asset: BinAsset;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  src: string;
}

function AssetPreviewPanel({
  anchor,
  asset,
  onPointerEnter,
  onPointerLeave,
  src,
}: AssetPreviewPanelProps) {
  const mediaHeight = previewMediaHeight(asset.kind);

  const position = useMemo(() => {
    let left = anchor.right + PREVIEW_PAD;
    if (left + PREVIEW_WIDTH > window.innerWidth - PREVIEW_PAD) {
      left = anchor.left - PREVIEW_WIDTH - PREVIEW_PAD;
    }
    const panelHeight = mediaHeight + 32;
    let top = anchor.top;
    top = Math.min(
      Math.max(PREVIEW_PAD, top),
      window.innerHeight - panelHeight - PREVIEW_PAD
    );
    return { left, top };
  }, [anchor, mediaHeight]);

  return createPortal(
    <div
      className="fixed z-[100] w-48 overflow-hidden rounded-lg border border-border bg-background shadow-sm"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{ left: position.left, top: position.top }}
    >
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
    </div>,
    document.body
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
  const rowRef = useRef<HTMLLIElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preview, setPreview] = useState<{
    anchor: DOMRect;
    asset: BinAsset;
  } | null>(null);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const showPreview = () => {
    const el = rowRef.current;
    if (!el) {
      return;
    }
    clearHideTimer();
    setPreview({ asset, anchor: el.getBoundingClientRect() });
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => setPreview(null), HIDE_DELAY_MS);
  };

  useEffect(() => () => clearHideTimer(), []);

  const src = assetPreviewUrl(slug, asset.id, mediaVersion);

  return (
    <>
      <li
        className={cn(className)}
        onPointerEnter={showPreview}
        onPointerLeave={scheduleHide}
        ref={rowRef}
      >
        {children}
      </li>
      {preview && (
        <AssetPreviewPanel
          anchor={preview.anchor}
          asset={preview.asset}
          onPointerEnter={clearHideTimer}
          onPointerLeave={scheduleHide}
          src={src}
        />
      )}
    </>
  );
}

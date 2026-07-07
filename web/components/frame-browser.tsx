"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { frameBrowserMode } from "@/lib/frame-browser-mode";

interface FrameSample {
  atSec: number;
  name: string;
  url: string;
}

export function FrameBrowser({ slug }: { slug: string }) {
  const [frames, setFrames] = useState<FrameSample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [scrubSec, setScrubSec] = useState(0);
  const [mode, setMode] = useState<"webcodecs" | "media-seek">("media-seek");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setMode(frameBrowserMode());
    let aborted = false;
    const loadFrames = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(slug)}/frames?limit=16`
        );
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to load frames");
        }
        const data = (await res.json()) as { frames?: FrameSample[] };
        if (!aborted) {
          setFrames(Array.isArray(data.frames) ? data.frames : []);
        }
      } catch (e) {
        if (aborted) {
          return;
        }
        setError((e as Error).message);
        setFrames([]);
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    };

    void loadFrames();

    return () => {
      aborted = true;
    };
  }, [slug]);

  const onScrub = (value: string) => {
    const next = Number(value);
    if (!Number.isFinite(next)) {
      return;
    }
    setScrubSec(next);
    if (videoRef.current) {
      videoRef.current.currentTime = next;
    }
  };

  if (loading) {
    return (
      <p className="text-muted-foreground text-xs">Loading frame browser…</p>
    );
  }

  if (error) {
    return (
      <div className="space-y-1">
        <p className="text-destructive text-xs">{error}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <div className="grid gap-1.5">
        <video
          className="aspect-video w-full rounded border border-border bg-black object-contain"
          muted
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration;
            setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
          }}
          playsInline
          preload="metadata"
          ref={videoRef}
          src={`/media/proxy.mp4?slug=${encodeURIComponent(slug)}`}
          title={
            mode === "webcodecs"
              ? "Frame browser: WebCodecs available"
              : "Frame browser: media seek fallback"
          }
        />
        <input
          aria-label="Frame scrubber"
          className="w-full accent-foreground"
          disabled={duration <= 0}
          max={Math.max(0, duration)}
          min={0}
          onChange={(event) => onScrub(event.currentTarget.value)}
          step={0.05}
          type="range"
          value={Math.min(scrubSec, duration)}
        />
      </div>
      {frames.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No ingest frames yet. Re-ingest or run Analyze media to generate frame
          samples.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {frames.map((frame) => (
          <a
            className="group overflow-hidden rounded border border-border"
            href={frame.url}
            key={frame.name}
            rel="noreferrer"
            target="_blank"
            title={`Open frame @${frame.atSec.toFixed(1)}s`}
          >
            <Image
              alt={`Ingest frame at ${frame.atSec.toFixed(1)}s`}
              className="block aspect-video w-full object-cover transition duration-200 group-hover:scale-[1.01]"
              height={90}
              loading="lazy"
              src={frame.url}
              width={160}
            />
            <p className="truncate px-1 py-0.5 text-center text-[0.68rem] text-muted-foreground">
              {frame.atSec.toFixed(1)}s
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}

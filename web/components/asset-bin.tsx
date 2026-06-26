"use client";

import { Film, ImageIcon, Music, Upload } from "lucide-react";
import { type DragEvent, useCallback, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AssetKind = "broll" | "music" | "still";

export interface BinAsset {
  durationSamples: number;
  id: string;
  kind: AssetKind;
  name: string;
  proxy: string;
}

interface AssetBinProps {
  assets: BinAsset[];
  onAssetsUpdated: (assets: BinAsset[]) => void;
  sampleRate: number;
  slug: string;
}

const KIND_META: Record<
  AssetKind,
  { icon: typeof Film; label: string; accept: string }
> = {
  broll: {
    icon: Film,
    label: "B-roll",
    accept: "video/*",
  },
  music: {
    icon: Music,
    label: "Music",
    accept: "audio/*",
  },
  still: {
    icon: ImageIcon,
    label: "Stills",
    accept: "image/*",
  },
};

function fmtDur(samples: number, sr: number): string {
  const s = samples / sr;
  if (s < 60) {
    return `${s.toFixed(1)}s`;
  }
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function AssetBin({
  assets,
  onAssetsUpdated,
  sampleRate,
  slug,
}: AssetBinProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = [...files];
      if (list.length === 0) {
        return;
      }
      setUploading(true);
      setError(null);
      try {
        let latest = assets;
        for (const file of list) {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch(
            `/api/projects/${encodeURIComponent(slug)}/assets`,
            { method: "POST", body: fd }
          );
          const data = (await res.json()) as {
            assets?: BinAsset[];
            error?: string;
          };
          if (!res.ok) {
            throw new Error(data.error ?? `upload failed (${res.status})`);
          }
          if (data.assets) {
            latest = data.assets.map((a) => ({
              ...a,
              kind: (a.kind ?? "broll") as AssetKind,
            }));
          }
        }
        onAssetsUpdated(latest);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [assets, onAssetsUpdated, slug]
  );

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    await uploadFiles(e.dataTransfer.files);
  };

  const grouped: Record<AssetKind, BinAsset[]> = {
    broll: [],
    music: [],
    still: [],
  };
  for (const a of assets) {
    grouped[a.kind ?? "broll"].push(a);
  }

  return (
    <div className="shrink-0 border-border border-t bg-muted/10">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="font-medium text-muted-foreground text-xs">
          Asset bin
        </span>
        <span className="text-[11px] text-muted-foreground">
          Local project folder · drag files here
        </span>
      </div>

      <button
        className={cn(
          "mx-3 mb-3 flex w-[calc(100%-1.5rem)] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-5 text-center transition-colors",
          dragging
            ? "border-live bg-live/10"
            : "border-border bg-background/60 hover:border-foreground/25 hover:bg-muted/40",
          uploading && "pointer-events-none opacity-60"
        )}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) {
            setDragging(false);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        type="button"
      >
        <Upload className="size-5 text-muted-foreground" />
        <span className="font-medium text-[13px]">
          {uploading ? "Registering…" : "Drop b-roll, music, or stills"}
        </span>
        <span className="max-w-sm text-[11px] text-muted-foreground leading-snug">
          Video → b-roll layer · audio → music · images → stills. Same files the
          CLI and agent use via{" "}
          <code className="text-[10px]">openklip asset-add</code>.
        </span>
        <input
          accept="video/*,audio/*,image/*"
          className="hidden"
          multiple
          onChange={(e) => {
            if (e.target.files) {
              void uploadFiles(e.target.files);
              e.target.value = "";
            }
          }}
          ref={inputRef}
          type="file"
        />
      </button>

      {error && (
        <p className="px-3 pb-2 text-destructive text-xs">
          Upload failed: {error}
        </p>
      )}

      <div className="grid gap-3 px-3 pb-3 md:grid-cols-3">
        {(Object.keys(KIND_META) as AssetKind[]).map((kind) => {
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          const items = grouped[kind];
          return (
            <div
              className="rounded-md border border-border/80 bg-background/80 p-2.5"
              key={kind}
            >
              <div className="mb-2 flex items-center gap-1.5 font-medium text-[11px] text-muted-foreground">
                <Icon className="size-3.5" />
                {meta.label}
                <Badge
                  className="ml-auto h-4 px-1.5 text-[10px]"
                  variant="secondary"
                >
                  {items.length}
                </Badge>
              </div>
              {items.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/70">
                  No {meta.label.toLowerCase()} yet
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {items.map((a) => (
                    <li
                      className="flex items-center gap-2 rounded px-1.5 py-1 text-[12px] hover:bg-muted/60"
                      key={a.id}
                      title={a.name}
                    >
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                        {fmtDur(a.durationSamples, sampleRate)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

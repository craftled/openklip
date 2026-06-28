"use client";

import { Film, ImageIcon, Music, Upload } from "lucide-react";
import {
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AssetPreviewRow } from "@/components/asset-preview-hover";
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

export function withAssetKind<T extends { kind?: AssetKind }>(
  asset: T
): T & { kind: AssetKind } {
  return { ...asset, kind: (asset.kind ?? "broll") as AssetKind };
}

interface AssetBinProps {
  assets: BinAsset[];
  mediaVersion?: number;
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

async function readUploadResponse(res: Response): Promise<{
  assets?: BinAsset[];
  error?: string;
}> {
  const text = await res.text();
  try {
    return JSON.parse(text) as { assets?: BinAsset[]; error?: string };
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(
      res.ok
        ? "Upload returned an invalid response from the server"
        : `Upload failed (${res.status})${snippet ? `: ${snippet}` : ""}`
    );
  }
}

export function AssetBin({
  assets,
  mediaVersion,
  onAssetsUpdated,
  sampleRate,
  slug,
}: AssetBinProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncFromFolder = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(slug)}/assets?sync=1`
      );
      const data = await readUploadResponse(res);
      if (res.ok && data.assets) {
        onAssetsUpdated(data.assets.map(withAssetKind));
      }
    } catch {
      // folder sync is best-effort
    }
  }, [onAssetsUpdated, slug]);

  useEffect(() => {
    void syncFromFolder();
    const id = setInterval(() => void syncFromFolder(), 8000);
    const onFocus = () => void syncFromFolder();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [syncFromFolder]);

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
          const data = await readUploadResponse(res);
          if (!res.ok) {
            throw new Error(data.error ?? `upload failed (${res.status})`);
          }
          if (data.assets) {
            latest = data.assets.map(withAssetKind);
          }
        }
        onAssetsUpdated(latest);
        await syncFromFolder();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [assets, onAssetsUpdated, slug, syncFromFolder]
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
    <div className="px-1">
      <button
        className={cn(
          "mx-0 mb-2 flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-3 text-center transition-colors",
          dragging
            ? "border-success bg-success/10"
            : "border-foreground/20 bg-background/60 hover:border-foreground/30 hover:bg-foreground/5",
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
        <Upload className="size-4 text-muted-foreground" />
        <span className="font-medium text-xs">
          {uploading ? "Registering…" : "Drop or click to add"}
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
        <p className="px-1 pb-2 text-destructive text-xs">
          Upload failed: {error}
        </p>
      )}

      <div className="flex flex-col gap-2 pb-1">
        {(Object.keys(KIND_META) as AssetKind[]).map((kind) => {
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          const items = grouped[kind];
          return (
            <div
              className="min-w-0 overflow-hidden rounded-md border border-border bg-foreground/3 p-2.5"
              key={kind}
            >
              <div className="mb-2 flex items-center gap-1.5 text-muted-foreground text-section-label">
                <Icon className="size-3.5" />
                {meta.label}
                <Badge
                  className="ml-auto h-4 px-1.5 text-caption"
                  variant="secondary"
                >
                  {items.length}
                </Badge>
              </div>
              {items.length === 0 ? (
                <p className="text-caption text-muted-foreground/70">
                  No {meta.label.toLowerCase()} yet
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {items.map((a) => (
                    <AssetPreviewRow
                      asset={a}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-foreground/5"
                      key={a.id}
                      mediaVersion={mediaVersion}
                      slug={slug}
                    >
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
                        {fmtDur(a.durationSamples, sampleRate)}
                      </span>
                    </AssetPreviewRow>
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

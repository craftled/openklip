"use client";

import {
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AssetPreviewRow } from "@/components/asset-preview-hover";
import { Badge } from "@/components/ui/badge";
import {
  toastAssetRemoved,
  toastAssetRemoveFailed,
  toastAssetsSynced,
  toastAssetUploadFailed,
  toastAssetUploadSuccess,
} from "@/lib/app-toast";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import { deleteAssetApi } from "@/lib/asset-bin-update";
import {
  type AssetCardLite,
  assetCardCaption,
  assetCardTooltip,
} from "@/lib/asset-card-display";
import { syncProjectAssets, uploadProjectAssets } from "@/lib/asset-upload";
import { Film, ImageIcon, Music, Trash2, Upload, X } from "@/lib/icon";
import { countNewAssetIds } from "@/lib/toast-notifications";
import { cn } from "@/lib/utils";

export type { AssetBinUpdate } from "@/lib/asset-bin-update";

export type AssetKind = "broll" | "music" | "still";

export interface BinAsset {
  card?: AssetCardLite;
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
  onAssetsUpdated: (update: AssetBinUpdate) => void;
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

function AssetBinRow({
  asset,
  confirmDelete,
  deleting,
  mediaVersion,
  onCancelDelete,
  onConfirmDelete,
  onRequestDelete,
  sampleRate,
  slug,
}: {
  asset: BinAsset;
  confirmDelete: boolean;
  deleting: boolean;
  mediaVersion?: number;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onRequestDelete: () => void;
  sampleRate: number;
  slug: string;
}) {
  return (
    <AssetPreviewRow
      asset={asset}
      className="group/asset relative flex items-center gap-1 rounded px-1.5 py-1 text-sm hover:bg-foreground/5"
      mediaVersion={mediaVersion}
      slug={slug}
    >
      <span
        className="flex min-w-0 flex-1 flex-col"
        title={asset.card ? assetCardTooltip(asset.card) : undefined}
      >
        <span className="truncate">{asset.name}</span>
        {asset.card ? (
          <span className="truncate text-caption text-tertiary">
            {assetCardCaption(asset.card)}
          </span>
        ) : null}
      </span>
      {confirmDelete ? (
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-[11px] text-tertiary">Delete?</span>
          <button
            aria-label={`Confirm delete ${asset.name}`}
            className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
            disabled={deleting}
            onClick={(e) => {
              e.stopPropagation();
              onConfirmDelete();
            }}
            type="button"
          >
            <Trash2 className="size-3" />
          </button>
          <button
            aria-label={`Cancel delete ${asset.name}`}
            className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-tertiary hover:bg-muted disabled:opacity-50"
            disabled={deleting}
            onClick={(e) => {
              e.stopPropagation();
              onCancelDelete();
            }}
            type="button"
          >
            <X className="size-3" />
          </button>
        </span>
      ) : (
        <>
          <button
            aria-label={`Delete ${asset.name}`}
            className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-tertiary opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover/asset:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete();
            }}
            type="button"
          >
            <Trash2 className="size-3" />
          </button>
          <span className="shrink-0 text-caption text-tertiary tabular-nums">
            {fmtDur(asset.durationSamples, sampleRate)}
          </span>
        </>
      )}
    </AssetPreviewRow>
  );
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const knownAssetIdsRef = useRef<Set<string>>(new Set());
  const initialSyncDoneRef = useRef(false);
  const syncingRef = useRef(false);
  const onAssetsUpdatedRef = useRef(onAssetsUpdated);
  useEffect(() => {
    onAssetsUpdatedRef.current = onAssetsUpdated;
  }, [onAssetsUpdated]);

  const syncFromFolder = useCallback(async () => {
    if (syncingRef.current) {
      return;
    }
    syncingRef.current = true;
    try {
      const update = await syncProjectAssets(slug);
      if (update) {
        const newIds = countNewAssetIds(
          knownAssetIdsRef.current,
          update.assets
        );
        for (const asset of update.assets) {
          knownAssetIdsRef.current.add(asset.id);
        }
        onAssetsUpdatedRef.current(update);
        if (initialSyncDoneRef.current && newIds.length > 0) {
          toastAssetsSynced(newIds.length);
        }
        initialSyncDoneRef.current = true;
      }
    } catch {
      // folder sync is best-effort
    } finally {
      syncingRef.current = false;
    }
  }, [slug]);

  useEffect(() => {
    knownAssetIdsRef.current = new Set(assets.map((asset) => asset.id));
    initialSyncDoneRef.current = false;
  }, [slug]);

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
      try {
        const latest = await uploadProjectAssets(slug, files);
        if (latest.length > 0) {
          onAssetsUpdated({ assets: latest });
        }
        await syncFromFolder();
        toastAssetUploadSuccess(list.length);
      } catch (e) {
        toastAssetUploadFailed((e as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [onAssetsUpdated, slug, syncFromFolder]
  );

  const onDeleteAsset = useCallback(
    async (assetId: string) => {
      setDeletingId(assetId);
      const asset = assets.find((a) => a.id === assetId);
      try {
        const result = await deleteAssetApi(slug, assetId);
        if ("error" in result) {
          throw new Error(result.error);
        }
        onAssetsUpdated(result);
        setConfirmDeleteId(null);
        toastAssetRemoved(asset?.name);
      } catch (e) {
        toastAssetRemoveFailed((e as Error).message);
      } finally {
        setDeletingId(null);
      }
    },
    [onAssetsUpdated, slug]
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
        <Upload className="size-4 text-tertiary" />
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
              <div className="mb-2 flex items-center gap-1.5 text-section-label text-tertiary">
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
                <p className="text-caption text-quaternary">
                  No {meta.label.toLowerCase()} yet
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {items.map((a) => (
                    <AssetBinRow
                      asset={a}
                      confirmDelete={confirmDeleteId === a.id}
                      deleting={deletingId === a.id}
                      key={a.id}
                      mediaVersion={mediaVersion}
                      onCancelDelete={() => setConfirmDeleteId(null)}
                      onConfirmDelete={() => void onDeleteAsset(a.id)}
                      onRequestDelete={() => setConfirmDeleteId(a.id)}
                      sampleRate={sampleRate}
                      slug={slug}
                    />
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

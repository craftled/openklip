"use client";

import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AssetPreviewRow,
  assetPreviewUrl,
} from "@/components/asset-preview-hover";
import { Button } from "@/components/ui/button";
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
import {
  APP_ICON_CLASS,
  Film,
  ImageIcon,
  Music,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from "@/lib/icon";
import { countNewAssetIds } from "@/lib/toast-notifications";
import { cn } from "@/lib/utils";
import { runGuiAction } from "../../app/actions.ts";

export type { AssetBinUpdate } from "@/lib/asset-bin-update";

export type AssetKind = "broll" | "music" | "still";

export interface BinAsset {
  avoid?: boolean;
  card?: AssetCardLite;
  durationSamples: number;
  id: string;
  kind: AssetKind;
  mustUse?: boolean;
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

const KIND_META: Record<AssetKind, { icon: typeof Film; label: string }> = {
  broll: {
    icon: Film,
    label: "B-roll",
  },
  music: {
    icon: Music,
    label: "Music",
  },
  still: {
    icon: ImageIcon,
    label: "Stills",
  },
};

function fmtDur(samples: number, sr: number): string {
  const s = samples / sr;
  if (s < 60) {
    return `0:${String(Math.max(1, Math.round(s))).padStart(2, "0")}`;
  }
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

const WAVE_BARS = [
  34, 42, 38, 58, 52, 47, 64, 39, 44, 60, 74, 54, 48, 66, 57, 41, 36, 50, 62,
  45, 39, 56, 70, 52,
];

function AudioTilePreview() {
  return (
    <div className="flex h-full items-center overflow-hidden bg-emerald-950">
      <div className="flex h-16 w-full items-center gap-px px-1.5">
        {WAVE_BARS.map((height, index) => (
          <span
            className="min-w-0 flex-1 rounded-full bg-emerald-400"
            key={`${height}-${index}`}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function AssetThumb({
  asset,
  mediaVersion,
  slug,
}: {
  asset: BinAsset;
  mediaVersion?: number;
  slug: string;
}) {
  const src = assetPreviewUrl(slug, asset.id, mediaVersion);

  if (asset.kind === "music") {
    return <AudioTilePreview />;
  }

  if (asset.kind === "still") {
    return (
      // biome-ignore lint/performance/noImgElement: local project asset thumbnail
      <img
        alt=""
        className="h-full w-full object-cover"
        height={108}
        src={src}
        width={192}
      />
    );
  }

  return (
    <video
      className="h-full w-full object-cover"
      muted
      playsInline
      preload="metadata"
      src={src}
    />
  );
}

function AssetBinCard({
  asset,
  confirmDelete,
  deleting,
  mediaVersion,
  onCancelDelete,
  onConfirmDelete,
  onRequestDelete,
  onToggleAvoid,
  onToggleMust,
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
  onToggleAvoid: () => void;
  onToggleMust: () => void;
  sampleRate: number;
  slug: string;
}) {
  const KindIcon = KIND_META[asset.kind].icon;

  return (
    <AssetPreviewRow
      asset={asset}
      className="group/asset min-w-0"
      mediaVersion={mediaVersion}
      slug={slug}
    >
      <div className="min-w-0">
        <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
          <AssetThumb asset={asset} mediaVersion={mediaVersion} slug={slug} />
          <span className="absolute top-1 left-1 rounded bg-black/55 px-1.5 py-0.5 font-medium text-[11px] text-white tabular-nums leading-none">
            {fmtDur(asset.durationSamples, sampleRate)}
          </span>
          <span className="absolute right-1 bottom-1 grid size-5 place-items-center rounded bg-black/45 text-white">
            <KindIcon className="size-3.5 opacity-80" />
          </span>
          {asset.mustUse || asset.avoid ? (
            <span
              className={cn(
                "absolute top-1 right-1 rounded px-1.5 py-0.5 font-medium text-[10px] leading-none",
                asset.mustUse
                  ? "bg-primary text-primary-foreground"
                  : "bg-destructive text-destructive-foreground"
              )}
            >
              {asset.mustUse ? "Must" : "Avoid"}
            </span>
          ) : null}
          <span className="absolute inset-x-1 bottom-1 flex justify-end gap-1 opacity-0 transition-opacity group-focus-within/asset:opacity-100 group-hover/asset:opacity-100">
            <Button
              aria-label={
                asset.mustUse
                  ? `Clear must-use on ${asset.name}`
                  : `Mark ${asset.name} must-use`
              }
              aria-pressed={asset.mustUse === true}
              className={cn(
                "h-6 rounded bg-black/55 px-1.5 text-[10px] text-white hover:bg-black/70",
                asset.mustUse && "bg-primary text-primary-foreground"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMust();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Must
            </Button>
            <Button
              aria-label={
                asset.avoid
                  ? `Clear avoid on ${asset.name}`
                  : `Mark ${asset.name} avoid`
              }
              aria-pressed={asset.avoid === true}
              className={cn(
                "h-6 rounded bg-black/55 px-1.5 text-[10px] text-white hover:bg-black/70",
                asset.avoid && "bg-destructive text-destructive-foreground"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onToggleAvoid();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Avoid
            </Button>
            <Button
              aria-label={`Delete ${asset.name}`}
              className="size-6 rounded bg-black/55 text-white hover:bg-destructive hover:text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete();
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          </span>
          {confirmDelete ? (
            <span className="absolute inset-0 flex items-center justify-center gap-1 bg-background/85 backdrop-blur-sm">
              <span className="mr-1 text-xs">Delete?</span>
              <Button
                aria-label={`Confirm delete ${asset.name}`}
                className="rounded-sm text-destructive hover:bg-destructive/10"
                disabled={deleting}
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirmDelete();
                }}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2 />
              </Button>
              <Button
                aria-label={`Cancel delete ${asset.name}`}
                className="rounded-sm text-muted-foreground hover:bg-muted"
                disabled={deleting}
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelDelete();
                }}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </span>
          ) : null}
        </div>
        <div
          className="mt-1 min-w-0"
          title={asset.card ? assetCardTooltip(asset.card) : asset.name}
        >
          <p className="truncate text-muted-foreground text-xs leading-4">
            {asset.name}
          </p>
          {asset.card ? (
            <p className="truncate text-[11px] text-muted-foreground/70 leading-4">
              {assetCardCaption(asset.card)}
            </p>
          ) : null}
        </div>
      </div>
    </AssetPreviewRow>
  );
}

function AssetKindFilter({
  active,
  counts,
  onChange,
}: {
  active: AssetKind | "all";
  counts: Record<AssetKind | "all", number>;
  onChange: (kind: AssetKind | "all") => void;
}) {
  const options: Array<{ id: AssetKind | "all"; label: string }> = [
    { id: "all", label: "All" },
    { id: "broll", label: "Video" },
    { id: "music", label: "Audio" },
    { id: "still", label: "Images" },
  ];

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {options.map((option) => (
        <Button
          aria-pressed={active === option.id}
          className={cn(
            "h-7 shrink-0 rounded-md px-2 text-xs",
            active === option.id
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "text-muted-foreground hover:bg-foreground/5"
          )}
          key={option.id}
          onClick={() => onChange(option.id)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {option.label}
          <span className="ml-1 text-[10px] opacity-65">
            {counts[option.id]}
          </span>
        </Button>
      ))}
    </div>
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
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");

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
    [assets, onAssetsUpdated, slug]
  );

  const patchAssetFlags = useCallback(
    (assetId: string, input: { mustUse?: boolean; avoid?: boolean }) => {
      onAssetsUpdated({
        assets: assets.map((a) => {
          if (a.id !== assetId) {
            return a;
          }
          const next = { ...a };
          const { mustUse, avoid } = input;
          if (mustUse === true && avoid === true) {
            next.mustUse = undefined;
            next.avoid = true;
          } else if (mustUse === true) {
            next.mustUse = true;
            next.avoid = undefined;
          } else if (mustUse === false) {
            next.mustUse = undefined;
          }
          if (avoid === true) {
            next.avoid = true;
            next.mustUse = undefined;
          } else if (avoid === false) {
            next.avoid = undefined;
          }
          return next;
        }),
      });
    },
    [assets, onAssetsUpdated]
  );

  const onAssetFlags = useCallback(
    async (assetId: string, input: { mustUse?: boolean; avoid?: boolean }) => {
      patchAssetFlags(assetId, input);
      const result = await runGuiAction(slug, "asset-flags", {
        assetId,
        ...input,
      });
      if (!result.ok) {
        toastAssetRemoveFailed(result.error);
      }
    },
    [patchAssetFlags, slug]
  );

  const onToggleMust = useCallback(
    (asset: BinAsset) => {
      void onAssetFlags(asset.id, { mustUse: !asset.mustUse });
    },
    [onAssetFlags]
  );

  const onToggleAvoid = useCallback(
    (asset: BinAsset) => {
      void onAssetFlags(asset.id, { avoid: !asset.avoid });
    },
    [onAssetFlags]
  );

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    await uploadFiles(e.dataTransfer.files);
  };

  const counts = useMemo(
    () =>
      assets.reduce<Record<AssetKind | "all", number>>(
        (acc, asset) => {
          const kind = asset.kind ?? "broll";
          acc.all += 1;
          acc[kind] += 1;
          return acc;
        },
        { all: 0, broll: 0, music: 0, still: 0 }
      ),
    [assets]
  );

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const kind = asset.kind ?? "broll";
      if (kindFilter !== "all" && kind !== kindFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const haystack = [
        asset.name,
        asset.id,
        asset.card?.summary,
        ...(asset.card?.tags ?? []),
        ...(asset.card?.bestFor ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [assets, kindFilter, query]);

  return (
    <div
      className={cn(
        "px-1",
        dragging && "rounded-lg bg-primary/5 ring-1 ring-primary/35"
      )}
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
    >
      <div className="sticky top-0 z-10 -mx-1 mb-2 bg-sidebar/95 px-1 pb-2 backdrop-blur">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Search assets"
              className="h-9 w-full rounded-md border border-transparent bg-foreground/7 pr-2 pl-8 text-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:bg-background"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              value={query}
            />
          </div>
          <Button
            aria-label="Reset asset filters"
            className="size-9 shrink-0 rounded-md text-muted-foreground hover:bg-foreground/7"
            disabled={kindFilter === "all" && query.trim().length === 0}
            onClick={() => {
              setKindFilter("all");
              setQuery("");
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Settings2 />
          </Button>
          <Button
            aria-label="Upload assets"
            className="size-9 shrink-0 rounded-md text-muted-foreground hover:bg-foreground/7"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Plus />
          </Button>
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
        </div>
        <AssetKindFilter
          active={kindFilter}
          counts={counts}
          onChange={setKindFilter}
        />
      </div>

      {dragging || uploading ? (
        <div className="mb-2 flex items-center justify-center gap-2 rounded-md border border-primary/45 border-dashed bg-primary/10 px-3 py-3 text-center text-primary text-xs">
          <Upload className={APP_ICON_CLASS} />
          {uploading ? "Registering assets..." : "Drop assets to add them"}
        </div>
      ) : null}

      <div className="pb-1">
        {filteredAssets.length === 0 ? (
          <div className="rounded-md border border-border bg-foreground/3 px-3 py-6 text-center text-muted-foreground text-xs">
            {assets.length === 0
              ? "Drop media here or use the plus button."
              : "No assets match this view."}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-4">
            {filteredAssets.map((a) => (
              <AssetBinCard
                asset={a}
                confirmDelete={confirmDeleteId === a.id}
                deleting={deletingId === a.id}
                key={a.id}
                mediaVersion={mediaVersion}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => void onDeleteAsset(a.id)}
                onRequestDelete={() => setConfirmDeleteId(a.id)}
                onToggleAvoid={() => onToggleAvoid(a)}
                onToggleMust={() => onToggleMust(a)}
                sampleRate={sampleRate}
                slug={slug}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

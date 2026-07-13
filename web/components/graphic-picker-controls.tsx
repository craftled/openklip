"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GraphicTemplatePreviewHover } from "@/components/graphic-template-preview-hover";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutTemplate, Plus, Scissors, Upload } from "@/lib/icon";
import { cn } from "@/lib/utils";

export const DEFAULT_GRAPHIC_SPAN_SEC = 4;

const CONFIG_COMPACT_INPUT_CLASS =
  "h-7! rounded-md! px-2! py-1! text-[0.8rem]!";
const CONFIG_COMPACT_SELECT_TRIGGER_CLASS =
  "h-7! rounded-md! px-2! py-0! text-[0.8rem]!";

export type GraphicPack =
  | "motion"
  | "shader"
  | "transition"
  | "other"
  | "project";

export interface GraphicTemplateOption {
  id: string;
  kind: "text" | "rich";
  name: string;
  pack: GraphicPack;
  params: Record<
    string,
    { type: string; default: string | number | boolean; label?: string }
  >;
  requiresAsset: boolean;
  scope: "bundled" | "project";
}

export interface GraphicAssetOption {
  id: string;
  kind: string;
  name: string;
}

export interface GraphicMusicAssetOption {
  id: string;
  name: string;
}

export type GraphicSpanMode = "seconds" | "beats";

const PACK_ORDER: GraphicPack[] = [
  "motion",
  "shader",
  "transition",
  "project",
  "other",
];

const PACK_LABELS: Record<GraphicPack, string> = {
  motion: "Motion",
  shader: "Shaders",
  transition: "Transitions",
  project: "Project-local",
  other: "Other",
};

function groupedTemplates(templates: GraphicTemplateOption[]) {
  const groups = new Map<GraphicPack, GraphicTemplateOption[]>();
  for (const pack of PACK_ORDER) {
    groups.set(pack, []);
  }
  for (const item of templates) {
    groups.get(item.pack)?.push(item);
  }
  return PACK_ORDER.map((pack) => ({
    pack,
    label: PACK_LABELS[pack],
    items: (groups.get(pack) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
  })).filter((g) => g.items.length > 0);
}

export function GraphicSectionControls({
  assets,
  beatCount,
  bpmByAssetId = {},
  bpmDetectingAssetId = null,
  chosenMusicAssetId = "",
  chosenTemplateId,
  durationSec,
  musicAssets = [],
  onAdd,
  onAddAtCuts,
  onBeatCountChange,
  onChooseMusicAsset,
  onChooseTemplate,
  onDetectBpm,
  onParamChange,
  onSpanModeChange,
  onTemplatesReload,
  paramDraft,
  slug,
  spanMode,
  templates,
}: {
  assets: GraphicAssetOption[];
  beatCount: number;
  bpmByAssetId?: Record<string, { bpm: number; confidence: number }>;
  bpmDetectingAssetId?: string | null;
  chosenMusicAssetId?: string;
  chosenTemplateId: string;
  durationSec: number;
  musicAssets?: GraphicMusicAssetOption[];
  onAdd: () => void;
  onAddAtCuts?: () => void;
  onBeatCountChange: (n: number) => void;
  onChooseMusicAsset: (id: string) => void;
  onChooseTemplate: (id: string) => void;
  onDetectBpm?: (assetId: string) => void;
  onParamChange: (key: string, value: string | number | boolean) => void;
  onSpanModeChange: (mode: GraphicSpanMode) => void;
  onTemplatesReload?: () => void;
  paramDraft: Record<string, string | number | boolean>;
  slug: string;
  spanMode: GraphicSpanMode;
  templates: GraphicTemplateOption[];
}) {
  const [uploadId, setUploadId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingManifest, setPendingManifest] = useState<File | null>(null);
  const [pendingComposition, setPendingComposition] = useState<File | null>(
    null
  );

  const uploadTemplate = useCallback(
    async (manifestFile: File, compositionFile: File) => {
      const id = uploadId.trim();
      if (!id) {
        setUploadError("Template id is required");
        return;
      }
      setUploading(true);
      setUploadError(null);
      try {
        const form = new FormData();
        form.set("id", id);
        form.set("manifest", manifestFile);
        form.set("composition", compositionFile);
        const res = await fetch(
          `/api/projects/${encodeURIComponent(slug)}/graphics`,
          { method: "POST", body: form }
        );
        const data = (await res.json()) as {
          error?: string;
          graphic?: { id: string };
        };
        if (!res.ok) {
          throw new Error(data.error ?? `upload failed (${res.status})`);
        }
        onTemplatesReload?.();
        if (data.graphic?.id) {
          onChooseTemplate(data.graphic.id);
        }
        setUploadId("");
      } catch (e) {
        setUploadError((e as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [onChooseTemplate, onTemplatesReload, slug, uploadId]
  );

  const groups = useMemo(() => groupedTemplates(templates), [templates]);
  const selected = templates.find((t) => t.id === chosenTemplateId);
  const imageAssets = assets.filter(
    (a) => a.kind === "still" || a.kind === "broll"
  );
  const needsAsset = selected?.requiresAsset === true;
  const isTransition = selected?.pack === "transition";
  const beatsReady =
    spanMode === "seconds" ||
    (beatCount > 0 &&
      chosenMusicAssetId !== "" &&
      bpmByAssetId[chosenMusicAssetId] !== undefined);

  return (
    <div className="flex flex-col gap-2" data-graphic-section>
      <div className="flex gap-1.5">
        <Select
          onValueChange={(value) => {
            if (value) {
              onChooseTemplate(value);
            }
          }}
          value={chosenTemplateId}
        >
          <SelectTrigger
            className={cn("flex-1", CONFIG_COMPACT_SELECT_TRIGGER_CLASS)}
            data-graphic-template-select
            disabled={templates.length === 0}
            size="sm"
          >
            <SelectValue placeholder="Choose template" />
          </SelectTrigger>
          <SelectContent className="z-50">
            {groups.map((group) => (
              <SelectGroup key={group.pack}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.items.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <GraphicTemplatePreviewHover
                      side="left"
                      slug={slug}
                      template={t}
                    >
                      {t.name}
                    </GraphicTemplatePreviewHover>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {selected ? (
          <GraphicTemplatePreviewHover
            params={paramDraft}
            side="left"
            slug={slug}
            template={selected}
          >
            <Button
              aria-label={`Preview ${selected.name}`}
              data-graphic-template-preview
              size="sm"
              type="button"
              variant="outline"
            >
              <LayoutTemplate data-icon="inline-start" />
              Preview
            </Button>
          </GraphicTemplatePreviewHover>
        ) : null}
        <Button
          aria-label="Place graphic at playhead"
          data-graphic-add
          disabled={
            templates.length === 0 ||
            !chosenTemplateId ||
            !beatsReady ||
            (needsAsset && typeof paramDraft.assetId !== "string") ||
            (needsAsset && paramDraft.assetId === "")
          }
          onClick={onAdd}
          size="sm"
          variant="secondary"
        >
          <Plus data-icon="inline-start" /> Place
        </Button>
      </div>
      {isTransition && onAddAtCuts ? (
        <Button
          data-graphic-add-cuts
          disabled={!chosenTemplateId}
          onClick={onAddAtCuts}
          size="sm"
          variant="outline"
        >
          <Scissors data-icon="inline-start" /> Place at cut seams
        </Button>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          onValueChange={(value) => {
            if (value === "seconds" || value === "beats") {
              onSpanModeChange(value);
            }
          }}
          value={spanMode}
        >
          <SelectTrigger
            className={cn("w-[7.5rem]", CONFIG_COMPACT_SELECT_TRIGGER_CLASS)}
            data-graphic-span-mode
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="seconds">By seconds</SelectItem>
            <SelectItem value="beats">By beats</SelectItem>
          </SelectContent>
        </Select>
        {spanMode === "beats" ? (
          <>
            <Input
              className={cn("w-16", CONFIG_COMPACT_INPUT_CLASS)}
              data-graphic-beats
              min={1}
              onChange={(e) => {
                onBeatCountChange(Number(e.target.value) || 1);
              }}
              type="number"
              value={beatCount}
            />
            <span className="text-muted-foreground text-xs">beats</span>
            <Select
              onValueChange={(value) => {
                if (value) {
                  onChooseMusicAsset(value);
                }
              }}
              value={chosenMusicAssetId}
            >
              <SelectTrigger
                className={cn(
                  "min-w-24 flex-1",
                  CONFIG_COMPACT_SELECT_TRIGGER_CLASS
                )}
                data-graphic-music-asset
                disabled={musicAssets.length === 0}
                size="sm"
              >
                <SelectValue placeholder="Music bed" />
              </SelectTrigger>
              <SelectContent>
                {musicAssets.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {onDetectBpm && chosenMusicAssetId ? (
              <Button
                data-graphic-bpm-detect
                disabled={bpmDetectingAssetId === chosenMusicAssetId}
                onClick={() => {
                  onDetectBpm(chosenMusicAssetId);
                }}
                size="sm"
                variant="ghost"
              >
                {bpmDetectingAssetId === chosenMusicAssetId
                  ? "Detecting…"
                  : "BPM"}
              </Button>
            ) : null}
            {chosenMusicAssetId && bpmByAssetId[chosenMusicAssetId] ? (
              <span
                className="text-muted-foreground text-xs"
                data-graphic-bpm-result
              >
                {bpmByAssetId[chosenMusicAssetId].bpm} BPM
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      {selected ? (
        <div className="flex flex-col gap-1.5">
          {Object.entries(selected.params)
            .filter(([key]) => key !== "assetId" || selected.params.assetId)
            .slice(0, 4)
            .map(([key, spec]) => (
              <Field key={key}>
                <FieldLabel className="text-muted-foreground text-xs">
                  {spec.label ?? key}
                  {key === "assetId" && !needsAsset ? " (optional)" : ""}
                </FieldLabel>
                {spec.type === "asset" ? (
                  <Select
                    onValueChange={(value) => {
                      if (value) {
                        onParamChange(key, value);
                      }
                    }}
                    value={
                      typeof paramDraft[key] === "string"
                        ? (paramDraft[key] as string)
                        : ""
                    }
                  >
                    <SelectTrigger
                      className={CONFIG_COMPACT_SELECT_TRIGGER_CLASS}
                      disabled={imageAssets.length === 0}
                      size="sm"
                    >
                      <SelectValue placeholder="Choose image asset" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {imageAssets.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : spec.type === "boolean" ? (
                  <Select
                    onValueChange={(value) => {
                      onParamChange(key, value === "true");
                    }}
                    value={String(paramDraft[key] ?? spec.default)}
                  >
                    <SelectTrigger
                      className={CONFIG_COMPACT_SELECT_TRIGGER_CLASS}
                      size="sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">On</SelectItem>
                      <SelectItem value="false">Off</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className={CONFIG_COMPACT_INPUT_CLASS}
                    onChange={(e) => {
                      const raw = e.target.value;
                      onParamChange(
                        key,
                        spec.type === "number" ? Number(raw) : raw
                      );
                    }}
                    type={spec.type === "number" ? "number" : "text"}
                    value={String(paramDraft[key] ?? spec.default)}
                  />
                )}
              </Field>
            ))}
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs leading-snug">
        {templates.length === 0 ? (
          "Loading templates…"
        ) : (
          <>
            <LayoutTemplate className="mr-1 inline size-3" />
            {spanMode === "beats"
              ? `Places a ${beatCount}-beat overlay at the playhead when BPM is set.`
              : `Places a ${DEFAULT_GRAPHIC_SPAN_SEC}s overlay at the playhead (max ${durationSec.toFixed(0)}s timeline).`}
          </>
        )}
      </p>
      <div className="space-y-2 rounded-2xl border border-border/60 p-2">
        <p className="font-medium text-muted-foreground text-xs">
          <Upload className="mr-1 inline size-3" />
          Upload project-local template
        </p>
        <Field>
          <FieldLabel className="text-muted-foreground text-xs">
            Template id
          </FieldLabel>
          <Input
            className={CONFIG_COMPACT_INPUT_CLASS}
            onChange={(e) => setUploadId(e.target.value)}
            placeholder="my-lower-third"
            value={uploadId}
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field>
            <FieldLabel className="text-muted-foreground text-xs">
              manifest.json
            </FieldLabel>
            <Input
              accept=".json,application/json"
              className={CONFIG_COMPACT_INPUT_CLASS}
              disabled={uploading}
              onChange={(e) => setPendingManifest(e.target.files?.[0] ?? null)}
              type="file"
            />
          </Field>
          <Field>
            <FieldLabel className="text-muted-foreground text-xs">
              composition.html
            </FieldLabel>
            <Input
              accept=".html,text/html"
              className={CONFIG_COMPACT_INPUT_CLASS}
              disabled={uploading}
              onChange={(e) =>
                setPendingComposition(e.target.files?.[0] ?? null)
              }
              type="file"
            />
          </Field>
        </div>
        <Button
          disabled={uploading || !pendingManifest || !pendingComposition}
          onClick={() => {
            if (pendingManifest && pendingComposition) {
              void uploadTemplate(pendingManifest, pendingComposition).then(
                () => {
                  setPendingManifest(null);
                  setPendingComposition(null);
                }
              );
            }
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {uploading ? "Uploading…" : "Upload template"}
        </Button>
        {uploadError ? (
          <p className="text-destructive text-xs">{uploadError}</p>
        ) : null}
        <p className="text-[0.7rem] text-muted-foreground leading-snug">
          Saves to projects/{slug}/graphics/&lt;id&gt;/ (manifest +
          composition).
        </p>
      </div>
    </div>
  );
}

export function useGraphicTemplates(slug: string): {
  reloadTemplates: () => void;
  templates: GraphicTemplateOption[];
} {
  const [templates, setTemplates] = useState<GraphicTemplateOption[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const reloadTemplates = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);
  useEffect(() => {
    let alive = true;
    void fetch(`/api/projects/${encodeURIComponent(slug)}/graphics`)
      .then(async (res) => {
        if (!res.ok) {
          return [];
        }
        const data = (await res.json()) as {
          graphics?: GraphicTemplateOption[];
        };
        return data.graphics ?? [];
      })
      .then((list) => {
        if (alive) {
          setTemplates(list);
        }
      })
      .catch(() => {
        if (alive) {
          setTemplates([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [reloadKey, slug]);
  return { reloadTemplates, templates };
}

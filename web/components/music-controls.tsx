"use client";

import { useState } from "react";
import { ElasticSlider } from "@/components/elastic-slider";
import {
  CommitNumberInput,
  formatDotDecimal,
} from "@/components/slider-primitives";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Music, Trash2 } from "@/lib/icon";
import { firstToggleValue } from "@/lib/toggle-value";
import { cn } from "@/lib/utils";

/** Default span (seconds) for a bed placed at the playhead. */
export const DEFAULT_MUSIC_BED_SEC = 30;
const CONFIG_COMPACT_INPUT_CLASS =
  "h-7! rounded-md! px-2! py-1! text-[0.8rem]!";
const CONFIG_COMPACT_SELECT_TRIGGER_CLASS =
  "h-7! rounded-md! px-2! py-0! text-[0.8rem]!";

export interface MusicAssetOption {
  id: string;
  name: string;
}

export interface MusicPlacementView {
  assetId: string;
  endSample: number;
  fadeInSec: number;
  fadeOutSec: number;
  gain: number;
  id: string;
  mode: "trim" | "loop";
  srcInSample: number;
  startSample: number;
}

export interface MusicPlacementPatch {
  fadeInSec?: number;
  fadeOutSec?: number;
  fromSec?: number;
  gain?: number;
  mode?: "trim" | "loop";
  toSec?: number;
}

// One placement's editor. Gain drags update local state only and persist on
// release, so a drag is one save instead of dozens.
function MusicPlacementRow({
  m,
  name,
  onPatch,
  onRemove,
  sampleRate,
  bpm,
}: {
  m: MusicPlacementView;
  name: string;
  onPatch: (id: string, patch: MusicPlacementPatch) => void;
  onRemove: (id: string) => void;
  sampleRate: number;
  bpm?: number;
}) {
  const [gainDraft, setGainDraft] = useState<number | null>(null);
  const gain = gainDraft ?? m.gain;
  const fromSec = m.startSample / sampleRate;
  const toSec = m.endSample / sampleRate;
  return (
    <div className="flex flex-col gap-1.5" data-music-row>
      <div className="flex min-h-6 items-center gap-1.5 text-xs">
        <Music className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {fromSec.toFixed(1)}s–{toSec.toFixed(1)}s
          {bpm === undefined ? "" : ` · ${bpm} BPM`}
        </span>
      </div>
      <ElasticSlider
        data-music-gain
        formatValue={formatDotDecimal}
        label="Gain"
        max={2}
        min={0}
        onValueChange={setGainDraft}
        onValueCommit={(value) => {
          setGainDraft(null);
          onPatch(m.id, { gain: value });
        }}
        step={0.05}
        value={gain}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <Field>
          <FieldLabel className="text-muted-foreground text-xs">
            From (s)
          </FieldLabel>
          <CommitNumberInput
            className={CONFIG_COMPACT_INPUT_CLASS}
            min={0}
            onCommit={(n) => onPatch(m.id, { fromSec: n })}
            step={0.5}
            value={fromSec}
          />
        </Field>
        <Field>
          <FieldLabel className="text-muted-foreground text-xs">
            To (s)
          </FieldLabel>
          <CommitNumberInput
            className={CONFIG_COMPACT_INPUT_CLASS}
            min={0}
            onCommit={(n) => onPatch(m.id, { toSec: n })}
            step={0.5}
            value={toSec}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Field>
          <FieldLabel className="text-muted-foreground text-xs">
            Fade in (s)
          </FieldLabel>
          <CommitNumberInput
            className={CONFIG_COMPACT_INPUT_CLASS}
            max={10}
            min={0}
            onCommit={(n) => onPatch(m.id, { fadeInSec: n })}
            step={0.5}
            value={m.fadeInSec}
          />
        </Field>
        <Field>
          <FieldLabel className="text-muted-foreground text-xs">
            Fade out (s)
          </FieldLabel>
          <CommitNumberInput
            className={CONFIG_COMPACT_INPUT_CLASS}
            max={10}
            min={0}
            onCommit={(n) => onPatch(m.id, { fadeOutSec: n })}
            step={0.5}
            value={m.fadeOutSec}
          />
        </Field>
      </div>
      <ToggleGroup
        className="w-full"
        onValueChange={(value) => {
          const mode = firstToggleValue(value);
          if (mode === "trim" || mode === "loop") {
            onPatch(m.id, { mode });
          }
        }}
        size="sm"
        spacing={0}
        value={[m.mode]}
        variant="outline"
      >
        <ToggleGroupItem className="flex-1" value="trim">
          Trim
        </ToggleGroupItem>
        <ToggleGroupItem className="flex-1" value="loop">
          Loop
        </ToggleGroupItem>
      </ToggleGroup>
      <Button
        className="w-full"
        data-music-remove
        onClick={() => onRemove(m.id)}
        size="sm"
        variant="destructive"
      >
        <Trash2 data-icon="inline-start" /> Remove music
      </Button>
    </div>
  );
}

export interface MusicSectionControlsProps {
  assetName: (id: string) => string;
  assets: MusicAssetOption[];
  bpmByAssetId?: Record<string, { bpm: number; confidence: number }>;
  bpmDetectingAssetId?: string | null;
  chosenAssetId: string;
  onAdd: () => void;
  onChooseAsset: (id: string) => void;
  onDetectBpm?: (assetId: string) => void;
  onPatch: (id: string, patch: MusicPlacementPatch) => void;
  onRemove: (id: string) => void;
  placements: MusicPlacementView[];
  sampleRate: number;
}

// Presentational music placement controls for the Config panel, extracted from
// app.tsx so the markup is testable with renderToStaticMarkup (the
// export-options-form.tsx precedent). All state flows through props; the
// container translates patches into optimistic setProject + music-set saves.
export function MusicSectionControls({
  assetName,
  assets,
  bpmByAssetId = {},
  bpmDetectingAssetId = null,
  chosenAssetId,
  onAdd,
  onChooseAsset,
  onDetectBpm,
  onPatch,
  onRemove,
  placements,
  sampleRate,
}: MusicSectionControlsProps) {
  return (
    <div className="flex flex-col gap-2" data-music-section>
      {placements.length === 0 ? (
        <>
          <div className="flex gap-1.5">
            <Select
              onValueChange={(value) => {
                if (value) {
                  onChooseAsset(value);
                }
              }}
              value={chosenAssetId}
            >
              <SelectTrigger
                className={cn("flex-1", CONFIG_COMPACT_SELECT_TRIGGER_CLASS)}
                data-music-asset-select
                disabled={assets.length === 0}
                size="sm"
              >
                <SelectValue placeholder="No music" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              aria-label="Place music at playhead"
              data-music-add
              disabled={assets.length === 0 || !chosenAssetId}
              onClick={onAdd}
              size="sm"
              variant="secondary"
            >
              <Music data-icon="inline-start" /> Place at playhead
            </Button>
          </div>
          {chosenAssetId && onDetectBpm ? (
            <div className="flex items-center gap-1.5">
              <Button
                data-music-bpm-detect
                disabled={
                  !chosenAssetId || bpmDetectingAssetId === chosenAssetId
                }
                onClick={() => onDetectBpm(chosenAssetId)}
                size="sm"
                variant="outline"
              >
                {bpmDetectingAssetId === chosenAssetId
                  ? "Detecting BPM…"
                  : "Detect BPM"}
              </Button>
              {bpmByAssetId[chosenAssetId] ? (
                <span
                  className="text-muted-foreground text-xs tabular-nums"
                  data-music-bpm-result
                >
                  {bpmByAssetId[chosenAssetId].bpm} BPM (
                  {Math.round(bpmByAssetId[chosenAssetId].confidence * 100)}%
                  conf)
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs leading-snug">
            {assets.length === 0
              ? "Drop an audio file into the asset bin to add music."
              : `Places a ${DEFAULT_MUSIC_BED_SEC}s bed at the playhead. Trim, fade, and loop it here.`}
          </p>
        </>
      ) : (
        placements.map((m) => (
          <MusicPlacementRow
            bpm={bpmByAssetId[m.assetId]?.bpm}
            key={m.id}
            m={m}
            name={assetName(m.assetId)}
            onPatch={onPatch}
            onRemove={onRemove}
            sampleRate={sampleRate}
          />
        ))
      )}
    </div>
  );
}

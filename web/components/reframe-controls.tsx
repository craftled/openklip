"use client";

import type {
  CropMode,
  ExportAspect,
  ExportCrop,
  ExportSettings,
} from "@engine/edl";
import { useState } from "react";
import {
  CommitNumberInput,
  firstSliderValue,
  THIN_SLIDER,
} from "@/components/slider-primitives";
import { Field, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";

function ControlRow({
  disabled = false,
  label,
  max,
  min,
  onCommit,
  step,
  value,
}: {
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  onCommit: (n: number) => void;
  step: number;
  value: number;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  return (
    <Field className="grid h-7 grid-cols-[5.5rem_1fr_4rem] items-center gap-2.5">
      <FieldLabel className="text-muted-foreground text-xs">{label}</FieldLabel>
      <Slider
        className={THIN_SLIDER}
        disabled={disabled}
        max={max}
        min={min}
        onValueChange={(v) => setDraft(firstSliderValue(v))}
        onValueCommitted={(v) => {
          setDraft(null);
          onCommit(firstSliderValue(v));
        }}
        step={step}
        value={[draft ?? value]}
      />
      <CommitNumberInput
        disabled={disabled}
        max={max}
        min={min}
        onCommit={onCommit}
        step={step}
        value={draft ?? value}
      />
    </Field>
  );
}

export interface ExportPatch {
  aspect?: ExportAspect;
  crop?: Partial<ExportCrop>;
  cropMode?: CropMode;
}

export interface ReframeControlsProps {
  applying?: boolean;
  applyingVision?: boolean;
  exportSettings: ExportSettings;
  hasSceneLog?: boolean;
  onPatchExport: (patch: ExportPatch) => void;
  onRunVisionFocus?: () => void | Promise<void>;
  visionFocusAvailable?: boolean;
}

export function ReframeControls({
  applying = false,
  applyingVision = false,
  exportSettings,
  hasSceneLog = false,
  onPatchExport,
  onRunVisionFocus,
  visionFocusAvailable = false,
}: ReframeControlsProps) {
  const crop = exportSettings.crop;
  const cropMode = exportSettings.cropMode ?? "manual";
  const isScene = cropMode === "scene";
  const isVision = cropMode === "vision";
  const manualDisabled = applying || isScene || isVision;

  return (
    <div className="flex flex-col gap-2" data-reframe-section>
      {visionFocusAvailable && onRunVisionFocus && (
        <div className="flex items-center gap-2 pb-1">
          <button
            className="rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-muted disabled:opacity-50"
            disabled={applying || applyingVision}
            onClick={() => onRunVisionFocus()}
            type="button"
          >
            {applyingVision ? "Running Vision…" : "Vision focus"}
          </button>
          <span className="text-muted-foreground text-xs">
            Face/saliency detection on ingest frames (macOS).
          </span>
        </div>
      )}
      {hasSceneLog && (
        <div className="flex items-center gap-2 pb-1">
          <span className="text-muted-foreground text-xs">Crop mode</span>
          <div className="flex overflow-hidden rounded-md border text-xs">
            <button
              className={`px-2 py-0.5 transition-colors ${isScene ? "text-muted-foreground hover:text-foreground" : "bg-foreground text-background"}`}
              disabled={applying}
              onClick={() => onPatchExport({ cropMode: "manual" })}
              type="button"
            >
              Manual
            </button>
            <button
              className={`px-2 py-0.5 transition-colors ${isScene ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              disabled={applying}
              onClick={() => onPatchExport({ cropMode: "scene" })}
              type="button"
            >
              Scene
            </button>
          </div>
        </div>
      )}
      <ControlRow
        disabled={manualDisabled}
        label="Focus X"
        max={1}
        min={0}
        onCommit={(n) => onPatchExport({ crop: { focusX: n } })}
        step={0.01}
        value={crop.focusX}
      />
      <ControlRow
        disabled={manualDisabled}
        label="Focus Y"
        max={1}
        min={0}
        onCommit={(n) => onPatchExport({ crop: { focusY: n } })}
        step={0.01}
        value={crop.focusY}
      />
      <ControlRow
        disabled={applying}
        label="Zoom"
        max={3}
        min={1}
        onCommit={(n) => onPatchExport({ crop: { scale: n } })}
        step={0.05}
        value={crop.scale}
      />
      <p className="text-muted-foreground text-xs leading-relaxed">
        Pan and zoom the source frame before export. Preview uses the same crop
        when a fixed aspect is active.
        {isScene && " Crop focus is derived from scene analysis."}
        {isVision && " Crop focus is derived from macOS Vision face detection."}
      </p>
    </div>
  );
}

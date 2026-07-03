"use client";

import type { ExportAspect, ExportCrop, ExportSettings } from "@engine/edl";
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
}

export interface ReframeControlsProps {
  applying?: boolean;
  exportSettings: ExportSettings;
  onPatchExport: (patch: ExportPatch) => void;
}

export function ReframeControls({
  applying = false,
  exportSettings,
  onPatchExport,
}: ReframeControlsProps) {
  const crop = exportSettings.crop;
  return (
    <div className="flex flex-col gap-2" data-reframe-section>
      <ControlRow
        disabled={applying}
        label="Focus X"
        max={1}
        min={0}
        onCommit={(n) => onPatchExport({ crop: { focusX: n } })}
        step={0.01}
        value={crop.focusX}
      />
      <ControlRow
        disabled={applying}
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
      </p>
    </div>
  );
}

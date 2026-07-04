"use client";

import type {
  CropMode,
  ExportAspect,
  ExportCrop,
  ExportLayout,
  ExportSettings,
  SplitVertical,
} from "@engine/edl";
import { useState } from "react";
import { ElasticSlider } from "@/components/elastic-slider";
import { formatDotDecimal } from "@/components/slider-primitives";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { firstToggleValue } from "@/lib/toggle-value";

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
    <ElasticSlider
      disabled={disabled}
      formatValue={formatDotDecimal}
      label={label}
      max={max}
      min={min}
      onValueChange={setDraft}
      onValueCommit={(nextValue) => {
        setDraft(null);
        onCommit(nextValue);
      }}
      step={step}
      value={draft ?? value}
    />
  );
}

export interface ExportPatch {
  aspect?: ExportAspect;
  crop?: Partial<ExportCrop>;
  cropMode?: CropMode;
  layout?: ExportLayout;
  splitVertical?: Partial<SplitVertical>;
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
  const isPortrait = exportSettings.aspect === "9:16";
  const layout = exportSettings.layout ?? "fill";
  const splitVertical = exportSettings.splitVertical ?? {
    ratio: 0.45,
    speakerPosition: "top" as const,
  };
  const isSplit = layout === "split-vertical";
  const isScene = cropMode === "scene";
  const isVision = cropMode === "vision";
  const manualDisabled = applying || isScene || isVision;

  return (
    <div className="flex flex-col gap-1.5" data-reframe-section>
      {visionFocusAvailable && onRunVisionFocus && (
        <div className="flex items-center gap-1.5 pb-0.5">
          <Button
            disabled={applying || applyingVision}
            onClick={() => onRunVisionFocus()}
            size="sm"
            type="button"
            variant="outline"
          >
            {applyingVision ? "Running Vision…" : "Vision focus"}
          </Button>
          <span className="text-muted-foreground text-xs">
            Face/saliency detection on ingest frames (macOS).
          </span>
        </div>
      )}
      {hasSceneLog && (
        <div className="flex min-h-7 items-center gap-1.5 pb-0.5">
          <span className="text-muted-foreground text-xs">Crop mode</span>
          <ToggleGroup
            disabled={applying}
            onValueChange={(value) => {
              const mode = firstToggleValue(value);
              if (mode === "manual" || mode === "scene") {
                onPatchExport({ cropMode: mode });
              }
            }}
            size="sm"
            spacing={0}
            value={[cropMode === "scene" ? "scene" : "manual"]}
            variant="outline"
          >
            <ToggleGroupItem value="manual">Manual</ToggleGroupItem>
            <ToggleGroupItem value="scene">Scene</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      {isPortrait && (
        <div className="flex flex-col gap-1.5 pb-0.5">
          <div className="flex min-h-7 items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Layout</span>
            <ToggleGroup
              disabled={applying}
              onValueChange={(value) => {
                const next = firstToggleValue(value);
                if (next === "fill") {
                  onPatchExport({ layout: "fill" });
                } else if (next === "split-vertical") {
                  onPatchExport({
                    layout: "split-vertical",
                    splitVertical,
                  });
                }
              }}
              size="sm"
              spacing={0}
              value={[layout]}
              variant="outline"
            >
              <ToggleGroupItem value="fill">Fill</ToggleGroupItem>
              <ToggleGroupItem value="split-vertical">
                Split vertical
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {isSplit && (
            <>
              <ControlRow
                disabled={applying}
                label="Split ratio"
                max={0.75}
                min={0.25}
                onCommit={(n) => onPatchExport({ splitVertical: { ratio: n } })}
                step={0.01}
                value={splitVertical.ratio}
              />
              <div className="flex min-h-7 items-center gap-1.5">
                <span className="text-muted-foreground text-xs">Position</span>
                <ToggleGroup
                  disabled={applying}
                  onValueChange={(value) => {
                    const position = firstToggleValue(value);
                    if (position === "top" || position === "bottom") {
                      onPatchExport({
                        splitVertical: { speakerPosition: position },
                      });
                    }
                  }}
                  size="sm"
                  spacing={0}
                  value={[splitVertical.speakerPosition]}
                  variant="outline"
                >
                  <ToggleGroupItem value="top">Top</ToggleGroupItem>
                  <ToggleGroupItem value="bottom">Bottom</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </>
          )}
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
      <p className="text-muted-foreground text-xs leading-snug">
        Pan and zoom the source frame before export. Preview uses the same crop
        when a fixed aspect is active.
        {isScene && " Crop focus is derived from scene analysis."}
        {isVision && " Crop focus is derived from macOS Vision face detection."}
      </p>
    </div>
  );
}

"use client";

import type { ExportAspect } from "@engine/edl";
import { resolveExportDimensions } from "@engine/export-aspect";
import {
  type ExportPlatformId,
  exportPlatform,
} from "@engine/export-platforms";
import type { ExportCompression, ExportFormat } from "@engine/exporter";
import { clampGifDimensions, GIF_MAX_FPS } from "@engine/gif-export";
import { type ReactElement, type ReactNode, useMemo, useState } from "react";
import {
  COMPRESSION_COPY,
  type ExportDestination,
  ExportOptionsForm,
  type ExportPlatformSelection,
  type ExportResolution,
  GIF_MAX_WIDTH_CEILING_PX,
  GIF_MAX_WIDTH_DEFAULT_PX,
  platformFormValues,
} from "@/components/export-options-form";

export type {
  ExportDestination,
  ExportPlatformSelection,
  ExportResolution,
} from "@/components/export-options-form";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Download } from "@/lib/icon";
import { cn } from "@/lib/utils";

export interface ExportDialogOptions {
  compression: ExportCompression;
  /** Client-only: whether web/app.tsx should also copy the output path to
   * the clipboard after a successful export. Never reaches the server. */
  destination: ExportDestination;
  format: ExportFormat;
  /** "source" keeps the source frame rate; a number requests that rate. */
  frameRate: number | "source";
  /** GIF-only override for GIF_MAX_WIDTH_PX (960); undefined uses the
   * default. Never sent for mp4 (see resolveGifMaxWidthSubmission). */
  gifMaxWidth?: number;
  maxHeight?: number;
  /** undefined when Manual is selected; otherwise the active preset id. */
  platform?: ExportPlatformId;
  resolution: ExportResolution;
}

/**
 * Pure resolution of what gifMaxWidth to submit, extracted so the "what
 * counts as noise" decision is testable without mounting the dialog (same
 * rationale as buildExportOptions below). Resolves to undefined for a
 * non-GIF format, empty input, or a value that matches the
 * GIF_MAX_WIDTH_DEFAULT_PX (960) default (so the request doesn't carry a
 * value identical to what omitting it would already produce); otherwise the
 * value is clamped into [1, GIF_MAX_WIDTH_CEILING_PX] and returned. Zero and
 * negative input clamp to 1 rather than being treated as empty: a user who
 * explicitly typed "0" gets a deterministic in-range value, not a silent
 * revert to the untouched default. This clamp is UX polish only; the real
 * ceiling is enforced server-side in clampGifDimensions (src/exporter.ts).
 */
export function resolveGifMaxWidthSubmission(
  rawValue: string | number | undefined,
  format: ExportFormat
): number | undefined {
  if (format !== "gif") {
    return;
  }
  if (rawValue === undefined || rawValue === "") {
    return;
  }
  const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return;
  }
  const clamped = Math.min(
    Math.max(Math.round(parsed), 1),
    GIF_MAX_WIDTH_CEILING_PX
  );
  return clamped === GIF_MAX_WIDTH_DEFAULT_PX ? undefined : clamped;
}

/**
 * Pure assembly of the payload handed to onExport, extracted so the
 * format/destination submission logic is testable without mounting the
 * portal-rendered dialog (same rationale as effectiveMaxHeight above).
 */
export function buildExportOptions(state: {
  compression: ExportCompression;
  destination: ExportDestination;
  format: ExportFormat;
  /** "source" or a stringified FRAME_RATES entry. */
  frameRate: string;
  gifMaxWidth?: number;
  maxHeight?: number;
  platform: ExportPlatformSelection;
  resolution: ExportResolution;
}): ExportDialogOptions {
  return {
    compression: state.compression,
    destination: state.destination,
    format: state.format,
    frameRate:
      state.frameRate === "source" ? "source" : Number(state.frameRate),
    gifMaxWidth: resolveGifMaxWidthSubmission(state.gifMaxWidth, state.format),
    maxHeight: state.maxHeight,
    platform: state.platform === "manual" ? undefined : state.platform,
    resolution: state.resolution,
  };
}

interface ExportDialogProps {
  children: ReactNode;
  defaultResolution?: ExportResolution;
  disabled?: boolean;
  durationSec: number;
  /** Project-saved export aspect; used for Manual dimension preview. */
  exportAspect?: ExportAspect;
  onExport: (options: ExportDialogOptions) => void | Promise<void>;
  sourceFps: number;
  sourceHeight: number;
  sourceWidth: number;
}

/**
 * Dimensions for a resolved maxHeight (undefined means source-native): the
 * one shared cap-and-scale math so displayed dims, estimates, and the
 * submitted export request can never independently disagree about what a
 * given maxHeight actually renders. Never upscales past the source.
 */
export function outputDimensionsForMaxHeight(
  maxHeight: number | undefined,
  sourceWidth: number,
  sourceHeight: number,
  aspect: ExportAspect = "source"
): { width: number; height: number } {
  const { outW, outH } = resolveExportDimensions({
    aspect,
    maxHeight,
    sourceHeight,
    sourceWidth,
  });
  return { width: outW, height: outH };
}

function maxHeightForResolution(
  resolution: ExportResolution
): number | undefined {
  if (resolution === "720") {
    return 720;
  }
  if (resolution === "1080") {
    return 1080;
  }
  return;
}

/**
 * The one true maxHeight for the dialog's current platform + source
 * combination. The "4k" resolution bucket is ambiguous on its own: for
 * Manual it means source-native (no cap, undefined); for an active platform
 * whose own ceiling maps to that bucket (only youtube-4k today, 2160) it
 * means that platform's REAL numeric ceiling, capped at source so it never
 * claims an upscale. An explicit 720/1080 pick always wins regardless of
 * platform (the module-level explicit-wins convention), since that is an
 * independent user choice made after the platform filled the controls.
 * Every displayed number (dims, estimates) and the submitted maxHeight must
 * derive from this single value so the dialog can never show one thing and
 * export another.
 */
export function effectiveMaxHeight(
  platform: ExportPlatformSelection,
  resolution: ExportResolution,
  sourceHeight: number
): number | undefined {
  if (resolution !== "4k") {
    return maxHeightForResolution(resolution);
  }
  if (platform === "manual") {
    return;
  }
  return Math.min(sourceHeight, exportPlatform(platform).maxHeight);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)}GB`;
  }
  if (bytes >= 1_000_000) {
    return `${Math.round(bytes / 1_000_000)}MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1000))}KB`;
}

function formatDurationEstimate(sec: number): string {
  if (sec < 60) {
    return `${Math.max(1, Math.round(sec))} seconds`;
  }
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return rem > 0 ? `${min}m ${rem}s` : `${min} minutes`;
}

export function estimateExportOutput(input: {
  compression: ExportCompression;
  durationSec: number;
  dims: { width: number; height: number };
  format: ExportFormat;
  gifMaxWidth?: number;
  sourceFps: number;
  sourceHeight: number;
  sourceWidth: number;
}): { exportTimeSec: number; note?: string; outputBytes: number } {
  const compressionMeta = COMPRESSION_COPY[input.compression];
  const pixelScale =
    (input.dims.width * input.dims.height) /
    (input.sourceWidth * input.sourceHeight);

  if (input.format === "gif") {
    const gifDims = clampGifDimensions({
      width: input.dims.width,
      height: input.dims.height,
      fps: Math.min(Math.round(input.sourceFps), GIF_MAX_FPS),
      maxWidth: input.gifMaxWidth,
    });
    const gifPixelScale =
      (gifDims.width * gifDims.height) /
      (input.sourceWidth * input.sourceHeight);
    const frameFactor = gifDims.fps / Math.max(1, input.sourceFps);
    return {
      exportTimeSec: Math.max(
        3,
        input.durationSec * gifPixelScale * frameFactor * 2.4
      ),
      outputBytes:
        input.durationSec * gifDims.fps * gifDims.width * gifDims.height * 0.08,
      note: "GIF estimate includes palette pass; actual size varies with motion.",
    };
  }

  return {
    exportTimeSec: Math.max(
      3,
      input.durationSec * pixelScale * compressionMeta.speedFactor * 0.9
    ),
    outputBytes:
      input.durationSec * compressionMeta.mbps * 1_000_000 * 0.125 * pixelScale,
  };
}

export function ExportDialog({
  children,
  defaultResolution,
  disabled,
  durationSec,
  exportAspect = "source",
  onExport,
  sourceFps,
  sourceHeight,
  sourceWidth,
}: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState<ExportResolution>(
    () => defaultResolution ?? (sourceHeight > 1080 ? "1080" : "4k")
  );
  const [compression, setCompression] = useState<ExportCompression>("social");
  // "source" or a stringified frame rate; mapped to number | "source" on export.
  const [frameRate, setFrameRate] = useState<string>("source");
  const [platform, setPlatform] = useState<ExportPlatformSelection>("manual");
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [destination, setDestination] = useState<ExportDestination>("file");
  // undefined means "use the GIF_MAX_WIDTH_DEFAULT_PX (960) default"; the
  // form shows 960 as the fallback display value until the user commits an
  // explicit override (see ExportOptionsForm's gifMaxWidth prop).
  const [gifMaxWidth, setGifMaxWidth] = useState<number | undefined>(undefined);

  // Picking a platform chip sets the compression/fps/resolution controls to
  // the preset's defaults; the controls stay independently editable after
  // that (explicit-wins at export time makes double-specifying safe), so
  // there is never a submitted value the visible controls do not also show.
  // The resolution control's "4k" bucket is the one exception that needs a
  // second, platform-aware lookup (effectiveMaxHeight): Manual+4k means
  // source-native, but an active platform whose ceiling maps to that same
  // bucket (youtube-4k, 2160) means its real numeric cap, not "whatever the
  // source is." effectiveMaxHeight resolves that ambiguity once so dims,
  // estimates, and the submitted maxHeight all agree with what actually
  // renders.
  const handlePlatformChange = (value: ExportPlatformSelection) => {
    setPlatform(value);
    if (value === "manual") {
      return;
    }
    const values = platformFormValues(exportPlatform(value));
    setCompression(values.compression);
    setFrameRate(values.fpsValue);
    setResolution(values.resolution);
  };

  const activeMaxHeight = useMemo(
    () => effectiveMaxHeight(platform, resolution, sourceHeight),
    [platform, resolution, sourceHeight]
  );

  const activeAspect = useMemo((): ExportAspect => {
    if (platform === "manual") {
      return exportAspect;
    }
    return exportPlatform(platform).aspect ?? exportAspect;
  }, [exportAspect, platform]);

  const dims = useMemo(
    () =>
      outputDimensionsForMaxHeight(
        activeMaxHeight,
        sourceWidth,
        sourceHeight,
        activeAspect
      ),
    [activeAspect, activeMaxHeight, sourceHeight, sourceWidth]
  );

  const estimate = useMemo(
    () =>
      estimateExportOutput({
        compression,
        durationSec,
        dims,
        format,
        gifMaxWidth: resolveGifMaxWidthSubmission(gifMaxWidth, format),
        sourceFps,
        sourceHeight,
        sourceWidth,
      }),
    [
      compression,
      dims,
      durationSec,
      format,
      gifMaxWidth,
      sourceFps,
      sourceHeight,
      sourceWidth,
    ]
  );

  const handleExport = async () => {
    setOpen(false);
    await onExport(
      buildExportOptions({
        compression,
        destination,
        format,
        frameRate,
        gifMaxWidth,
        maxHeight: activeMaxHeight,
        platform,
        resolution,
      })
    );
  };
  const handleCancel = () => setOpen(false);

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        disabled={disabled}
        render={children as ReactElement}
      />
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-5 overflow-hidden sm:max-w-2xl">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Export video</AlertDialogTitle>
          <AlertDialogDescription>
            Render the current cut to a file. Settings apply to this export
            only.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="-mx-1 min-h-0 overflow-y-auto px-1">
          <ExportOptionsForm
            compression={compression}
            destination={destination}
            dims={dims}
            format={format}
            frameRate={frameRate}
            gifMaxWidth={gifMaxWidth}
            onCompressionChange={setCompression}
            onDestinationChange={setDestination}
            onFormatChange={setFormat}
            onFrameRateChange={setFrameRate}
            onGifMaxWidthChange={setGifMaxWidth}
            onPlatformChange={handlePlatformChange}
            onResolutionChange={setResolution}
            platform={platform}
            resolution={resolution}
            sourceFps={sourceFps}
          />
        </div>

        <AlertDialogFooter className="items-end gap-3 sm:justify-between">
          <p className="text-muted-foreground text-xs sm:max-w-[55%] sm:text-left">
            Estimation: Export time{" "}
            {formatDurationEstimate(estimate.exportTimeSec)}. Output size{" "}
            {formatBytes(estimate.outputBytes)}.
            {estimate.note ? ` ${estimate.note}` : ""}
          </p>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button onClick={handleCancel} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className={cn("gap-2")}
              data-testid="export-confirm"
              onClick={handleExport}
            >
              <Download data-icon="inline-start" />
              Export to file…
              <Kbd className="bg-primary-foreground/15 text-primary-foreground">
                ↵
              </Kbd>
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

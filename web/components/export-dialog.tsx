"use client";

import type { ExportAspect } from "@engine/edl";
import { resolveExportDimensions } from "@engine/export-aspect";
import {
  type ExportPlatformId,
  exportPlatform,
} from "@engine/export-platforms";
import type { ExportCompression } from "@engine/exporter";
import { type ReactElement, type ReactNode, useMemo, useState } from "react";
import {
  COMPRESSION_COPY,
  type ExportDestination,
  ExportOptionsForm,
  type ExportPlatformSelection,
  type ExportResolution,
  platformFormValues,
} from "@/components/export-options-form";

export type {
  ExportDestination,
  ExportPlatformSelection,
  ExportResolution,
} from "@/components/export-options-form";

import {
  AlertDialog,
  AlertDialogCancel,
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
  destination: ExportDestination;
  /** "source" keeps the source frame rate; a number requests that rate. */
  frameRate: number | "source";
  maxHeight?: number;
  /** undefined when Manual is selected; otherwise the active preset id. */
  platform?: ExportPlatformId;
  resolution: ExportResolution;
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
  const destination: ExportDestination = "file";

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

  const compressionMeta = COMPRESSION_COPY[compression];
  const pixelScale = (dims.width * dims.height) / (sourceWidth * sourceHeight);
  const exportTimeSec = Math.max(
    3,
    durationSec * pixelScale * compressionMeta.speedFactor * 0.9
  );
  const outputBytes =
    durationSec * compressionMeta.mbps * 1_000_000 * 0.125 * pixelScale;

  const handleExport = async () => {
    setOpen(false);
    await onExport({
      compression,
      destination,
      frameRate: frameRate === "source" ? "source" : Number(frameRate),
      maxHeight: activeMaxHeight,
      platform: platform === "manual" ? undefined : platform,
      resolution,
    });
  };

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        disabled={disabled}
        render={children as ReactElement}
      />
      <AlertDialogContent className="gap-5 sm:max-w-2xl">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Export video</AlertDialogTitle>
          <AlertDialogDescription>
            Render the current cut to a file. Settings apply to this export
            only.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ExportOptionsForm
          compression={compression}
          destination={destination}
          dims={dims}
          frameRate={frameRate}
          onCompressionChange={setCompression}
          onFrameRateChange={setFrameRate}
          onPlatformChange={handlePlatformChange}
          onResolutionChange={setResolution}
          platform={platform}
          resolution={resolution}
          sourceFps={sourceFps}
        />

        <AlertDialogFooter className="items-end gap-3 sm:justify-between">
          <p className="text-muted-foreground text-xs sm:max-w-[55%] sm:text-left">
            Estimation: Export time {formatDurationEstimate(exportTimeSec)}.
            Output size {formatBytes(outputBytes)}.
          </p>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              className={cn("gap-2")}
              disabled={destination !== "file"}
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

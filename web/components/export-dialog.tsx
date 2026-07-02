"use client";

import type { ExportCompression } from "@engine/exporter";
import { type ReactElement, type ReactNode, useMemo, useState } from "react";
import {
  COMPRESSION_COPY,
  type ExportDestination,
  ExportOptionsForm,
  type ExportResolution,
} from "@/components/export-options-form";

export type {
  ExportDestination,
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
  resolution: ExportResolution;
}

interface ExportDialogProps {
  children: ReactNode;
  defaultResolution?: ExportResolution;
  disabled?: boolean;
  durationSec: number;
  onExport: (options: ExportDialogOptions) => void | Promise<void>;
  sourceFps: number;
  sourceHeight: number;
  sourceWidth: number;
}

function outputDimensions(
  resolution: ExportResolution,
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number } {
  const cap =
    resolution === "720" ? 720 : resolution === "1080" ? 1080 : sourceHeight;
  const height = Math.min(sourceHeight, cap);
  const width = Math.round((sourceWidth * height) / sourceHeight / 2) * 2;
  return { width, height };
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
  const destination: ExportDestination = "file";

  const dims = useMemo(
    () => outputDimensions(resolution, sourceWidth, sourceHeight),
    [resolution, sourceHeight, sourceWidth]
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
      maxHeight: maxHeightForResolution(resolution),
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
          onResolutionChange={setResolution}
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

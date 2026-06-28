"use client";

import { type ComponentType, type ReactNode, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Aperture,
  Copy,
  Download,
  Film,
  Scan,
  Spline,
  Upload,
  Video,
} from "@/lib/icon";
import { cn } from "@/lib/utils";

export type ExportResolution = "720" | "1080" | "4k";
export type ExportCompression = "studio" | "social" | "web" | "web-low";
export type ExportDestination = "file" | "clipboard";

export interface ExportDialogOptions {
  compression: ExportCompression;
  destination: ExportDestination;
  frameRate: number;
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

const COMPRESSION_COPY: Record<
  ExportCompression,
  { label: string; description: string; mbps: number; speedFactor: number }
> = {
  studio: {
    label: "Studio",
    description:
      "Highest quality for archival or further editing. Larger files and slower encodes.",
    mbps: 8,
    speedFactor: 1.35,
  },
  social: {
    label: "Social Media",
    description:
      "Good for sharing on social media. Compression is noticeable on close inspection. Platforms may recompress further. Quality does not impact export speed.",
    mbps: 4,
    speedFactor: 1,
  },
  web: {
    label: "Web",
    description:
      "Balanced size for web playback and embeds. Smaller files with visible compression on detail.",
    mbps: 2.5,
    speedFactor: 0.85,
  },
  "web-low": {
    label: "Web (Low)",
    description:
      "Smallest files for quick previews or slow connections. Soft detail and more visible artifacts.",
    mbps: 1.2,
    speedFactor: 0.7,
  },
};

const FRAME_RATES = [24, 25, 30, 48, 60] as const;

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

function ExportOptionLabel({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 font-medium text-sm">
      <Icon className="size-4 text-tertiary" />
      {label}
    </div>
  );
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
  const compression: ExportCompression = "social";
  const frameRate = String(Math.round(sourceFps));
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
      frameRate: Number(frameRate),
      maxHeight: maxHeightForResolution(resolution),
      resolution,
    });
  };

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild disabled={disabled}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent className="gap-5 sm:max-w-2xl">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Export video</AlertDialogTitle>
          <AlertDialogDescription>
            Render the current cut to a file. Settings apply to this export
            only.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <ExportOptionLabel icon={Video} label="Format" />
            <ToggleGroup
              className="w-full"
              disabled
              type="single"
              value="mp4"
              variant="outline"
            >
              <ToggleGroupItem className="flex-1" value="mp4">
                MP4
              </ToggleGroupItem>
              <ToggleGroupItem className="flex-1 opacity-50" value="gif">
                GIF
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="opacity-60">
            <ExportOptionLabel icon={Aperture} label="Frame rate" />
            <Select disabled value={frameRate}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FRAME_RATES.map((fps) => (
                  <SelectItem key={fps} value={String(fps)}>
                    {fps} FPS
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-caption text-tertiary">
              Exports at source frame rate. Custom rates coming soon.
            </p>
          </div>

          <div>
            <ExportOptionLabel icon={Scan} label="Resolution" />
            <ToggleGroup
              className="w-full"
              onValueChange={(v) => {
                if (v) {
                  setResolution(v as ExportResolution);
                }
              }}
              type="single"
              value={resolution}
              variant="outline"
            >
              <ToggleGroupItem className="flex-1" value="720">
                720p
              </ToggleGroupItem>
              <ToggleGroupItem className="flex-1" value="1080">
                1080p
              </ToggleGroupItem>
              <ToggleGroupItem className="flex-1" value="4k">
                4K
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="mt-1.5 text-caption text-tertiary tabular-nums">
              {dims.width}px × {dims.height}px
            </p>
          </div>

          <div className="opacity-60">
            <ExportOptionLabel icon={Spline} label="Compression" />
            <ToggleGroup
              className="w-full flex-wrap"
              disabled
              type="single"
              value={compression}
              variant="outline"
            >
              <ToggleGroupItem value="studio">Studio</ToggleGroupItem>
              <ToggleGroupItem value="social">Social Media</ToggleGroupItem>
              <ToggleGroupItem value="web">Web</ToggleGroupItem>
              <ToggleGroupItem value="web-low">Web (Low)</ToggleGroupItem>
            </ToggleGroup>
            <p className="mt-2 text-caption text-tertiary leading-relaxed">
              Compression presets coming soon. Exports use the default encoder
              settings.
            </p>
          </div>
        </div>

        <div className="opacity-60">
          <ExportOptionLabel icon={Film} label="Export to" />
          <ToggleGroup
            className="w-full sm:max-w-xs"
            disabled
            type="single"
            value={destination}
            variant="outline"
          >
            <ToggleGroupItem className="flex-1 gap-2" value="file">
              <Upload className="size-4" />
              File
            </ToggleGroupItem>
            <ToggleGroupItem
              className="flex-1 gap-2 opacity-50"
              disabled
              value="clipboard"
            >
              <Copy className="size-4" />
              Clipboard
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <AlertDialogFooter className="items-end gap-3 sm:justify-between">
          <p className="text-caption text-tertiary sm:max-w-[55%] sm:text-left">
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
              <Download />
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

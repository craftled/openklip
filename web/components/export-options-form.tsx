"use client";

import type {
  ExportPlatformDef,
  ExportPlatformId,
} from "@engine/export-platforms";
import { listExportPlatforms } from "@engine/export-platforms";
import type { ExportCompression } from "@engine/exporter";
import type { ComponentType } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  APP_ICON_CLASS,
  Aperture,
  Copy,
  Film,
  Scan,
  Spline,
  Upload,
  Video,
} from "@/lib/icon";
import { firstToggleValue } from "@/lib/toggle-value";

export type ExportResolution = "720" | "1080" | "4k";
export type ExportDestination = "file" | "clipboard";
/** "manual" keeps the four controls independent; any other value is a
 * selected export platform preset that fills them via platformFormValues. */
export type ExportPlatformSelection = ExportPlatformId | "manual";

export const COMPRESSION_COPY: Record<
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

export const FRAME_RATES = [24, 25, 30, 48, 60] as const;

/**
 * Pure mapping from an export platform's preset defaults to the concrete
 * values the form's own controls already speak (fps-select value and
 * resolution-toggle value), so a platform pick sets the visible controls
 * instead of hiding a second, silent set of numbers behind a platform id.
 */
export function platformFormValues(def: ExportPlatformDef): {
  compression: ExportCompression;
  fpsValue: string;
  resolution: ExportResolution;
} {
  return {
    compression: def.compression,
    fpsValue: def.fps === undefined ? "source" : String(def.fps),
    resolution:
      def.maxHeight <= 720 ? "720" : def.maxHeight <= 1080 ? "1080" : "4k",
  };
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
      <Icon className={APP_ICON_CLASS} />
      {label}
    </div>
  );
}

// Presentational export settings, extracted from ExportDialog so the option
// markup is testable with renderToStaticMarkup (the dialog itself only mounts
// its content in a portal once opened). Format and destination stay disabled;
// GIF/clipboard/presets are out of scope for now.
export function ExportOptionsForm({
  compression,
  destination,
  dims,
  frameRate,
  onCompressionChange,
  onFrameRateChange,
  onPlatformChange,
  onResolutionChange,
  platform,
  resolution,
  sourceFps,
}: {
  compression: ExportCompression;
  destination: ExportDestination;
  dims: { width: number; height: number };
  /** "source" or a stringified FRAME_RATES entry. */
  frameRate: string;
  onCompressionChange: (value: ExportCompression) => void;
  onFrameRateChange: (value: string) => void;
  onPlatformChange: (value: ExportPlatformSelection) => void;
  onResolutionChange: (value: ExportResolution) => void;
  platform: ExportPlatformSelection;
  resolution: ExportResolution;
  sourceFps: number;
}) {
  const sourceRateLabel = `Source (${Math.round(sourceFps)} fps)`;
  const frameRateLabel = (value: string | null) =>
    !value || value === "source" ? sourceRateLabel : `${value} FPS`;
  const activePlatformDef =
    platform === "manual"
      ? undefined
      : listExportPlatforms().find((def) => def.id === platform);

  return (
    <>
      <div className="mb-5">
        <div className="mb-2 font-medium text-sm">Platform</div>
        <ToggleGroup
          className="w-full flex-wrap"
          onValueChange={(value) => {
            const platformValue = firstToggleValue(value);
            if (platformValue) {
              onPlatformChange(platformValue as ExportPlatformSelection);
            }
          }}
          value={[platform]}
          variant="outline"
        >
          <ToggleGroupItem value="manual">Manual</ToggleGroupItem>
          {listExportPlatforms().map((def) => (
            <ToggleGroupItem key={def.id} value={def.id}>
              {def.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {activePlatformDef?.targetLufs !== undefined && (
          <p className="mt-2 text-muted-foreground text-xs">
            Loudness normalized to {activePlatformDef.targetLufs} LUFS for this
            export.
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <ExportOptionLabel icon={Video} label="Format" />
          <ToggleGroup
            className="w-full"
            disabled
            value={["mp4"]}
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

        <div>
          <ExportOptionLabel icon={Aperture} label="Frame rate" />
          <Select
            onValueChange={(value) => {
              if (typeof value === "string") {
                onFrameRateChange(value);
              }
            }}
            value={frameRate}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{frameRateLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="source">{sourceRateLabel}</SelectItem>
                {FRAME_RATES.map((fps) => (
                  <SelectItem key={fps} value={String(fps)}>
                    {fps} FPS
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div>
          <ExportOptionLabel icon={Scan} label="Resolution" />
          <ToggleGroup
            className="w-full"
            onValueChange={(value) => {
              const resolutionValue = firstToggleValue(value);
              if (resolutionValue) {
                onResolutionChange(resolutionValue as ExportResolution);
              }
            }}
            value={[resolution]}
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
          <p className="mt-1.5 text-muted-foreground text-xs tabular-nums">
            {dims.width}px × {dims.height}px
          </p>
        </div>

        <div>
          <ExportOptionLabel icon={Spline} label="Compression" />
          <ToggleGroup
            className="w-full flex-wrap"
            onValueChange={(value) => {
              const compressionValue = firstToggleValue(value);
              if (compressionValue) {
                onCompressionChange(compressionValue as ExportCompression);
              }
            }}
            value={[compression]}
            variant="outline"
          >
            <ToggleGroupItem value="studio">Studio</ToggleGroupItem>
            <ToggleGroupItem value="social">Social Media</ToggleGroupItem>
            <ToggleGroupItem value="web">Web</ToggleGroupItem>
            <ToggleGroupItem value="web-low">Web (Low)</ToggleGroupItem>
          </ToggleGroup>
          <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
            {COMPRESSION_COPY[compression].description}
          </p>
        </div>
      </div>

      <div className="opacity-60">
        <ExportOptionLabel icon={Film} label="Export to" />
        <ToggleGroup
          className="w-full sm:max-w-xs"
          disabled
          value={[destination]}
          variant="outline"
        >
          <ToggleGroupItem className="flex-1 gap-2" value="file">
            <Upload data-icon="inline-start" />
            File
          </ToggleGroupItem>
          <ToggleGroupItem
            className="flex-1 gap-2 opacity-50"
            disabled
            value="clipboard"
          >
            <Copy data-icon="inline-start" />
            Clipboard
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </>
  );
}

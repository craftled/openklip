"use client";

import type { ExportAspect } from "@engine/edl";
import {
  ExportDialog,
  type ExportDialogOptions,
  type ExportResolution,
} from "@/components/export-dialog";
import { Download } from "@/lib/icon";
import { cn } from "@/lib/utils";

export interface EditorPreviewExportButtonProps {
  className?: string;
  defaultResolution: ExportResolution;
  disabled: boolean;
  durationSec: number;
  exportAspect: ExportAspect;
  exporting: boolean;
  exportLabel: string;
  onExport: (options: ExportDialogOptions) => void | Promise<void>;
  pendingSaves: number;
  sourceFps: number;
  sourceHeight: number;
  sourceWidth: number;
}

export function EditorPreviewExportButton({
  className,
  defaultResolution,
  disabled,
  durationSec,
  exportAspect,
  exportLabel,
  exporting,
  onExport,
  pendingSaves,
  sourceFps,
  sourceHeight,
  sourceWidth,
}: EditorPreviewExportButtonProps) {
  const busy = exporting || pendingSaves > 0;

  return (
    <ExportDialog
      defaultResolution={defaultResolution}
      disabled={disabled}
      durationSec={durationSec}
      exportAspect={exportAspect}
      onExport={onExport}
      sourceFps={sourceFps}
      sourceHeight={sourceHeight}
      sourceWidth={sourceWidth}
    >
      <button
        aria-busy={busy ? true : undefined}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] text-foreground/85 leading-snug transition-colors hover:bg-muted/60 hover:text-foreground active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        data-testid="export-open"
        disabled={disabled}
        type="button"
      >
        <Download className={cn("size-3 shrink-0", busy && "animate-pulse")} />
        <span>{exportLabel}</span>
      </button>
    </ExportDialog>
  );
}

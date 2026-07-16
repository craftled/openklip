"use client";

import type { ExportAspect } from "@engine/edl";
import type { SafeAreaPlatform } from "@engine/safe-areas";
import { EditorPreviewExportButton } from "@/components/editor/editor-preview-export-button";
import { EditorPreviewFormatMenu } from "@/components/editor/editor-preview-format-menu";
import type {
  ExportDialogOptions,
  ExportResolution,
} from "@/components/export-dialog";
import { MessageSquare, PanelLeft } from "@/lib/icon";
import type { Orientation } from "@/lib/preview-layout";
import { cn } from "@/lib/utils";

export interface EditorPreviewHeaderProps {
  className?: string;
  currentSec: number;
  cutCount: number;
  exportAspect: ExportAspect;
  exportDefaultResolution: ExportResolution;
  exportDisabled: boolean;
  exporting: boolean;
  exportLabel: string;
  fmtTime: (sec: number) => string;
  keptDurationSec: number;
  mobileChatOpen?: boolean;
  mobileConfigOpen?: boolean;
  onExport: (options: ExportDialogOptions) => void | Promise<void>;
  onOpenChat?: () => void;
  onOpenConfig?: () => void;
  onOrientationChange: (orientation: Orientation) => void;
  onSafeAreaGuideChange: (platform: SafeAreaPlatform) => void;
  orientation: Orientation;
  pendingSaves: number;
  projectName: string;
  safeAreaGuide: SafeAreaPlatform;
  sourceFps: number;
  sourceHeight: number;
  sourceWidth: number;
}

export function EditorPreviewHeader({
  className,
  currentSec,
  cutCount,
  exportAspect,
  exportDefaultResolution,
  exportDisabled,
  exportLabel,
  exporting,
  fmtTime,
  keptDurationSec,
  mobileChatOpen = false,
  mobileConfigOpen = false,
  onExport,
  onOpenChat,
  onOpenConfig,
  onOrientationChange,
  onSafeAreaGuideChange,
  orientation,
  pendingSaves,
  projectName,
  safeAreaGuide,
  sourceFps,
  sourceHeight,
  sourceWidth,
}: EditorPreviewHeaderProps) {
  const cutLabel = cutCount === 1 ? "1 cut" : `${cutCount} cuts`;

  return (
    <header
      className={cn(
        "flex items-center justify-between gap-6 px-0.5 pt-1 pb-0 text-[11px] text-muted-foreground",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <h1 className="truncate font-normal text-foreground/85 leading-snug">
          {projectName}
        </h1>
        <span
          className="hidden shrink-0 rounded-full bg-muted px-1 py-px text-[10px] text-muted-foreground leading-none sm:inline"
          title={`${cutCount} kept ${cutCount === 1 ? "range" : "ranges"}`}
        >
          {cutLabel}
        </span>
        <EditorPreviewFormatMenu
          onOrientationChange={onOrientationChange}
          onSafeAreaGuideChange={onSafeAreaGuideChange}
          orientation={orientation}
          safeAreaGuide={safeAreaGuide}
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onOpenConfig ? (
          <button
            aria-label="Open config"
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground active:scale-[0.96] xl:hidden",
              mobileConfigOpen && "bg-muted/60 text-foreground"
            )}
            onClick={onOpenConfig}
            title="Open config"
            type="button"
          >
            <PanelLeft className="size-3" />
          </button>
        ) : null}
        {onOpenChat ? (
          <button
            aria-label="Open chat"
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground active:scale-[0.96] xl:hidden",
              mobileChatOpen && "bg-muted/60 text-foreground"
            )}
            onClick={onOpenChat}
            title="Open chat"
            type="button"
          >
            <MessageSquare className="size-3" />
          </button>
        ) : null}
        <EditorPreviewExportButton
          defaultResolution={exportDefaultResolution}
          disabled={exportDisabled}
          durationSec={keptDurationSec}
          exportAspect={exportAspect}
          exporting={exporting}
          exportLabel={exportLabel}
          onExport={onExport}
          pendingSaves={pendingSaves}
          sourceFps={sourceFps}
          sourceHeight={sourceHeight}
          sourceWidth={sourceWidth}
        />
        <time
          className="text-muted-foreground/80 tabular-nums"
          dateTime={`PT${Math.max(0, currentSec)}S`}
          title={`${fmtTime(currentSec)} of ${fmtTime(keptDurationSec)}`}
        >
          {fmtTime(currentSec)}
          <span className="text-muted-foreground/55">
            {" / "}
            {fmtTime(keptDurationSec)}
          </span>
        </time>
      </div>
    </header>
  );
}

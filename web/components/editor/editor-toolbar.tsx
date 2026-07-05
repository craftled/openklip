"use client";

import type { ExportAspect } from "@engine/edl";
import {
  SAFE_AREA_PLATFORMS,
  type SafeAreaPlatform,
  safeAreaGuideLabel,
} from "@engine/safe-areas";
import { ActionStatusButton } from "@/components/action-status-button";
import {
  ExportDialog,
  type ExportDialogOptions,
  type ExportResolution,
} from "@/components/export-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useModShortcut } from "@/hooks/use-mod-shortcut";
import {
  Download,
  MessageSquare,
  Moon,
  PanelLeft,
  PanelRight,
  Sun,
} from "@/lib/icon";
import { ORIENTATION_LABEL, type Orientation } from "@/lib/preview-layout";
import type { ColorScheme } from "@/lib/theme-preferences";

export interface EditorToolbarProps {
  colorScheme: ColorScheme;
  configOpen: boolean;
  cutCount: number;
  exportAspect: ExportAspect;
  exportDefaultResolution: ExportResolution;
  exportDisabled: boolean;
  exporting: boolean;
  exportLabel: string;
  fmtTime: (sec: number) => string;
  fullDurationSec: number;
  keptDurationSec: number;
  mobileRightPanel: "chat" | "config" | null;
  onExport: (options: ExportDialogOptions) => void | Promise<void>;
  onOpenChat: () => void;
  onOpenConfig: () => void;
  onOrientationChange: (orientation: Orientation) => void;
  onSafeAreaGuideChange: (platform: SafeAreaPlatform) => void;
  onToggleColorScheme: () => void;
  onToggleConfig: () => void;
  orientation: Orientation;
  pendingSaves: number;
  safeAreaGuide: SafeAreaPlatform;
  showAgentSidebarTrigger: boolean;
  sourceFps: number;
  sourceHeight: number;
  sourceWidth: number;
  toggleAgentSidebar: () => void;
}

function AgentSidebarToolbarTrigger({ onToggle }: { onToggle: () => void }) {
  const shortcut = useModShortcut("b");
  const label = `Toggle agent sidebar (${shortcut})`;

  return (
    <Button
      aria-label={label}
      className="size-11 shrink-0 text-muted-foreground/75 hover:text-foreground sm:size-7"
      onClick={onToggle}
      size="icon-xs"
      title={label}
      variant="ghost"
    >
      <PanelLeft />
    </Button>
  );
}

export function EditorToolbar({
  colorScheme,
  configOpen,
  cutCount,
  exportAspect,
  exportDefaultResolution,
  exportDisabled,
  exportLabel,
  exporting,
  fmtTime,
  fullDurationSec,
  keptDurationSec,
  mobileRightPanel,
  onExport,
  onOpenChat,
  onOpenConfig,
  onOrientationChange,
  onSafeAreaGuideChange,
  onToggleColorScheme,
  onToggleConfig,
  orientation,
  pendingSaves,
  safeAreaGuide,
  showAgentSidebarTrigger,
  sourceFps,
  sourceHeight,
  sourceWidth,
  toggleAgentSidebar,
}: EditorToolbarProps) {
  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-border border-b px-3 py-2 sm:h-12 sm:flex-nowrap sm:py-0">
      {showAgentSidebarTrigger ? (
        <AgentSidebarToolbarTrigger onToggle={toggleAgentSidebar} />
      ) : null}
      {showAgentSidebarTrigger ? (
        <div className="h-4 w-px bg-foreground/10" />
      ) : null}
      <div className="min-w-0">
        <div className="font-medium text-sm">Editor</div>
        <div className="truncate text-muted-foreground text-xs">
          {cutCount} {cutCount === 1 ? "cut" : "cuts"} ·{" "}
          {fmtTime(keptDurationSec)} / {fmtTime(fullDurationSec)}
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <ExportDialog
          defaultResolution={exportDefaultResolution}
          disabled={exportDisabled}
          durationSec={keptDurationSec}
          exportAspect={exportAspect}
          onExport={onExport}
          sourceFps={sourceFps}
          sourceHeight={sourceHeight}
          sourceWidth={sourceWidth}
        >
          <ActionStatusButton
            busy={exporting || pendingSaves > 0}
            disabled={exportDisabled}
            icon={Download}
            label={exportLabel}
            size="sm"
            variant="default"
          />
        </ExportDialog>
        <ToggleGroup
          aria-label="Preview aspect ratio"
          onValueChange={(value) => {
            const nextOrientation = Array.isArray(value) ? value[0] : value;
            if (nextOrientation) {
              onOrientationChange(nextOrientation as Orientation);
            }
          }}
          size="sm"
          spacing={0}
          type="single"
          value={orientation}
          variant="outline"
        >
          {(["landscape", "portrait", "square"] as Orientation[]).map((o) => (
            <ToggleGroupItem
              aria-label={`Preview ${ORIENTATION_LABEL[o]}`}
              key={o}
              value={o}
            >
              {ORIENTATION_LABEL[o]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {orientation === "portrait" ? (
          <Select
            onValueChange={(value) => {
              if (value) {
                onSafeAreaGuideChange(value as SafeAreaPlatform);
              }
            }}
            value={safeAreaGuide}
          >
            <SelectTrigger
              aria-label="Safe area guides"
              className="h-11 w-[9.5rem] text-xs sm:h-8"
              size="sm"
            >
              <SelectValue placeholder="Safe areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SAFE_AREA_PLATFORMS.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {safeAreaGuideLabel(platform)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
        <Button
          aria-label="Toggle color scheme"
          onClick={onToggleColorScheme}
          size="icon-sm"
          variant="ghost"
        >
          {colorScheme === "dark" ? <Sun /> : <Moon />}
        </Button>
        <Button
          aria-label="Open chat"
          className="xl:hidden"
          onClick={onOpenChat}
          size="icon-sm"
          title="Open chat"
          variant={mobileRightPanel === "chat" ? "secondary" : "ghost"}
        >
          <MessageSquare />
        </Button>
        <Button
          aria-label="Open config"
          className="xl:hidden"
          onClick={onOpenConfig}
          size="icon-sm"
          title="Open config"
          variant={mobileRightPanel === "config" ? "secondary" : "ghost"}
        >
          <PanelRight />
        </Button>
        <Button
          aria-label="Toggle config"
          className="hidden xl:inline-flex"
          onClick={onToggleConfig}
          size="icon-sm"
          title="Toggle config"
          variant={configOpen ? "secondary" : "ghost"}
        >
          <PanelRight />
        </Button>
      </div>
    </div>
  );
}

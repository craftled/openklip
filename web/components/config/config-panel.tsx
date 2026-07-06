"use client";

import type { Project as EngineProject } from "@engine/edl";
import type { ComponentProps } from "react";
import {
  ConfigEditTab,
  type ConfigEditTabProps,
} from "@/components/config/config-edit-tab";
import { ConfigInspectorHeader } from "@/components/config/config-inspector-summary";
import {
  ConfigProjectTab,
  type ConfigProjectTabProps,
} from "@/components/config/config-project-tab";
import { ConfigTabBar } from "@/components/config/config-tab-bar";
import {
  LookTabPanel,
  type LookTabPanelProps,
} from "@/components/config/look-tab-panel";
import { EditorToolsControls } from "@/components/editor-tools-controls";
import { HistoryPanel } from "@/components/history-panel";
import { PlaybackLoopControls } from "@/components/playback-loop-controls";
import { Button } from "@/components/ui/button";
import type { ConfigInspectorSummary } from "@/lib/config-inspector";
import type { ConfigTabId } from "@/lib/config-tabs";
import { PanelRight } from "@/lib/icon";

export interface ConfigToolsTabProps {
  curSec: number;
  fmtTime: (sec: number) => string;
  fullDurationSec: number;
  keptDurationSec: number;
  loop: { inSec: number; outSec: number } | null;
  onClearLoop: () => void;
  onSetLoop: (loop: { inSec: number; outSec: number }) => void;
  outPos: number;
  timeline: ComponentProps<typeof EditorToolsControls>["timeline"];
}

export interface ConfigHistoryTabProps {
  currentRevision: number;
  currentWords: { deleted: boolean; id: string; text: string }[];
  focusRevision: number | null;
  onFocusRevisionHandled: () => void;
  onReverted: (project: EngineProject) => void;
  showProvenance: boolean;
  slug: string;
}

export interface ConfigPanelProps {
  activeTab: ConfigTabId;
  closeLabel: string;
  edit: ConfigEditTabProps;
  embedded?: boolean;
  history: ConfigHistoryTabProps;
  inspectorSummary: ConfigInspectorSummary | null;
  look: LookTabPanelProps;
  onClose: () => void;
  onTabChange: (tab: ConfigTabId) => void;
  project: ConfigProjectTabProps;
  tools: ConfigToolsTabProps;
}

export function ConfigPanel({
  activeTab,
  closeLabel,
  edit,
  embedded = false,
  history,
  inspectorSummary,
  look,
  onClose,
  onTabChange,
  project,
  tools,
}: ConfigPanelProps) {
  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden bg-background"
      data-config-panel
    >
      <div className="flex w-full flex-col overflow-hidden bg-background">
        {embedded ? null : (
          <div className="flex h-10 shrink-0 items-center gap-2 border-border border-b px-3">
            <div className="min-w-0 flex-1 truncate font-semibold text-[0.98rem] tracking-tight">
              Config
            </div>
            <Button
              aria-label={closeLabel}
              className="text-muted-foreground"
              onClick={onClose}
              size="icon-sm"
              title={closeLabel}
              variant="ghost"
            >
              <PanelRight />
            </Button>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          {inspectorSummary ? (
            <ConfigInspectorHeader summary={inspectorSummary} />
          ) : null}
          <ConfigTabBar activeTab={activeTab} onTabChange={onTabChange} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeTab === "edit" ? <ConfigEditTab {...edit} /> : null}
            {activeTab === "look" ? <LookTabPanel {...look} /> : null}
            {activeTab === "tools" ? (
              <>
                <EditorToolsControls timeline={tools.timeline} />
                <PlaybackLoopControls
                  curSec={tools.curSec}
                  fmtTime={tools.fmtTime}
                  fullDurationSec={tools.fullDurationSec}
                  keptDurationSec={tools.keptDurationSec}
                  loop={tools.loop}
                  onClearLoop={tools.onClearLoop}
                  onSetLoop={tools.onSetLoop}
                  outPos={tools.outPos}
                />
              </>
            ) : null}
            {activeTab === "project" ? <ConfigProjectTab {...project} /> : null}
            {activeTab === "history" ? (
              <HistoryPanel
                currentRevision={history.currentRevision}
                currentWords={history.currentWords}
                focusRevision={history.focusRevision}
                onFocusRevisionHandled={history.onFocusRevisionHandled}
                onReverted={history.onReverted}
                showProvenance={history.showProvenance}
                slug={history.slug}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

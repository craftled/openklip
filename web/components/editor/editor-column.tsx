"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  EditorPreviewPane,
  type EditorPreviewPaneProps,
} from "@/components/editor/editor-preview-pane";
import {
  EditorToolbar,
  type EditorToolbarProps,
} from "@/components/editor/editor-toolbar";
import { EditorTranscriptPanel } from "@/components/editor-transcript-panel";
import { SettingsView } from "@/components/settings/settings-view";
import { SidebarInset } from "@/components/ui/sidebar";
import type { AgentModelId } from "@/lib/agent-preferences";
import type { SettingsSectionId } from "@/lib/settings-navigation";

export type EditorTranscriptProps = Omit<
  ComponentProps<typeof EditorTranscriptPanel>,
  "search"
> & {
  search: ReactNode;
};

export interface EditorColumnSettingsProps {
  activeSection: SettingsSectionId;
  defaultAgent: AgentModelId;
  export1080: boolean;
  onDefaultAgentChange: (model: AgentModelId) => void;
  onExport1080Change: (value: boolean) => void;
}

export type EditorColumnToolbarProps = Omit<
  EditorToolbarProps,
  "showAgentSidebarTrigger" | "toggleAgentSidebar"
>;

export interface EditorColumnProps {
  agentSidebar: {
    isMobile: boolean;
    open: boolean;
    toggleSidebar: () => void;
  };
  preview: EditorPreviewPaneProps;
  settings: EditorColumnSettingsProps;
  settingsOpen: boolean;
  toolbar: EditorColumnToolbarProps;
  transcript: EditorTranscriptProps;
}

export function EditorColumn({
  agentSidebar,
  preview,
  settings,
  settingsOpen,
  toolbar,
  transcript,
}: EditorColumnProps) {
  const showAgentSidebarTrigger = agentSidebar.isMobile || !agentSidebar.open;

  return (
    <SidebarInset className="flex min-h-[28rem] min-w-0 flex-col bg-background md:min-h-0">
      {settingsOpen ? (
        <SettingsView
          activeSection={settings.activeSection}
          defaultAgent={settings.defaultAgent}
          export1080={settings.export1080}
          onDefaultAgentChange={settings.onDefaultAgentChange}
          onExport1080Change={settings.onExport1080Change}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" data-editor-column>
          <EditorToolbar
            {...toolbar}
            showAgentSidebarTrigger={showAgentSidebarTrigger}
            toggleAgentSidebar={agentSidebar.toggleSidebar}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <EditorPreviewPane {...preview} />
            <div className="flex min-h-0 flex-1 flex-col">
              <EditorTranscriptPanel
                activeMatchRange={transcript.activeMatchRange}
                curSample={transcript.curSample}
                inBroll={transcript.inBroll}
                inZoom={transcript.inZoom}
                matchRanges={transcript.matchRanges}
                onCutSelection={transcript.onCutSelection}
                onRestoreSelection={transcript.onRestoreSelection}
                onSelectRange={transcript.onSelectRange}
                onTextEdit={transcript.onTextEdit}
                onViewInHistory={transcript.onViewInHistory}
                search={transcript.search}
                selRange={transcript.selRange}
                showProvenance={transcript.showProvenance}
                words={transcript.words}
              />
            </div>
          </div>
        </div>
      )}
    </SidebarInset>
  );
}

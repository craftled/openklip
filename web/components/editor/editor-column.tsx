"use client";

import type { ComponentProps } from "react";
import {
  EditorPreviewPane,
  type EditorPreviewPaneProps,
} from "@/components/editor/editor-preview-pane";
import { EditorTranscriptPanel } from "@/components/editor-transcript-panel";
import { SettingsView } from "@/components/settings/settings-view";
import { SidebarInset } from "@/components/ui/sidebar";
import type { AgentModelId } from "@/lib/agent-preferences";
import type { SettingsSectionId } from "@/lib/settings-navigation";

export type EditorTranscriptProps = ComponentProps<
  typeof EditorTranscriptPanel
>;

export interface EditorColumnSettingsProps {
  activeSection: SettingsSectionId;
  defaultAgent: AgentModelId;
  export1080: boolean;
  onDefaultAgentChange: (model: AgentModelId) => void;
  onExport1080Change: (value: boolean) => void;
}

export interface EditorColumnProps {
  preview: EditorPreviewPaneProps;
  settings: EditorColumnSettingsProps;
  settingsOpen: boolean;
  transcript: EditorTranscriptProps;
}

export function EditorColumn({
  preview,
  settings,
  settingsOpen,
  transcript,
}: EditorColumnProps) {
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

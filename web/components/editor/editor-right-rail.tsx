"use client";

import type { ReactNode } from "react";
import { AgentChatPanel } from "@/components/agent-chat-panel";
import { ChatResizeHandle } from "@/components/chat-resize-handle";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import {
  CONFIG_SIDEBAR_WIDTH,
  type MobileRightPanel,
  visibleChatWidth,
} from "@/lib/right-rail-layout";

export interface EditorRightRailProps {
  chatWidth: number;
  configOpen: boolean;
  configPanel: ReactNode;
  hidden: boolean;
  mobilePanel: MobileRightPanel;
  onAssetsUpdated: (update: AssetBinUpdate) => void;
  onChatWidthChange: (width: number) => void;
  onCloseMobilePanel: () => void;
  slug: string;
}

export function EditorRightRail({
  chatWidth,
  configOpen,
  configPanel,
  hidden,
  mobilePanel,
  onAssetsUpdated,
  onChatWidthChange,
  onCloseMobilePanel,
  slug,
}: EditorRightRailProps) {
  if (hidden) {
    return null;
  }

  const chatColumnWidth = visibleChatWidth(chatWidth, configOpen);

  return (
    <div data-editor-right-rail>
      <aside
        className="relative hidden min-h-0 min-w-0 shrink-0 overflow-hidden border-border border-l bg-background xl:flex"
        style={{ width: chatColumnWidth }}
      >
        <ChatResizeHandle
          onResize={onChatWidthChange}
          rightOffset={configOpen ? CONFIG_SIDEBAR_WIDTH : 0}
          width={chatColumnWidth}
        />
        <AgentChatPanel
          onAssetsUpdated={onAssetsUpdated}
          showSidebarTrigger={false}
          slug={slug}
        />
      </aside>
      {configOpen ? (
        <aside
          className="hidden min-h-0 shrink-0 border-border border-l bg-background xl:flex"
          data-config-rail
          style={{ width: CONFIG_SIDEBAR_WIDTH }}
        >
          {configPanel}
        </aside>
      ) : null}
      {mobilePanel === null ? null : (
        <div className="fixed inset-0 z-50 xl:hidden" data-mobile-right-rail>
          <button
            aria-label="Close panel"
            className="absolute inset-0 bg-black/10"
            onClick={onCloseMobilePanel}
            type="button"
          />
          <section
            aria-label={mobilePanel === "chat" ? "Chat" : "Config"}
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 flex h-[88vh] max-h-[88vh] flex-col overflow-hidden rounded-t-xl border-border border-t bg-background text-foreground shadow-lg"
            role="dialog"
          >
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {mobilePanel === "chat" ? (
                <AgentChatPanel
                  onAssetsUpdated={onAssetsUpdated}
                  onClose={onCloseMobilePanel}
                  showSidebarTrigger={false}
                  slug={slug}
                />
              ) : null}
              {mobilePanel === "config" ? configPanel : null}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

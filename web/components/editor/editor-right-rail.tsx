"use client";

import { AgentChatPanel } from "@/components/agent-chat-panel";
import { Sidebar, SidebarContent, SidebarRail } from "@/components/ui/sidebar";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import type { MobileRightPanel } from "@/lib/right-rail-layout";

export interface EditorRightRailProps {
  hidden: boolean;
  mobilePanel: MobileRightPanel;
  onAssetsUpdated: (update: AssetBinUpdate) => void;
  onCloseMobilePanel: () => void;
  slug: string;
}

export function EditorRightRail({
  hidden,
  mobilePanel,
  onAssetsUpdated,
  onCloseMobilePanel,
  slug,
}: EditorRightRailProps) {
  if (hidden) {
    return null;
  }

  return (
    <>
      <div className="hidden xl:contents" data-desktop-right-rail>
        <Sidebar collapsible="offcanvas" data-editor-right-rail side="right">
          <SidebarContent className="min-h-0 flex-1 gap-0 overflow-hidden p-0">
            <AgentChatPanel
              onAssetsUpdated={onAssetsUpdated}
              showSidebarTrigger
              slug={slug}
            />
          </SidebarContent>
          <SidebarRail />
        </Sidebar>
      </div>
      {mobilePanel === "chat" ? (
        <div className="fixed inset-0 z-50 xl:hidden" data-mobile-right-rail>
          <button
            aria-label="Close panel"
            className="absolute inset-0 bg-black/10"
            onClick={onCloseMobilePanel}
            type="button"
          />
          <section
            aria-label="Chat"
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 flex h-[88vh] max-h-[88vh] flex-col overflow-hidden rounded-t-xl border-border border-t bg-sidebar text-sidebar-foreground shadow-lg"
            role="dialog"
          >
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <AgentChatPanel
                onAssetsUpdated={onAssetsUpdated}
                onClose={onCloseMobilePanel}
                showSidebarTrigger={false}
                slug={slug}
              />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

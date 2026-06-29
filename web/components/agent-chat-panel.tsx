"use client";

import { useAgentChat } from "@/components/agent-chat-context";
import { AgentPromptInput } from "@/components/agent-prompt-input";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AgentProviderIcon } from "@/lib/agent-icons";
import { getAgentModelLabel } from "@/lib/agent-preferences";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import { cn } from "@/lib/utils";

interface AgentChatPanelProps {
  onAssetsUpdated: (update: AssetBinUpdate) => void;
  slug: string;
}

export function AgentChatPanel({ onAssetsUpdated, slug }: AgentChatPanelProps) {
  const {
    activeSlug,
    activeThread,
    agent,
    chatsLoading,
    runningThreadId,
    sendMessage,
  } = useAgentChat();

  const isRunning = runningThreadId !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-border border-b px-6 py-3">
          <span className="text-section-label text-tertiary">Chat</span>
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex shrink-0 items-center gap-1.5 text-caption text-tertiary"
              title={getAgentModelLabel(agent)}
            >
              <AgentProviderIcon className="size-3.5 shrink-0" value={agent} />
              <span className="truncate">{getAgentModelLabel(agent)}</span>
            </span>
            {activeThread && (
              <span className="truncate text-caption text-quaternary">
                {activeThread.title}
              </span>
            )}
            <SidebarTrigger aria-label="Toggle inspector" side="right" />
          </div>
        </div>

        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="gap-2 px-6 py-4 text-left">
            {chatsLoading && (
              <p className="text-sm text-tertiary">Loading chats…</p>
            )}
            {!(chatsLoading || activeThread?.messages.length) && (
              <p className="text-sm text-tertiary leading-relaxed">
                Type <span className="text-foreground">/</span> for edit skills,
                or ask about cuts, filler, and overlays. Use{" "}
                <span className="text-foreground">Find filler</span> above the
                preview.
              </p>
            )}
            {activeThread?.messages.map((m) => (
              <div
                className={cn(
                  "rounded-lg px-3 py-2.5 text-ui leading-relaxed",
                  m.role === "user"
                    ? "bg-user-message-bubble text-foreground"
                    : "bg-transparent text-foreground"
                )}
                key={m.id}
              >
                <div className="mb-0.5 text-section-label text-tertiary">
                  {m.role === "user" ? "You" : "Agent"}
                </div>
                <pre className="whitespace-pre-wrap text-left font-sans">
                  {m.content}
                </pre>
              </div>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="shrink-0 border-border border-t px-6 py-4">
          <AgentPromptInput
            activeSlug={activeSlug}
            chatsLoading={chatsLoading}
            isRunning={isRunning}
            onAssetsUpdated={onAssetsUpdated}
            onSubmitMessage={sendMessage}
            slug={slug}
          />
        </div>
      </div>
    </div>
  );
}

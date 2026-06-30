"use client";

import { useAgentChat } from "@/components/agent-chat-context";
import { AgentPromptInput } from "@/components/agent-prompt-input";
import { ChatMarkdown } from "@/components/chat-markdown";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AgentProviderIcon } from "@/lib/agent-icons";
import { getAgentModelLabel } from "@/lib/agent-preferences";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import { APP_ICON_CLASS, CheckIcon, FileTextIcon, XIcon } from "@/lib/icon";

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
  const showStaticMockups = !(chatsLoading || activeThread?.messages.length);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-border border-b px-6 py-3">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Chat
          </span>
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs"
              title={getAgentModelLabel(agent)}
            >
              <AgentProviderIcon className={APP_ICON_CLASS} value={agent} />
              <span className="truncate">{getAgentModelLabel(agent)}</span>
            </span>
            {activeThread && (
              <span className="truncate text-muted-foreground text-xs">
                {activeThread.title}
              </span>
            )}
            <SidebarTrigger aria-label="Toggle inspector" side="right" />
          </div>
        </div>

        <MessageScrollerProvider>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="gap-3 px-6 py-4 text-left">
                {chatsLoading && (
                  <MessageScrollerItem>
                    <p className="text-muted-foreground text-sm">
                      Loading chats…
                    </p>
                  </MessageScrollerItem>
                )}
                {showStaticMockups && (
                  <MessageScrollerItem>
                    <Marker>
                      <MarkerIcon>
                        <CheckIcon />
                      </MarkerIcon>
                      <MarkerContent>Project context ready</MarkerContent>
                    </Marker>
                  </MessageScrollerItem>
                )}
                {showStaticMockups && (
                  <MessageScrollerItem>
                    <Attachment>
                      <AttachmentMedia>
                        <FileTextIcon />
                      </AttachmentMedia>
                      <AttachmentContent>
                        <AttachmentTitle>sales-dashboard.pdf</AttachmentTitle>
                        <AttachmentDescription>
                          PDF · 2.4 MB
                        </AttachmentDescription>
                      </AttachmentContent>
                      <AttachmentActions>
                        <AttachmentAction aria-label="Remove sales-dashboard.pdf">
                          <XIcon />
                        </AttachmentAction>
                      </AttachmentActions>
                    </Attachment>
                  </MessageScrollerItem>
                )}
                {!(chatsLoading || activeThread?.messages.length) && (
                  <MessageScrollerItem className="flex flex-1 items-center">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>Start a chat</EmptyTitle>
                        <EmptyDescription>
                          Type / for edit skills, or ask about cuts, filler, and
                          overlays.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </MessageScrollerItem>
                )}
                {activeThread?.messages.map((m) => {
                  const isUser = m.role === "user";

                  return (
                    <MessageScrollerItem key={m.id}>
                      <Message align={isUser ? "end" : "start"}>
                        <MessageAvatar>
                          <span className="text-muted-foreground text-xs">
                            {isUser ? "Y" : "A"}
                          </span>
                        </MessageAvatar>
                        <MessageContent>
                          <Bubble align={isUser ? "end" : "start"}>
                            <BubbleContent
                              className={isUser ? "whitespace-pre-wrap" : ""}
                            >
                              {isUser ? (
                                m.content
                              ) : (
                                <ChatMarkdown>{m.content}</ChatMarkdown>
                              )}
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  );
                })}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>

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

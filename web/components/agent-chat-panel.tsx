"use client";

import { useMemo, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
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
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@/components/ui/message-scroller";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AgentProviderIcon } from "@/lib/agent-icons";
import { getAgentModelLabel } from "@/lib/agent-preferences";
import type { ThreadMessage } from "@/lib/agent-threads";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import { APP_ICON_CLASS, CheckIcon, FileTextIcon, XIcon } from "@/lib/icon";
import { cn } from "@/lib/utils";

const TRAIL_PREVIEW_LENGTH = 180;
const TRAIL_BASE_WIDTH = 26;
const TRAIL_IDLE_WIDTH = 10;
const TRAIL_VISIBLE_WIDTH = 14;
const TRAIL_ANCHOR_WIDTH = 16;
const TRAIL_CURRENT_WIDTH = 20;
const TRAIL_HOVER_WIDTH = TRAIL_BASE_WIDTH;
const TRAIL_ZONE_WIDTH = 28;
const TRAIL_PREVIEW_WIDTH = 304;

interface ChatTrailStats {
  characters: number;
  words: number;
}

interface AgentChatPanelProps {
  onAssetsUpdated: (update: AssetBinUpdate) => void;
  onClose?: () => void;
  showSidebarTrigger?: boolean;
  slug: string;
}

function chatTrailPreview(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= TRAIL_PREVIEW_LENGTH) {
    return compact;
  }
  return `${compact.slice(0, TRAIL_PREVIEW_LENGTH - 3).trimEnd()}...`;
}

function chatTrailStats(content: string): ChatTrailStats {
  const compact = content.replace(/\s+/g, " ").trim();
  return {
    characters: Array.from(compact).length,
    words: compact === "" ? 0 : (compact.match(/\S+/g)?.length ?? 0),
  };
}

function chatTrailLabel(message: ThreadMessage, agentLabel: string): string {
  return message.role === "user" ? "You" : agentLabel;
}

function pluralizeMetric(value: number, label: string): string {
  return `${value.toLocaleString()} ${label}${value === 1 ? "" : "s"}`;
}

function chatTrailBarScale({
  isAnchor,
  isCurrent,
  isHovered,
  isVisible,
  trailActive,
}: {
  isAnchor: boolean;
  isCurrent: boolean;
  isHovered: boolean;
  isVisible: boolean;
  trailActive: boolean;
}): number {
  if (!(trailActive || isHovered)) {
    return TRAIL_IDLE_WIDTH / TRAIL_BASE_WIDTH;
  }
  if (isHovered) {
    return TRAIL_HOVER_WIDTH / TRAIL_BASE_WIDTH;
  }
  if (isCurrent) {
    return TRAIL_CURRENT_WIDTH / TRAIL_BASE_WIDTH;
  }
  if (isAnchor) {
    return TRAIL_ANCHOR_WIDTH / TRAIL_BASE_WIDTH;
  }
  if (isVisible) {
    return TRAIL_VISIBLE_WIDTH / TRAIL_BASE_WIDTH;
  }
  return 12 / TRAIL_BASE_WIDTH;
}

function AgentChatTrail({
  agentLabel,
  messages,
}: {
  agentLabel: string;
  messages: ThreadMessage[];
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [trailActive, setTrailActive] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const { scrollToMessage } = useMessageScroller();
  const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility();
  const visibleIds = useMemo(
    () => new Set(visibleMessageIds),
    [visibleMessageIds]
  );

  if (messages.length < 2) {
    return null;
  }

  const hoveredIndex = messages.findIndex(
    (message) => message.id === hoveredId
  );
  const hoveredMessage = hoveredIndex >= 0 ? messages[hoveredIndex] : undefined;
  const hoveredStats = hoveredMessage
    ? chatTrailStats(hoveredMessage.content)
    : null;
  const previewPercent =
    hoveredIndex >= 0
      ? (hoveredIndex / Math.max(messages.length - 1, 1)) * 100
      : 50;
  const previewTop = `${Math.min(96, Math.max(4, previewPercent))}%`;
  const dense = messages.length > 28;
  const closeTrail = () => {
    setTrailActive(false);
    setHoveredId(null);
  };

  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden md:block"
      data-slot="agent-chat-trail"
      style={{ width: TRAIL_ZONE_WIDTH }}
    >
      <div
        className="group/trail pointer-events-auto relative h-full"
        onBlurCapture={(event) => {
          const next = event.relatedTarget;
          const stillInside =
            next instanceof Node &&
            (event.currentTarget.contains(next) ||
              previewRef.current?.contains(next));
          if (!stillInside) {
            closeTrail();
          }
        }}
        onFocusCapture={() => {
          setTrailActive(true);
        }}
        onPointerEnter={() => {
          setTrailActive(true);
        }}
        onPointerLeave={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && previewRef.current?.contains(next)) {
            return;
          }
          closeTrail();
        }}
        ref={trailRef}
        style={{ width: TRAIL_ZONE_WIDTH }}
      >
        <div className="absolute inset-y-4 left-1 flex max-h-[calc(100%-2rem)] flex-col items-start gap-1 overflow-hidden py-1 opacity-35 transition-opacity focus-within:opacity-100 hover:opacity-100">
          {messages.map((message, index) => {
            const isAnchor = message.role === "user";
            const isCurrent = currentAnchorId === message.id;
            const isHovered = hoveredId === message.id;
            const isVisible = visibleIds.has(message.id);
            const barScale = chatTrailBarScale({
              isAnchor,
              isCurrent,
              isHovered,
              isVisible,
              trailActive,
            });
            const label = `${chatTrailLabel(message, agentLabel)} message ${
              index + 1
            }`;

            return (
              <button
                aria-current={isCurrent ? "location" : undefined}
                aria-label={`Jump to ${label}`}
                className={cn(
                  "group/marker flex shrink-0 origin-left items-center justify-start rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  dense ? "min-h-1 flex-1" : "h-2"
                )}
                data-slot="agent-chat-trail-marker"
                key={message.id}
                onBlur={() => {
                  setHoveredId((id) => (id === message.id ? null : id));
                }}
                onClick={() => {
                  setTrailActive(true);
                  setHoveredId(message.id);
                  scrollToMessage(message.id, {
                    align: isAnchor ? "start" : "nearest",
                    behavior: "smooth",
                  });
                }}
                onFocus={() => {
                  setHoveredId(message.id);
                }}
                onPointerEnter={() => {
                  setHoveredId(message.id);
                }}
                style={{ width: TRAIL_BASE_WIDTH }}
                type="button"
              >
                <span
                  aria-hidden
                  className={cn(
                    "block h-px origin-left rounded-full bg-border transition-[transform,background-color,opacity]",
                    trailActive && isVisible && "bg-muted-foreground/60",
                    isCurrent && "bg-muted-foreground",
                    isHovered && "bg-foreground"
                  )}
                  style={{
                    transform: `scaleX(${barScale})`,
                    width: TRAIL_BASE_WIDTH,
                  }}
                />
                <span className="sr-only">{label}</span>
              </button>
            );
          })}
        </div>

        {hoveredMessage && (
          <div
            className="pointer-events-auto absolute isolate -translate-y-1/2 overflow-hidden rounded-2xl bg-background/70 px-3.5 py-3 text-foreground shadow-[0_18px_46px_rgb(0_0_0/0.16)] ring-1 ring-foreground/10 backdrop-blur-2xl before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-gradient-to-b before:from-background/80 before:via-background/55 before:to-background/75"
            data-slot="agent-chat-trail-preview"
            onPointerEnter={() => {
              setTrailActive(true);
            }}
            onPointerLeave={(event) => {
              const next = event.relatedTarget;
              if (next instanceof Node && trailRef.current?.contains(next)) {
                return;
              }
              closeTrail();
            }}
            ref={previewRef}
            style={{
              left: TRAIL_ZONE_WIDTH - 1,
              top: previewTop,
              width: TRAIL_PREVIEW_WIDTH,
            }}
          >
            <p className="truncate font-semibold text-[13px] leading-none">
              {chatTrailLabel(hoveredMessage, agentLabel)}
            </p>
            <p className="mt-2 max-h-20 overflow-hidden text-[13px] text-muted-foreground leading-relaxed">
              {chatTrailPreview(hoveredMessage.content)}
            </p>
            {hoveredStats ? (
              <div className="mt-3 flex justify-end gap-4 font-medium text-[12px] text-muted-foreground leading-none">
                <span>{pluralizeMetric(hoveredStats.words, "word")}</span>
                <span>
                  {pluralizeMetric(hoveredStats.characters, "character")}
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentChatPanel({
  onAssetsUpdated,
  onClose,
  showSidebarTrigger = true,
  slug,
}: AgentChatPanelProps) {
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
            {onClose ? (
              <Button
                aria-label="Close chat"
                className="size-8 text-muted-foreground"
                onClick={onClose}
                size="icon-sm"
                title="Close chat"
                variant="ghost"
              >
                <XIcon />
              </Button>
            ) : null}
            {showSidebarTrigger ? (
              <SidebarTrigger aria-label="Toggle chat" side="right" />
            ) : null}
          </div>
        </div>

        <MessageScrollerProvider
          autoScroll
          defaultScrollPosition="last-anchor"
          key={activeThread?.id ?? "empty-chat"}
          scrollPreviousItemPeek={56}
        >
          <MessageScroller className="min-h-0 flex-1">
            <AgentChatTrail
              agentLabel={getAgentModelLabel(agent)}
              messages={activeThread?.messages ?? []}
            />
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
                    <MessageScrollerItem
                      key={m.id}
                      messageId={m.id}
                      scrollAnchor={isUser}
                    >
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

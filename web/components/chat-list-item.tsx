"use client";

import {
  Archive,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ChatPreviewRow } from "@/components/chat-preview-hover";
import { ChatProgressIndicator } from "@/components/chat-progress-indicator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { AgentThread } from "@/lib/agent-threads";
import type { ProjectHoverContext } from "@/lib/project-context";
import { cn } from "@/lib/utils";

interface ChatListItemProps {
  archived?: boolean;
  inProgress?: boolean;
  isActive: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onSelect: () => void;
  onUnarchive?: () => void;
  project: ProjectHoverContext;
  thread: AgentThread;
  timeLabel: string;
}

export function ChatListItem({
  archived = false,
  inProgress = false,
  isActive,
  onArchive,
  onDelete,
  onRename,
  onSelect,
  onUnarchive,
  project,
  thread,
  timeLabel,
}: ChatListItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draftTitle, setDraftTitle] = useState(thread.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isRenaming) {
      setDraftTitle(thread.title);
    }
  }, [isRenaming, thread.title]);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  const commitRename = () => {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== thread.title) {
      onRename(trimmed);
    }
    setIsRenaming(false);
  };

  const cancelRename = () => {
    setDraftTitle(thread.title);
    setIsRenaming(false);
  };

  const onRenameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  };

  return (
    <SidebarMenuItem>
      {isRenaming ? (
        <Input
          className="h-8 border-border bg-background px-2 text-sm shadow-none focus-visible:ring-1"
          onBlur={commitRename}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={onRenameKeyDown}
          ref={inputRef}
          value={draftTitle}
        />
      ) : (
        <ChatPreviewRow
          className="group/chat-item relative"
          disabled={isRenaming}
          project={project}
          thread={thread}
        >
          <SidebarMenuButton
            aria-busy={inProgress}
            className={cn(archived && "opacity-70")}
            isActive={isActive}
            onClick={onSelect}
          >
            {inProgress ? (
              <ChatProgressIndicator />
            ) : (
              <MessageSquare className="size-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{thread.title}</span>
            <span className="text-caption text-muted-foreground tabular-nums">
              {timeLabel}
            </span>
          </SidebarMenuButton>
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) {
                setConfirmDelete(false);
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction
                aria-label={`Chat actions for ${thread.title}`}
                onClick={(e) => e.stopPropagation()}
                showOnHover
              >
                <MoreHorizontal className="size-4" />
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right">
              {confirmDelete ? (
                <>
                  <DropdownMenuItem
                    className="text-muted-foreground text-xs focus:bg-transparent"
                    disabled
                  >
                    Delete &ldquo;{thread.title}&rdquo;?
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                      setConfirmDelete(false);
                    }}
                    variant="destructive"
                  >
                    <Trash2 />
                    Confirm delete
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(false);
                    }}
                  >
                    Cancel
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsRenaming(true);
                    }}
                  >
                    <Pencil />
                    Rename
                  </DropdownMenuItem>
                  {archived ? (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnarchive?.();
                      }}
                    >
                      <RotateCcw />
                      Unarchive
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchive();
                      }}
                    >
                      <Archive />
                      Archive
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(true);
                    }}
                    variant="destructive"
                  >
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </ChatPreviewRow>
      )}
    </SidebarMenuItem>
  );
}

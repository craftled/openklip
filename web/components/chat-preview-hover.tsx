"use client";

import { type ReactNode, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { AgentThread } from "@/lib/agent-threads";
import { toastRevealError } from "@/lib/app-toast";
import {
  APP_ICON_CLASS,
  Clock3,
  Film,
  FolderOpen,
  MessageSquare,
} from "@/lib/icon";
import {
  basenamePath,
  formatDurationSec,
  type ProjectHoverContext,
} from "@/lib/project-context";
import { revealProjectFolderApi } from "@/lib/reveal-project";
import { cn } from "@/lib/utils";

const HIDE_DELAY_MS = 350;

function InfoRow({
  detail,
  icon: Icon,
  label,
}: {
  detail?: string;
  icon: typeof Film;
  label: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className={cn("mt-0.5", APP_ICON_CLASS)} />
      <div className="min-w-0">
        <p className="truncate text-foreground text-xs">{label}</p>
        {detail ? (
          <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}

function FolderRow({ dirPath, slug }: { dirPath: string; slug: string }) {
  const [opening, setOpening] = useState(false);

  const onOpen = useCallback(async () => {
    if (opening) {
      return;
    }
    setOpening(true);
    try {
      const result = await revealProjectFolderApi(slug);
      if (!result.ok) {
        toastRevealError(result.error);
      }
    } finally {
      setOpening(false);
    }
  }, [opening, slug]);

  return (
    <div className="min-w-0">
      <Button
        className="h-auto w-full items-start justify-start gap-2.5 rounded-md px-0.5 py-0.5 text-left hover:bg-muted/60 disabled:cursor-wait disabled:opacity-70"
        disabled={opening}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void onOpen();
        }}
        type="button"
        variant="ghost"
      >
        <FolderOpen className={cn("mt-0.5", APP_ICON_CLASS)} />
        <span className="min-w-0 truncate text-foreground text-xs underline-offset-2 hover:underline">
          {opening ? "Opening…" : dirPath}
        </span>
      </Button>
    </div>
  );
}

function ChatPreviewBody({
  project,
  thread,
}: {
  project: ProjectHoverContext;
  thread: AgentThread;
}) {
  const sourceName = basenamePath(project.source);
  const { summary } = project;
  const editLine = `${summary.cuts} cuts · ${formatDurationSec(summary.keptDurationSec)} kept`;
  const messageCount = thread.messages.length;

  return (
    <>
      <p className="mb-2.5 truncate font-medium text-sm">{thread.title}</p>
      <div className="flex flex-col gap-2.5">
        <InfoRow detail={sourceName} icon={Film} label={project.slug} />
        <FolderRow dirPath={project.dirPath} slug={project.slug} />
        <InfoRow detail={editLine} icon={Clock3} label="Edit" />
        <InfoRow
          detail={messageCount === 1 ? "1 message" : `${messageCount} messages`}
          icon={MessageSquare}
          label="Chat"
        />
      </div>
    </>
  );
}

interface ChatPreviewRowProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  project: ProjectHoverContext;
  thread: AgentThread;
}

export function ChatPreviewRow({
  children,
  className,
  disabled = false,
  project,
  thread,
}: ChatPreviewRowProps) {
  if (disabled) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <HoverCard>
      <HoverCardTrigger
        closeDelay={HIDE_DELAY_MS}
        delay={0}
        render={<div className={cn(className)} data-slot="chat-preview-row" />}
      >
        {children}
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-60 p-3" side="right">
        <ChatPreviewBody project={project} thread={thread} />
      </HoverCardContent>
    </HoverCard>
  );
}

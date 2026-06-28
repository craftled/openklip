"use client";

import { Clock3, Film, FolderOpen, MessageSquare } from "lucide-react";
import {
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { AgentThread } from "@/lib/agent-threads";
import { toastRevealError } from "@/lib/app-toast";
import {
  basenamePath,
  formatDurationSec,
  type ProjectHoverContext,
} from "@/lib/project-context";
import { revealProjectFolderApi } from "@/lib/reveal-project";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 240;
const PREVIEW_PAD = 4;
const HIDE_DELAY_MS = 350;

interface ChatPreviewPanelProps {
  anchor: DOMRect;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  project: ProjectHoverContext;
  thread: AgentThread;
}

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
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
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
      <button
        className="flex w-full cursor-pointer items-start gap-2.5 rounded-md px-0.5 py-0.5 text-left transition-colors hover:bg-muted/60 disabled:cursor-wait disabled:opacity-70"
        disabled={opening}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void onOpen();
        }}
        type="button"
      >
        <FolderOpen className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-foreground text-xs underline-offset-2 hover:underline">
          {opening ? "Opening…" : dirPath}
        </span>
      </button>
    </div>
  );
}

function ChatPreviewPanel({
  anchor,
  onPointerEnter,
  onPointerLeave,
  project,
  thread,
}: ChatPreviewPanelProps) {
  const position = useMemo(() => {
    let left = anchor.right + PREVIEW_PAD;
    if (left + PANEL_WIDTH > window.innerWidth - PREVIEW_PAD) {
      left = Math.max(PREVIEW_PAD, anchor.left - PANEL_WIDTH - PREVIEW_PAD);
    }
    const panelHeight = 168;
    let top = anchor.top;
    top = Math.min(
      Math.max(PREVIEW_PAD, top),
      window.innerHeight - panelHeight - PREVIEW_PAD
    );
    return { left, top };
  }, [anchor]);

  const sourceName = basenamePath(project.source);
  const { summary } = project;
  const editLine = `${summary.cuts} cuts · ${formatDurationSec(summary.keptDurationSec)} kept`;
  const messageCount = thread.messages.length;

  return createPortal(
    <div
      className="popover-styled fixed z-[100] w-60 overflow-hidden rounded-lg p-3"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{ left: position.left, top: position.top }}
    >
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
    </div>,
    document.body
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
  const rowRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverDepth = useRef(0);
  const [preview, setPreview] = useState<DOMRect | null>(null);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const showPreview = () => {
    if (disabled) {
      return;
    }
    const el = rowRef.current;
    if (!el) {
      return;
    }
    clearHideTimer();
    setPreview(el.getBoundingClientRect());
  };

  const enterHover = () => {
    hoverDepth.current += 1;
    clearHideTimer();
    showPreview();
  };

  const leaveHover = () => {
    hoverDepth.current = Math.max(0, hoverDepth.current - 1);
    clearHideTimer();
    hideTimer.current = setTimeout(() => {
      if (hoverDepth.current === 0) {
        setPreview(null);
      }
    }, HIDE_DELAY_MS);
  };

  const onRowPointerEnter = (_e: PointerEvent<HTMLDivElement>) => {
    enterHover();
  };

  const onRowPointerLeave = (_e: PointerEvent<HTMLDivElement>) => {
    leaveHover();
  };

  useEffect(() => () => clearHideTimer(), []);

  return (
    <>
      <div
        className={cn(className)}
        onPointerEnter={onRowPointerEnter}
        onPointerLeave={onRowPointerLeave}
        ref={rowRef}
      >
        {children}
      </div>
      {preview && (
        <ChatPreviewPanel
          anchor={preview}
          onPointerEnter={enterHover}
          onPointerLeave={leaveHover}
          project={project}
          thread={thread}
        />
      )}
    </>
  );
}

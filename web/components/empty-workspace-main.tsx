"use client";

import type { DragEvent } from "react";
import { Button } from "@/components/ui/button";
import type { InboxJob } from "@/hooks/use-inbox-watch";
import { APP_ICON_CLASS, Film, FolderOpen, Sparkles } from "@/lib/icon";
import { cn } from "@/lib/utils";

export type WorkspaceDragHandler = (e: DragEvent<HTMLElement>) => void;

// Presentational main area of the empty workspace, extracted so the drop
// affordance markup is testable with renderToStaticMarkup (no router or
// effects). The whole surface is a drag-and-drop target when the workspace
// folder is ready; drop wiring lives in EmptyWorkspace.
export function EmptyWorkspaceMain({
  dialogOpen,
  dropActive,
  folderReady,
  inboxJobs,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onOpenDialog,
  workspaceDisplayRoot,
}: {
  dialogOpen: boolean;
  dropActive: boolean;
  folderReady: boolean;
  inboxJobs: InboxJob[];
  onDragEnter?: WorkspaceDragHandler;
  onDragLeave?: WorkspaceDragHandler;
  onDragOver?: WorkspaceDragHandler;
  onDrop?: WorkspaceDragHandler;
  onOpenDialog: () => void;
  workspaceDisplayRoot?: string;
}) {
  return (
    <main
      className={cn(
        "m-2 flex flex-1 flex-col items-center justify-center gap-6 rounded-lg border border-transparent border-dashed p-8 text-center transition-colors",
        dropActive && "border-primary bg-primary/10"
      )}
      data-drop-active={dropActive ? "" : undefined}
      data-drop-target="empty-workspace"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex size-14 items-center justify-center rounded-lg border border-border bg-muted">
        <Sparkles className={APP_ICON_CLASS} />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="font-semibold text-xl tracking-tight">
          Welcome to OpenKlip
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {folderReady
            ? "Your workspace is ready. Drop a video anywhere here, or add one to transcribe, cut filler, and export."
            : "Choose a folder for your projects, then add a video to get started."}
        </p>
        {workspaceDisplayRoot ? (
          <p className="truncate font-mono text-muted-foreground text-xs">
            {workspaceDisplayRoot}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {folderReady ? (
          <Button onClick={onOpenDialog} type="button">
            <Film data-icon="inline-start" />
            Add video
          </Button>
        ) : (
          <Button onClick={onOpenDialog} type="button">
            <FolderOpen data-icon="inline-start" />
            Choose folder
          </Button>
        )}
      </div>
      {inboxJobs.length > 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-muted px-4 py-3">
          {inboxJobs.map((job) => (
            <p className="text-muted-foreground text-sm" key={job.id}>
              Ingesting {job.filename}
              {job.progress
                ? `: ${job.progress.message}… (${job.progress.step}/${job.progress.total})`
                : "…"}
            </p>
          ))}
        </div>
      ) : null}
      {!dialogOpen && folderReady && inboxJobs.length === 0 ? (
        <p className="max-w-sm text-muted-foreground text-xs">
          Tip: drop a video into your projects folder to auto-ingest it, or use{" "}
          <code>openklip ingest &lt;video&gt;</code> from the CLI.
        </p>
      ) : null}
    </main>
  );
}

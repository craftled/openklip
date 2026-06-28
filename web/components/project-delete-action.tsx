"use client";

import { Trash2, X } from "@/lib/icon";
import { cn } from "@/lib/utils";

interface ProjectDeleteActionProps {
  className?: string;
  confirming: boolean;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onRequestDelete: () => void;
  slug: string;
}

export function ProjectDeleteAction({
  className,
  confirming,
  deleting,
  slug,
  onCancel,
  onConfirm,
  onRequestDelete,
}: ProjectDeleteActionProps) {
  if (confirming) {
    return (
      <span
        className={cn("ml-auto flex shrink-0 items-center gap-1", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[11px] text-tertiary">Delete?</span>
        <button
          aria-label={`Confirm delete project ${slug}`}
          className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            onConfirm();
          }}
          type="button"
        >
          <Trash2 className="size-3" />
        </button>
        <button
          aria-label={`Cancel delete project ${slug}`}
          className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-tertiary hover:bg-muted disabled:opacity-50"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          type="button"
        >
          <X className="size-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      aria-label={`Delete project ${slug}`}
      className={cn(
        "ml-auto inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-tertiary opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover/project:opacity-100",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onRequestDelete();
      }}
      type="button"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

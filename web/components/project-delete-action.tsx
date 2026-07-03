"use client";

import { Button } from "@/components/ui/button";
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
        <span className="text-muted-foreground text-xs">Delete?</span>
        <Button
          aria-label={`Confirm delete project ${slug}`}
          className="rounded-sm text-destructive hover:bg-destructive/10"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            onConfirm();
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 />
        </Button>
        <Button
          aria-label={`Cancel delete project ${slug}`}
          className="rounded-sm text-muted-foreground hover:bg-muted"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
      </span>
    );
  }

  return (
    <Button
      aria-label={`Delete project ${slug}`}
      className={cn(
        "ml-auto shrink-0 rounded-sm text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover/project:opacity-100",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onRequestDelete();
      }}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <Trash2 />
    </Button>
  );
}

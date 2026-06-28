"use client";

import { type MouseEvent, useState } from "react";
import { toastRevealError } from "@/lib/app-toast";
import { FolderOpen } from "@/lib/icon";
import {
  type RevealTarget,
  revealProjectFolderApi,
} from "@/lib/reveal-project";
import { cn } from "@/lib/utils";

function useRevealProjectPath(slug: string, target: RevealTarget = "project") {
  const [opening, setOpening] = useState(false);

  const reveal = async (e?: MouseEvent<HTMLElement>) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (opening) {
      return;
    }
    setOpening(true);
    try {
      const result = await revealProjectFolderApi(slug, target);
      if (!result.ok) {
        toastRevealError(result.error);
      }
    } finally {
      setOpening(false);
    }
  };

  return { opening, reveal };
}

const REVEAL_LABEL: Record<RevealTarget, string> = {
  project: "project folder",
  assets: "assets folder",
};

export function ProjectInlineFolderAction({
  className,
  revealGroup = "menu-item",
  slug,
  target = "project",
}: {
  className?: string;
  revealGroup?: "assets" | "menu-item" | "project";
  slug: string;
  target?: RevealTarget;
}) {
  const { opening, reveal } = useRevealProjectPath(slug, target);
  const hoverClass =
    revealGroup === "menu-item"
      ? "group-hover/menu-item:opacity-100"
      : revealGroup === "project"
        ? "group-hover/project:opacity-100"
        : "group-hover/assets:opacity-100";

  const label = `Open ${slug} ${REVEAL_LABEL[target]}`;

  return (
    <button
      aria-label={label}
      className={cn(
        "inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-tertiary opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 disabled:opacity-50",
        hoverClass,
        className
      )}
      disabled={opening}
      onClick={reveal}
      title={label}
      type="button"
    >
      <FolderOpen className="size-3" />
    </button>
  );
}

export function ProjectFolderButton({
  className,
  slug,
  target = "project",
}: {
  className?: string;
  slug: string;
  target?: RevealTarget;
}) {
  const { opening, reveal } = useRevealProjectPath(slug, target);
  const label = `Open ${slug} ${REVEAL_LABEL[target]}`;

  return (
    <button
      aria-label={label}
      className={cn(
        "inline-flex h-8 max-w-[10rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 font-medium text-sm text-tertiary transition-colors hover:bg-foreground/3 hover:text-foreground disabled:opacity-50",
        className
      )}
      disabled={opening}
      onClick={reveal}
      title={label}
      type="button"
    >
      <FolderOpen className="size-3.5 shrink-0" />
      <span className="truncate">{slug}</span>
    </button>
  );
}

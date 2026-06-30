"use client";

import { type MouseEvent, useState } from "react";
import { Button } from "@/components/ui/button";
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
    <Button
      aria-label={label}
      className={cn(
        "shrink-0 rounded-sm text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100",
        hoverClass,
        className
      )}
      disabled={opening}
      onClick={reveal}
      size="icon-sm"
      title={label}
      type="button"
      variant="ghost"
    >
      <FolderOpen />
    </Button>
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
    <Button
      aria-label={label}
      className={cn(
        "max-w-[10rem] shrink-0 justify-start text-muted-foreground hover:bg-foreground/3 hover:text-foreground",
        className
      )}
      disabled={opening}
      onClick={reveal}
      size="sm"
      title={label}
      type="button"
      variant="ghost"
    >
      <FolderOpen data-icon="inline-start" />
      <span className="truncate">{slug}</span>
    </Button>
  );
}

"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { GraphicTemplateOption } from "./graphic-picker-controls";
import { GraphicTemplatePreviewCaption } from "./graphic-template-preview";

// Shader/runtime preview mounts only when a template hover opens (CRAFT-6172).
const GraphicTemplatePreview = dynamic(
  () =>
    import("./graphic-template-preview").then((mod) => ({
      default: mod.GraphicTemplatePreview,
    })),
  { ssr: false }
);

const HIDE_DELAY_MS = 120;

export function GraphicTemplatePreviewHover({
  children,
  className,
  enabled = true,
  params,
  side = "left",
  slug,
  template,
}: {
  children: ReactNode;
  className?: string;
  enabled?: boolean;
  params?: Record<string, string | number | boolean>;
  side?: "left" | "right" | "top" | "bottom";
  slug: string;
  template: GraphicTemplateOption | undefined;
}) {
  if (!(enabled && template)) {
    return <>{children}</>;
  }

  return (
    <HoverCard>
      <HoverCardTrigger
        className={className ?? "block w-full min-w-0"}
        closeDelay={HIDE_DELAY_MS}
        delay={200}
      >
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="z-[100] w-48 overflow-hidden p-0"
        side={side}
        sideOffset={8}
      >
        <GraphicTemplatePreview
          params={params}
          slug={slug}
          template={template}
        />
        <GraphicTemplatePreviewCaption template={template} />
      </HoverCardContent>
    </HoverCard>
  );
}

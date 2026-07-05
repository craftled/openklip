"use client";

import type { ComponentProps } from "react";
import { FindFillerButton } from "@/components/find-filler-button";
import { TimelineDrawer } from "@/components/timeline-drawer";
import { VerifyCutButton } from "@/components/verify-cut-button";

const TOOL_BUTTON_CLASS = "w-full justify-start";

export function EditorToolsControls({
  timeline,
}: {
  timeline: ComponentProps<typeof TimelineDrawer>;
}) {
  return (
    <div className="flex flex-col gap-2 px-2 py-1.5" data-editor-tools-section>
      <FindFillerButton className={TOOL_BUTTON_CLASS} />
      <VerifyCutButton className={TOOL_BUTTON_CLASS} />
      <TimelineDrawer {...timeline} triggerClassName={TOOL_BUTTON_CLASS} />
    </div>
  );
}

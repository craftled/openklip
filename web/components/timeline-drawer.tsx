"use client";

import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { EditTimeline } from "@/components/edit-timeline";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

interface TimelineDrawerProps extends ComponentProps<typeof EditTimeline> {
  fmtTime: (sec: number) => string;
  triggerChildren?: ReactNode;
  triggerClassName?: string;
  triggerVariant?: ComponentProps<typeof Button>["variant"];
}

export function TimelineDrawer({
  curSec,
  durationSec,
  fmtTime,
  triggerChildren = "Timeline",
  triggerClassName,
  triggerVariant = "outline",
  ...timeline
}: TimelineDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer onOpenChange={setOpen} open={open}>
      <DrawerTrigger
        render={
          <Button
            className={cn("justify-start", triggerClassName)}
            size="sm"
            variant={triggerVariant}
          >
            {triggerChildren}
          </Button>
        }
      />
      <DrawerContent className="max-h-[85vh] overflow-hidden border-border bg-background text-foreground">
        <DrawerHeader className="border-border/60 border-b px-3 py-2">
          <DrawerTitle className="flex items-center justify-between font-medium text-xs">
            <span>Timeline</span>
            <span className="font-normal text-[11px] text-muted-foreground tabular-nums">
              {fmtTime(curSec)} / {fmtTime(durationSec)}
            </span>
          </DrawerTitle>
        </DrawerHeader>
        <EditTimeline curSec={curSec} durationSec={durationSec} {...timeline} />
      </DrawerContent>
    </Drawer>
  );
}

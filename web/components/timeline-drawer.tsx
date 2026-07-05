"use client";

import type { ComponentProps } from "react";
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
  triggerClassName?: string;
}

export function TimelineDrawer({
  curSec,
  durationSec,
  fmtTime,
  triggerClassName,
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
            variant="outline"
          >
            Timeline
          </Button>
        }
      />
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="flex items-center justify-between font-medium text-sm">
            <span>Timeline</span>
            <span className="font-normal text-muted-foreground tabular-nums">
              {fmtTime(curSec)} / {fmtTime(durationSec)}
            </span>
          </DrawerTitle>
        </DrawerHeader>
        <EditTimeline curSec={curSec} durationSec={durationSec} {...timeline} />
      </DrawerContent>
    </Drawer>
  );
}

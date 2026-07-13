"use client";

import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { AudioControls } from "@/components/audio-controls";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

interface AudioDrawerProps extends ComponentProps<typeof AudioControls> {
  triggerChildren?: ReactNode;
  triggerClassName?: string;
  triggerVariant?: ComponentProps<typeof Button>["variant"];
}

export function AudioDrawer({
  triggerChildren = "Improve sound",
  triggerClassName,
  triggerVariant = "outline",
  ...audio
}: AudioDrawerProps) {
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
          <DrawerTitle className="font-medium text-xs">
            Improve sound
          </DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-3 py-3">
          <AudioControls {...audio} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

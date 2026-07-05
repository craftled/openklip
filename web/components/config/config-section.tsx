"use client";

import { type ReactNode, useEffect, useState } from "react";
import { ElasticSlider } from "@/components/elastic-slider";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { ChevronRight } from "@/lib/icon";

export const ZOOM_PRESETS: Record<string, { scale: number; rampSec: number }> =
  {
    Subtle: { scale: 1.15, rampSec: 0.6 },
    Punch: { scale: 1.4, rampSec: 0.35 },
    Hold: { scale: 1.25, rampSec: 1.2 },
  };

export const CONFIG_COMPACT_INPUT_CLASS =
  "h-7! rounded-md! px-2! py-1! text-[0.8rem]!";
export const CONFIG_COMPACT_SELECT_TRIGGER_CLASS =
  "h-7! rounded-md! px-2! py-0! text-[0.8rem]!";
export const CONFIG_COMPACT_TEXTAREA_CLASS =
  "min-h-20! rounded-md! px-2! py-1.5! text-[0.8rem]!";

export function Section({
  children,
  defaultOpen = false,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  title: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen, title]);

  return (
    <SidebarGroup className="border-border/80 border-t px-2 py-1">
      <Collapsible onOpenChange={setOpen} open={open} render={<div />}>
        <CollapsibleTrigger
          render={
            <Button
              className="h-7! w-full justify-start rounded-md px-2 font-medium text-[0.8rem] text-foreground/85 tracking-normal hover:bg-muted/45 [&[data-panel-open]>svg.chevron]:rotate-90"
              type="button"
              variant="ghost"
            >
              <span className="min-w-0 flex-1 truncate text-left">{title}</span>
              <ChevronRight className="chevron size-3 shrink-0 text-muted-foreground transition-transform duration-200" />
            </Button>
          }
        />
        <CollapsibleContent>
          <SidebarGroupContent className="pt-1.5 pb-1">
            <FieldGroup className="gap-1.5">{children}</FieldGroup>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}

export function SliderRow({
  formatValue,
  label,
  max,
  min,
  onValueChange,
  step,
  value,
}: {
  formatValue?: (value: number) => string;
  label: string;
  max: number;
  min: number;
  onValueChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <ElasticSlider
      className="w-full"
      formatValue={formatValue}
      label={label}
      max={max}
      min={min}
      onValueChange={onValueChange}
      step={step}
      value={value}
    />
  );
}

export function PropRow({
  children,
  label,
  value,
}: {
  children: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Field className="grid h-7 grid-cols-[4.35rem_1fr_2.75rem] items-center gap-1.5">
      <FieldLabel className="truncate text-muted-foreground text-xs">
        {label}
      </FieldLabel>
      {children}
      <span className="text-right text-xs tabular-nums">{value}</span>
    </Field>
  );
}

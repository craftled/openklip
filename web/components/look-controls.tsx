"use client";

import type { ColorAdjust, Filter } from "@engine/edl";
import { FILTER_OPTIONS, filterLabel } from "@engine/filter";
import { ColorTempPad } from "@/components/color-temp-pad";
import { FilterControls } from "@/components/filter-controls";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const CONFIG_COMPACT_SELECT_TRIGGER_CLASS =
  "h-7! rounded-md! px-2! py-0! text-[0.8rem]!";

const MOTION_SPEED_OPTIONS = [
  { value: "0.7", label: "Slower" },
  { value: "1", label: "Default" },
  { value: "1.4", label: "Snappy" },
  { value: "1.8", label: "Snappier" },
] as const;

export function LookControls({
  atSec,
  color,
  filter,
  motionSpeed,
  onColor,
  onFilter,
  onMotionSpeed,
  onVignette,
  slug,
  vignetteOn,
}: {
  atSec: number;
  color: ColorAdjust | null;
  filter: Filter;
  motionSpeed: number;
  onColor: (next: ColorAdjust) => void;
  onFilter: (filter: Filter) => void;
  onMotionSpeed: (speed: number) => void;
  onVignette: (enabled: boolean) => void;
  slug: string;
  vignetteOn: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5 px-2 py-1.5" data-look-section>
      <Field className="gap-1">
        <FieldLabel className="text-[0.75rem]">Filter</FieldLabel>
        <Select
          onValueChange={(value) => {
            if (value) {
              onFilter(value as Filter);
            }
          }}
          value={filter}
        >
          <SelectTrigger
            aria-label="Filter"
            className={cn("w-full", CONFIG_COMPACT_SELECT_TRIGGER_CLASS)}
            size="sm"
          >
            <SelectValue placeholder="Filter">
              {filterLabel(filter)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <div className="flex items-center gap-2">
        <FilterControls
          atSec={atSec}
          color={color}
          filter={filter}
          onColor={onColor}
          onFilter={onFilter}
          slug={slug}
        />
      </div>

      <div className="flex min-h-6 items-center justify-between gap-1.5">
        <FieldLabel className="text-[0.75rem]" htmlFor="look-vignette">
          Vignette
        </FieldLabel>
        <Switch
          checked={vignetteOn}
          id="look-vignette"
          onCheckedChange={onVignette}
        />
      </div>

      <Field className="gap-1">
        <FieldLabel className="text-[0.75rem]">Motion</FieldLabel>
        <Select
          onValueChange={(value) => {
            if (value) {
              onMotionSpeed(Number(value));
            }
          }}
          value={String(motionSpeed)}
        >
          <SelectTrigger
            aria-label="Motion speed"
            className={cn("w-full", CONFIG_COMPACT_SELECT_TRIGGER_CLASS)}
            size="sm"
          >
            <SelectValue placeholder="Motion" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {MOTION_SPEED_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <ColorTempPad color={color} onColorChange={onColor} />
    </div>
  );
}

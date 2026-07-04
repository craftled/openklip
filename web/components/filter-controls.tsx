"use client";

import { NEUTRAL_COLOR } from "@engine/color-adjust";
import type { ColorAdjust, Filter } from "@engine/edl";
import { FILTER_OPTIONS, filterLabel } from "@engine/filter";
import { useEffect, useMemo, useRef, useState } from "react";
import { ElasticSlider } from "@/components/elastic-slider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Palette, RotateCcw } from "@/lib/icon";

// Live filter controls. A built-in filter gives the look, and continuous knobs
// fine-tune it on a real frame before writing project.json.

type ColorKey = keyof ColorAdjust;

interface KnobDef {
  hint: string;
  key: ColorKey;
  // Multiplier knobs (contrast/saturation) read as x0.96; additive ones signed.
  kind: "signed" | "mult";
  label: string;
  max: number;
  min: number;
  step: number;
}

const KNOBS: KnobDef[] = [
  {
    key: "temperature",
    label: "Temperature",
    hint: "cooler / warmer",
    min: -1,
    max: 1,
    step: 0.005,
    kind: "signed",
  },
  {
    key: "tint",
    label: "Tint",
    hint: "magenta / green",
    min: -1,
    max: 1,
    step: 0.005,
    kind: "signed",
  },
  {
    key: "brightness",
    label: "Brightness",
    hint: "flat add",
    min: -1,
    max: 1,
    step: 0.005,
    kind: "signed",
  },
  {
    key: "contrast",
    label: "Contrast",
    hint: "pivot mid-gray",
    min: 0,
    max: 3,
    step: 0.01,
    kind: "mult",
  },
  {
    key: "saturation",
    label: "Saturation",
    hint: "1 = unchanged",
    min: 0,
    max: 3,
    step: 0.01,
    kind: "mult",
  },
];

function formatKnob(knob: KnobDef, value: number): string {
  if (knob.kind === "mult") {
    return `x${value.toFixed(2)}`;
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}`;
}

function fullColor(color: ColorAdjust | null | undefined): ColorAdjust {
  return { ...NEUTRAL_COLOR, ...(color ?? {}) };
}

function isNeutral(c: ColorAdjust): boolean {
  return (
    c.temperature === 0 &&
    c.tint === 0 &&
    c.brightness === 0 &&
    c.contrast === 1 &&
    c.saturation === 1
  );
}

// Build the preview-frame URL from the current filter + color. A nonce busts the
// browser cache so each committed change re-renders one frame server-side.
function previewSrc(
  slug: string,
  filter: Filter,
  color: ColorAdjust,
  atSec: number,
  nonce: number
): string {
  const p = new URLSearchParams();
  p.set("t", atSec.toFixed(3));
  p.set("filter", filter);
  p.set("temperature", String(color.temperature));
  p.set("tint", String(color.tint));
  p.set("brightness", String(color.brightness));
  p.set("contrast", String(color.contrast));
  p.set("saturation", String(color.saturation));
  p.set("_", String(nonce));
  return `/api/projects/${slug}/preview-frame?${p.toString()}`;
}

export function FilterControls({
  slug,
  filter,
  color,
  atSec,
  onFilter,
  onColor,
}: {
  slug: string;
  filter: Filter;
  color: ColorAdjust | null;
  atSec: number;
  onFilter: (filter: Filter) => void;
  // Persist the whole adjust (releasing a slider or resetting). Neutral clears.
  onColor: (next: ColorAdjust) => void;
}) {
  const [open, setOpen] = useState(false);
  // Local live values drive the preview during a drag; commit persists on release.
  const [live, setLive] = useState<ColorAdjust>(() => fullColor(color));
  // Nonce + debounce so the preview re-renders shortly after the knob settles,
  // not on every intermediate drag tick (one ffmpeg call per settle).
  const [nonce, setNonce] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [failed, setFailed] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync local state whenever the dialog opens or the saved look changes.
  useEffect(() => {
    if (open) {
      setLive(fullColor(color));
      setNonce((n) => n + 1);
    }
  }, [open, color]);

  const bumpPreview = () => {
    if (debounce.current) {
      clearTimeout(debounce.current);
    }
    debounce.current = setTimeout(() => {
      setFailed(false);
      setNonce((n) => n + 1);
    }, 180);
  };

  const onKnob = (key: ColorKey, value: number) => {
    setLive((prev) => ({ ...prev, [key]: value }));
    bumpPreview();
  };

  const commit = (key: ColorKey, value: number) => {
    const next = { ...live, [key]: value };
    setLive(next);
    onColor(next);
  };

  const reset = () => {
    setLive({ ...NEUTRAL_COLOR });
    onColor({ ...NEUTRAL_COLOR });
    bumpPreview();
  };

  const compareMode = comparing ? "before" : "after";
  const setCompareMode = (value: string | readonly string[]) => {
    if (value === "before") {
      setComparing(true);
    } else if (value === "after") {
      setComparing(false);
    }
  };
  const toggleCompare = () => setComparing((value) => !value);

  const previewColor = comparing ? NEUTRAL_COLOR : live;
  const src = useMemo(
    () => previewSrc(slug, filter, previewColor, atSec, nonce),
    [slug, filter, previewColor, atSec, nonce]
  );

  const summary = isNeutral(live)
    ? "neutral"
    : KNOBS.filter((k) => live[k.key] !== NEUTRAL_COLOR[k.key])
        .map(
          (k) =>
            `${k.label.slice(0, 4).toLowerCase()} ${formatKnob(k, live[k.key])}`
        )
        .join("  ");

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button aria-label="Open filter controls" size="sm" variant="outline">
            <Palette data-icon="inline-start" />
            Filter
          </Button>
        }
      />
      <DialogContent className="gap-6 p-6 sm:max-w-3xl">
        <DialogHeader className="max-w-2xl gap-2 pr-8">
          <DialogTitle className="text-xl">Filter</DialogTitle>
          <DialogDescription className="text-base leading-7">
            Tune the look on a real frame. Releasing a knob writes the edit; an
            agent can set the same look from chat.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(20rem,1fr)]">
          {/* Live preview frame */}
          <div className="flex min-w-0 flex-col gap-3">
            <button
              aria-label={`Show ${comparing ? "after" : "before"} filter preview`}
              aria-pressed={comparing}
              className="relative aspect-video overflow-hidden rounded-md border bg-muted text-left outline-none transition-colors hover:bg-muted/80 focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={toggleCompare}
              type="button"
            >
              {failed ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-muted-foreground text-xs">
                  Preview unavailable (render a proxy first).
                </div>
              ) : (
                // biome-ignore lint/performance/noImgElement: server-rendered single frame, not a Next asset
                <img
                  alt="Filter preview frame"
                  className="h-full w-full object-cover"
                  height={360}
                  onError={() => setFailed(true)}
                  src={src}
                  width={640}
                />
              )}
            </button>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem] md:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_9rem]">
              <ToggleGroup
                aria-label="Preview comparison"
                className="grid w-full grid-cols-2"
                onValueChange={setCompareMode}
                size="sm"
                spacing={0}
                type="single"
                value={compareMode}
                variant="outline"
              >
                <ToggleGroupItem className="w-full" value="before">
                  Before
                </ToggleGroupItem>
                <ToggleGroupItem className="w-full" value="after">
                  After
                </ToggleGroupItem>
              </ToggleGroup>
              <Field>
                <FieldLabel className="sr-only">Filter</FieldLabel>
                <Select
                  onValueChange={(v) => {
                    if (v) {
                      onFilter(v as Filter);
                    }
                  }}
                  value={filter}
                >
                  <SelectTrigger aria-label="Filter" size="sm">
                    <SelectValue placeholder="Filter">
                      {filterLabel(filter)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {FILTER_OPTIONS.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          {/* Knobs */}
          <FieldGroup className="min-w-0 gap-4">
            {KNOBS.map((knob) => (
              <Field className="gap-1.5" key={knob.key}>
                <ElasticSlider
                  formatValue={(value) => formatKnob(knob, value)}
                  label={knob.label}
                  max={knob.max}
                  min={knob.min}
                  onValueChange={(value) => onKnob(knob.key, value)}
                  onValueCommit={(value) => commit(knob.key, value)}
                  step={knob.step}
                  value={live[knob.key]}
                />
                <FieldDescription className="truncate px-1 text-xs">
                  {knob.hint}
                </FieldDescription>
              </Field>
            ))}
          </FieldGroup>
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <div className="min-w-0 truncate text-muted-foreground text-sm">
            {summary}
          </div>
          <Button onClick={reset} size="sm" type="button" variant="outline">
            <RotateCcw data-icon="inline-start" />
            Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

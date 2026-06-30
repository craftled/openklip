"use client";

import type { ColorAdjust, Grade } from "@engine/edl";
import { GRADE_OPTIONS } from "@engine/grade";
import { NEUTRAL_COLOR } from "@engine/grade-color";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Palette, RotateCcw } from "@/lib/icon";

// The deck's "control room": a live grade tuner. Five continuous knobs on top of
// a base grade, each previewed on a real frame. Unlike the deck, there is no
// "copy a prompt" step: releasing a slider writes project.json directly through
// the same saveLook action a CLI or agent calls. The agent can lead (set the
// look from chat), the human nudges here.

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

function firstSliderValue(value: number | readonly number[]): number {
  return typeof value === "number" ? value : value[0];
}

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

// Build the preview-frame URL from the current grade + color. A nonce busts the
// browser cache so each committed change re-renders one frame server-side.
function previewSrc(
  slug: string,
  grade: Grade,
  color: ColorAdjust,
  atSec: number,
  nonce: number
): string {
  const p = new URLSearchParams();
  p.set("t", atSec.toFixed(3));
  p.set("grade", grade);
  p.set("temperature", String(color.temperature));
  p.set("tint", String(color.tint));
  p.set("brightness", String(color.brightness));
  p.set("contrast", String(color.contrast));
  p.set("saturation", String(color.saturation));
  p.set("_", String(nonce));
  return `/api/projects/${slug}/preview-frame?${p.toString()}`;
}

export function GradeControlRoom({
  slug,
  grade,
  color,
  atSec,
  onGrade,
  onColor,
}: {
  slug: string;
  grade: Grade;
  color: ColorAdjust | null;
  atSec: number;
  onGrade: (g: Grade) => void;
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

  // Re-sync local state whenever the dialog opens or the saved look changes
  // underneath us (e.g. an agent set the grade from chat).
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

  const previewColor = comparing ? NEUTRAL_COLOR : live;
  const src = useMemo(
    () => previewSrc(slug, grade, previewColor, atSec, nonce),
    [slug, grade, previewColor, atSec, nonce]
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
          <Button aria-label="Open grade control room" variant="outline">
            <Palette data-icon="inline-start" />
            Grade
          </Button>
        }
      />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Grade control room</DialogTitle>
          <DialogDescription>
            Tune the look on a real frame. Releasing a knob writes the edit; an
            agent can set the same look from chat.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Live preview frame */}
          <div className="flex flex-col gap-2">
            <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
              {failed ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-muted-foreground text-xs">
                  Preview unavailable (render a proxy first).
                </div>
              ) : (
                // biome-ignore lint/performance/noImgElement: server-rendered single frame, not a Next asset
                <img
                  alt="Graded preview frame"
                  className="h-full w-full object-cover"
                  height={360}
                  onError={() => setFailed(true)}
                  src={src}
                  width={640}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="flex-1"
                onPointerDown={() => setComparing(true)}
                onPointerLeave={() => setComparing(false)}
                onPointerUp={() => setComparing(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                Hold to compare base
              </Button>
              <Select
                onValueChange={(v) => {
                  if (v) {
                    onGrade(v as Grade);
                  }
                }}
                value={grade}
              >
                <SelectTrigger
                  aria-label="Base grade"
                  className="w-[7.5rem]"
                  size="sm"
                >
                  <SelectValue placeholder="Grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {GRADE_OPTIONS.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Knobs */}
          <div className="flex flex-col gap-3">
            {KNOBS.map((knob) => (
              <div className="flex flex-col gap-1" key={knob.key}>
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-sm">{knob.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {knob.hint}
                  </span>
                  <span className="ml-2 text-xs tabular-nums">
                    {formatKnob(knob, live[knob.key])}
                  </span>
                </div>
                <Slider
                  max={knob.max}
                  min={knob.min}
                  onValueChange={(v) => onKnob(knob.key, firstSliderValue(v))}
                  onValueCommitted={(v) =>
                    commit(knob.key, firstSliderValue(v))
                  }
                  step={knob.step}
                  value={[live[knob.key]]}
                />
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="truncate text-muted-foreground text-xs">
                {summary}
              </span>
              <Button onClick={reset} size="sm" type="button" variant="ghost">
                <RotateCcw data-icon="inline-start" />
                Reset
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

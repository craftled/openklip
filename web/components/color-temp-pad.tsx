"use client";

import { NEUTRAL_COLOR } from "@engine/color-adjust";
import type { ColorAdjust } from "@engine/edl";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "@/lib/icon";

const COLOR_MIN = -1;
const COLOR_MAX = 1;
const KEYBOARD_STEP = 0.025;
const KEYBOARD_STEP_FAST = 0.1;

const clampColor = (value: number): number =>
  Math.min(COLOR_MAX, Math.max(COLOR_MIN, value));

const roundColor = (value: number): number => Math.round(value * 1000) / 1000;

const formatColor = (value: number): string =>
  Object.is(value, -0) ? "0.00" : value.toFixed(2);

const fullColor = (color: ColorAdjust | null | undefined): ColorAdjust => ({
  ...NEUTRAL_COLOR,
  ...(color ?? {}),
});

interface ColorPoint {
  temperature: number;
  tint: number;
}

function pointFromColor(color: ColorAdjust | null): ColorPoint {
  const current = fullColor(color);
  return {
    temperature: current.temperature,
    tint: current.tint,
  };
}

function xFromTemperature(temperature: number): number {
  return ((temperature - COLOR_MIN) / (COLOR_MAX - COLOR_MIN)) * 100;
}

function yFromTint(tint: number): number {
  return ((COLOR_MAX - tint) / (COLOR_MAX - COLOR_MIN)) * 100;
}

function pointFromClientPosition(
  rect: DOMRect,
  clientX: number,
  clientY: number
): ColorPoint {
  const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
  return {
    temperature: roundColor(COLOR_MIN + x * (COLOR_MAX - COLOR_MIN)),
    tint: roundColor(COLOR_MAX - y * (COLOR_MAX - COLOR_MIN)),
  };
}

export function ColorTempPad({
  color,
  onColorChange,
}: {
  color: ColorAdjust | null;
  onColorChange: (next: ColorAdjust) => void;
}) {
  const [draft, setDraft] = useState<ColorPoint>(() => pointFromColor(color));
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) {
      setDraft(pointFromColor(color));
    }
  }, [color, dragging]);

  const commit = (point: ColorPoint) => {
    const current = fullColor(color);
    onColorChange({
      ...current,
      temperature: point.temperature,
      tint: point.tint,
    });
  };

  const reset = () => {
    const point = { temperature: 0, tint: 0 };
    setDraft(point);
    commit(point);
  };

  const updateFromPointer = (
    event: PointerEvent<HTMLButtonElement>,
    shouldCommit: boolean
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = pointFromClientPosition(rect, event.clientX, event.clientY);
    setDraft(next);
    if (shouldCommit) {
      commit(next);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const fast = event.shiftKey ? KEYBOARD_STEP_FAST : KEYBOARD_STEP;
    let next = draft;
    if (event.key === "ArrowLeft") {
      next = {
        ...draft,
        temperature: roundColor(clampColor(draft.temperature - fast)),
      };
    } else if (event.key === "ArrowRight") {
      next = {
        ...draft,
        temperature: roundColor(clampColor(draft.temperature + fast)),
      };
    } else if (event.key === "ArrowDown") {
      next = { ...draft, tint: roundColor(clampColor(draft.tint - fast)) };
    } else if (event.key === "ArrowUp") {
      next = { ...draft, tint: roundColor(clampColor(draft.tint + fast)) };
    } else if (event.key === "Home") {
      next = { temperature: 0, tint: 0 };
    } else {
      return;
    }

    event.preventDefault();
    setDraft(next);
    commit(next);
  };

  const markerStyle = useMemo(
    () => ({
      left: `${xFromTemperature(draft.temperature)}%`,
      top: `${yFromTint(draft.tint)}%`,
    }),
    [draft]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 text-muted-foreground text-xs">
          Color
        </div>
        <div className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {formatColor(draft.temperature)}, {formatColor(draft.tint)}
        </div>
        <Button
          aria-label="Reset color temperature"
          className="size-7 text-muted-foreground"
          onClick={reset}
          size="icon-sm"
          title="Reset color temperature"
          type="button"
          variant="ghost"
        >
          <RotateCcw />
        </Button>
      </div>
      <button
        aria-label={`Color temperature ${formatColor(draft.temperature)}, tint ${formatColor(draft.tint)}`}
        className="relative h-32 w-full touch-none overflow-hidden rounded-lg border border-border/80 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onKeyDown={onKeyDown}
        onPointerCancel={() => setDragging(false)}
        onPointerDown={(event) => {
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event, false);
        }}
        onPointerMove={(event) => {
          if (dragging) {
            updateFromPointer(event, false);
          }
        }}
        onPointerUp={(event) => {
          if (dragging) {
            updateFromPointer(event, true);
          }
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        type="button"
      >
        <span
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgb(43 84 134), rgb(139 94 54)), linear-gradient(180deg, rgb(112 76 135 / 0.7), rgb(50 118 96 / 0.72))",
            backgroundBlendMode: "screen",
          }}
        />
        <span
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgb(255 255 255 / 0.45) 0 1px, transparent 1.2px)",
            backgroundPosition: "0 0",
            backgroundSize: "28px 28px",
          }}
        />
        <span className="absolute inset-x-0 top-1/2 h-px bg-white/18" />
        <span
          className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/10 bg-white shadow-sm ring-1 ring-white/60"
          style={markerStyle}
        />
      </button>
    </div>
  );
}

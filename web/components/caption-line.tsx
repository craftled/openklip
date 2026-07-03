"use client";

import type { CaptionStyleDef } from "@engine/caption-styles";
import { captionStyleCss } from "@/lib/caption-style-css";
import { cn } from "@/lib/utils";
import type { CaptionGroup } from "../../src/captions.ts";

export interface CaptionLineProps {
  /** Current playback position in SOURCE seconds (same clock as the group). */
  curSec: number;
  group: CaptionGroup;
  /** True when a lower-third title is also on screen (pushes captions up). */
  raised: boolean;
  styleDef: CaptionStyleDef;
}

// The single place that turns a CaptionGroup + CaptionStyleDef into pixels.
// Both PreviewOverlays call sites (inline editor preview and the fullscreen
// CinemaPlayer) render through this component, so there is exactly one
// caption box implementation to keep in sync with src/caption-styles.ts.
export function CaptionLine({
  curSec,
  group,
  raised,
  styleDef,
}: CaptionLineProps) {
  const css = captionStyleCss(styleDef);
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 flex justify-center",
        raised ? "bottom-[28%]" : "bottom-[9%]"
      )}
    >
      <div
        className="max-w-[82%] rounded-md px-3.5 py-1.5 text-center leading-tight backdrop-blur"
        style={{
          background: css.background,
          fontFamily: css.fontFamily,
          fontSize: css.fontSize,
          fontWeight: css.fontWeight,
          textShadow: css.textShadow === "none" ? undefined : css.textShadow,
          textTransform: css.textTransform,
        }}
      >
        {group.words.map((w, i) => {
          const next = group.words[i + 1]?.startSec ?? group.endSec;
          const on = curSec >= w.startSec - 0.02 && curSec < next;
          return (
            <span
              key={`${w.text}-${i}`}
              style={{ color: on ? css.activeColor : css.inactiveColor }}
            >
              {w.text}{" "}
            </span>
          );
        })}
      </div>
    </div>
  );
}

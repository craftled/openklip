"use client";

import { captionStyle } from "@engine/caption-styles";
import type { CaptionGroup } from "../../src/captions.ts";
import { cn } from "../lib/utils";
import { CaptionLine } from "./caption-line";
import { type GraphicItem, GraphicOverlay } from "./graphic-overlay";
import { HeroTitleOverlay } from "./hero-title-overlay";
import { JsonRenderGraphicOverlay } from "./json-render-graphic-overlay";

export interface OverlayTitleItem {
  endSample: number;
  id: string;
  position?: "lower" | "center" | "hero";
  startSample: number;
  text: string;
}

interface PreviewOverlaysProps {
  captionGroups: CaptionGroup[];
  /** project.captions?.style; undefined/unknown falls back to the default preset. */
  captionStyleId?: string;
  captionsOn: boolean;
  curSample: number;
  graphics: GraphicItem[];
  sampleRate: number;
  titles: OverlayTitleItem[];
}

// The live overlay stack (hero title, graphics, lower/center title, captions)
// keyed purely on the current SOURCE sample. Shared by the inline editor preview
// and the fullscreen CinemaPlayer so both render identical overlays. The only
// difference is which video's playback drives `curSample`.
export function PreviewOverlays({
  captionGroups,
  captionsOn,
  captionStyleId,
  curSample,
  graphics,
  sampleRate,
  titles,
}: PreviewOverlaysProps) {
  const curSec = curSample / sampleRate;
  const activeTitle = titles.find(
    (t) => curSample >= t.startSample && curSample < t.endSample
  );
  const heroTitle = activeTitle?.position === "hero" ? activeTitle : null;
  const standardTitle =
    activeTitle && activeTitle.position !== "hero" ? activeTitle : null;
  const captionsRaised = standardTitle?.position === "lower";
  const activeGraphics = graphics.filter(
    (g) => curSample >= g.startSample && curSample < g.endSample
  );
  const activeGroup = captionsOn
    ? captionGroups.find(
        (g) => curSec >= g.startSec - 0.05 && curSec <= g.endSec + 0.25
      )
    : undefined;

  return (
    <>
      <HeroTitleOverlay title={heroTitle} />
      {activeGraphics.map((g) =>
        g.type === "json-render" ? (
          <JsonRenderGraphicOverlay
            curSample={curSample}
            graphic={g}
            key={g.id}
            sampleRate={sampleRate}
          />
        ) : (
          <GraphicOverlay
            curSample={curSample}
            graphic={g}
            key={g.id}
            sampleRate={sampleRate}
          />
        )
      )}
      {standardTitle && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 z-[3] flex justify-center",
            standardTitle.position === "center"
              ? "top-1/2 -translate-y-1/2"
              : "bottom-[16%]"
          )}
          key={standardTitle.id}
        >
          <span
            className={cn(
              "max-w-[80%] rounded-md bg-black/60 px-4 py-2 text-center font-medium text-white backdrop-blur",
              standardTitle.position === "center"
                ? "text-[clamp(22px,4vw,52px)]"
                : "text-[clamp(16px,2.6vw,32px)]"
            )}
          >
            {standardTitle.text}
          </span>
        </div>
      )}
      {activeGroup && !heroTitle && (
        <CaptionLine
          curSec={curSec}
          group={activeGroup}
          raised={captionsRaised}
          styleDef={captionStyle(captionStyleId)}
        />
      )}
    </>
  );
}

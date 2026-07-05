"use client";

import { DEFAULT_CAPTION_STYLE } from "@engine/caption-styles";
import type { ColorAdjust, Filter } from "@engine/edl";
import type { ReactNode } from "react";
import { CaptionStylePicker } from "@/components/caption-style-picker";
import { ElasticSlider } from "@/components/elastic-slider";
import { LookControls } from "@/components/look-controls";
import {
  ReframeControls,
  type ReframeControlsProps,
} from "@/components/reframe-controls";

function LookTabGroup({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section
      className="border-border/80 border-t px-2 py-2.5"
      data-look-tab-group={title.toLowerCase()}
    >
      <h3 className="mb-2 font-medium text-[0.72rem] text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export interface LookTabPanelProps {
  atSec: number;
  captionStyle: string;
  color: ColorAdjust | null;
  filter: Filter;
  maxWords: number;
  motionSpeed: number;
  onCaptionStyle: (styleId: string) => void;
  onColor: (next: ColorAdjust) => void;
  onFilter: (filter: Filter) => void;
  onMaxWords: (value: number) => void;
  onMotionSpeed: (speed: number) => void;
  onPadMs: (value: number) => void;
  onVignette: (enabled: boolean) => void;
  padMs: number;
  reframe: ReframeControlsProps;
  slug: string;
  vignetteOn: boolean;
}

export function LookTabPanel({
  atSec,
  captionStyle,
  color,
  filter,
  maxWords,
  motionSpeed,
  onCaptionStyle,
  onColor,
  onFilter,
  onMaxWords,
  onMotionSpeed,
  onPadMs,
  onVignette,
  padMs,
  reframe,
  slug,
  vignetteOn,
}: LookTabPanelProps) {
  return (
    <div className="min-w-0" data-look-tab>
      <LookControls
        atSec={atSec}
        color={color}
        filter={filter}
        motionSpeed={motionSpeed}
        onColor={onColor}
        onFilter={onFilter}
        onMotionSpeed={onMotionSpeed}
        onVignette={onVignette}
        slug={slug}
        vignetteOn={vignetteOn}
      />
      <LookTabGroup title="Captions">
        <ElasticSlider
          className="w-full"
          formatValue={(value) => String(Math.round(value))}
          label="Per line"
          max={12}
          min={1}
          onValueChange={onMaxWords}
          step={1}
          value={maxWords}
        />
        <div>
          <div className="mb-1.5 text-[0.75rem] text-muted-foreground">
            Style
          </div>
          <CaptionStylePicker
            onSelect={onCaptionStyle}
            selected={captionStyle || DEFAULT_CAPTION_STYLE}
          />
        </div>
      </LookTabGroup>
      <LookTabGroup title="Frame">
        <ReframeControls {...reframe} />
        <ElasticSlider
          className="w-full"
          formatValue={(value) => `${Math.round(value)}ms`}
          label="Cut pad"
          max={200}
          min={0}
          onValueChange={onPadMs}
          step={5}
          value={padMs}
        />
      </LookTabGroup>
    </div>
  );
}

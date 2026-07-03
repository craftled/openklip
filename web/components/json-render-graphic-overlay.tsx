"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { applyGraphicFrame, graphicFrameAt } from "@/lib/graphic-runtime";
import {
  PRODUCT_ANNOUNCEMENT_FPS,
  PRODUCT_ANNOUNCEMENT_HEIGHT,
  PRODUCT_ANNOUNCEMENT_WIDTH,
  type ProductAnnouncementSpec,
  validateProductAnnouncementSpec,
} from "../../src/product-announcement.ts";
import { ProductAnnouncementFrame } from "./product-announcement-frame";

export interface JsonRenderGraphicItem {
  catalog?: string;
  endSample: number;
  id: string;
  spec?: unknown;
  startSample: number;
  track: string;
  type?: string;
}

export function JsonRenderGraphicOverlay({
  graphic,
  curSample,
  sampleRate,
}: {
  curSample: number;
  graphic: JsonRenderGraphicItem;
  sampleRate: number;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);
  const validation = useMemo(
    () => validateProductAnnouncementSpec(graphic.spec),
    [graphic.spec]
  );

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    const update = () => {
      const w = box.clientWidth;
      if (w > 0) {
        setScale(w / PRODUCT_ANNOUNCEMENT_WIDTH);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    rootRef.current =
      stage.querySelector<HTMLElement>("[data-graphic-root]") ?? stage;
  }, [validation.spec]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const { frame, durFrames } = graphicFrameAt(
      curSample,
      graphic.startSample,
      graphic.endSample,
      sampleRate,
      PRODUCT_ANNOUNCEMENT_FPS
    );
    applyGraphicFrame(root, frame, durFrames, PRODUCT_ANNOUNCEMENT_HEIGHT);
  }, [
    curSample,
    sampleRate,
    graphic.startSample,
    graphic.endSample,
    validation.spec,
  ]);

  if (!(validation.success && validation.spec)) {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/45 p-6">
        <div className="max-w-md rounded-md border border-destructive/40 bg-background/95 p-4 text-sm shadow-sm">
          <div className="font-medium text-destructive">
            Invalid graphic spec
          </div>
          <div className="mt-1 text-muted-foreground">
            {validation.issues[0] ?? "Spec failed validation"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10" ref={boxRef}>
      <div
        className="absolute top-0 left-0 origin-top-left"
        ref={stageRef}
        style={{
          width: PRODUCT_ANNOUNCEMENT_WIDTH,
          height: PRODUCT_ANNOUNCEMENT_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        <ProductAnnouncementFrame
          spec={validation.spec as ProductAnnouncementSpec}
        />
      </div>
    </div>
  );
}

"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { applyGraphicFrame, graphicFrameAt } from "@/lib/graphic-runtime";
import {
  jsonRenderCatalogDef,
  MAP_MOTION_CATALOG,
  PRODUCT_ANNOUNCEMENT_CATALOG,
  validateJsonRenderSpec,
} from "../../src/json-render-catalogs.ts";
import type { MapMotionSpec } from "../../src/map-motion.ts";
import type { ProductAnnouncementSpec } from "../../src/product-announcement.ts";
import { MapMotionFrame } from "./map-motion-frame";
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
  curSample,
  graphic,
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

  const catalog = graphic.catalog ?? PRODUCT_ANNOUNCEMENT_CATALOG;
  const catalogDef = jsonRenderCatalogDef(
    catalog as typeof PRODUCT_ANNOUNCEMENT_CATALOG | typeof MAP_MOTION_CATALOG
  );
  const validation = useMemo(
    () => validateJsonRenderSpec(catalogDef.id, graphic.spec),
    [catalogDef.id, graphic.spec]
  );

  const frameState = useMemo(
    () =>
      graphicFrameAt(
        curSample,
        graphic.startSample,
        graphic.endSample,
        sampleRate,
        catalogDef.fps
      ),
    [
      curSample,
      sampleRate,
      graphic.startSample,
      graphic.endSample,
      catalogDef.fps,
    ]
  );

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    rootRef.current =
      stage.querySelector<HTMLElement>("[data-graphic-root]") ?? stage;
  }, [validation.spec, catalogDef.id]);

  useLayoutEffect(() => {
    if (catalogDef.id === MAP_MOTION_CATALOG) {
      return;
    }
    const root = rootRef.current;
    if (!root) {
      return;
    }
    applyGraphicFrame(
      root,
      frameState.frame,
      frameState.durFrames,
      catalogDef.height
    );
  }, [
    catalogDef.height,
    catalogDef.id,
    frameState.durFrames,
    frameState.frame,
    validation.spec,
  ]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    const update = () => {
      const w = box.clientWidth;
      if (w > 0) {
        setScale(w / catalogDef.width);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, [catalogDef.width]);

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
          height: catalogDef.height,
          transform: `scale(${scale})`,
          width: catalogDef.width,
        }}
      >
        {catalogDef.id === MAP_MOTION_CATALOG ? (
          <MapMotionFrame
            durFrames={frameState.durFrames}
            frame={frameState.frame}
            spec={validation.spec as MapMotionSpec}
          />
        ) : (
          <ProductAnnouncementFrame
            spec={validation.spec as ProductAnnouncementSpec}
          />
        )}
      </div>
    </div>
  );
}

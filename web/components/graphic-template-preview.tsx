"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  type GraphicComposition,
  loadGraphicComposition,
} from "@/lib/graphic-composition-load";
import { ensureGraphicImagesReady } from "@/lib/graphic-image-cache";
import {
  applyGraphicFrame,
  applyGraphicParams,
  disposeGraphicRuntime,
} from "@/lib/graphic-runtime";
import { graphicRequiresImageAsset } from "../../src/graphic-image-shader-ids.ts";
import type { GraphicTemplateOption } from "./graphic-picker-controls";

export const GRAPHIC_PREVIEW_WIDTH_PX = 192;
const PREVIEW_LOOP_SEC = 2;

function previewParams(
  slug: string,
  template: GraphicTemplateOption,
  params: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  const merged = { ...params };
  if (
    graphicRequiresImageAsset(template.id) &&
    (typeof merged.assetId !== "string" || merged.assetId === "")
  ) {
    return merged;
  }
  if (typeof merged.assetId === "string" && merged.assetId.length > 0) {
    merged._imageSrc = `/media/asset/${encodeURIComponent(merged.assetId)}?slug=${encodeURIComponent(slug)}`;
  }
  return merged;
}

function defaultParamsFromTemplate(
  template: GraphicTemplateOption
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, spec] of Object.entries(template.params)) {
    out[key] = spec.default;
  }
  return out;
}

export function graphicTemplatePreviewParams(
  template: GraphicTemplateOption,
  draft?: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  return { ...defaultParamsFromTemplate(template), ...draft };
}

function previewMediaHeight(comp: GraphicComposition): number {
  return Math.round((GRAPHIC_PREVIEW_WIDTH_PX * comp.height) / comp.width);
}

export function GraphicTemplatePreview({
  params,
  slug,
  template,
}: {
  params?: Record<string, string | number | boolean>;
  slug: string;
  template: GraphicTemplateOption;
}) {
  const [comp, setComp] = useState<GraphicComposition | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const mergedParams = useMemo(
    () =>
      previewParams(
        slug,
        template,
        graphicTemplatePreviewParams(template, params)
      ),
    [params, slug, template]
  );
  const needsAsset = graphicRequiresImageAsset(template.id);
  const missingAsset =
    needsAsset &&
    (typeof mergedParams.assetId !== "string" || mergedParams.assetId === "");

  useEffect(() => {
    let alive = true;
    loadGraphicComposition(template.id, slug).then((c) => {
      if (alive) {
        setComp(c);
      }
    });
    return () => {
      alive = false;
    };
  }, [slug, template.id]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!(stage && comp) || missingAsset) {
      return;
    }
    stage.innerHTML = comp.html;
    rootRef.current =
      stage.querySelector<HTMLElement>("[data-graphic-root]") ?? stage;
    return () => {
      if (rootRef.current) {
        disposeGraphicRuntime(rootRef.current);
      }
      rootRef.current = null;
      stage.innerHTML = "";
    };
  }, [comp, missingAsset, template.id]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || missingAsset) {
      return;
    }
    void ensureGraphicImagesReady(
      mergedParams,
      root.querySelector("[data-shader]")?.getAttribute("data-shader")
    ).then(() => {
      applyGraphicParams(root, mergedParams);
    });
  }, [mergedParams, missingAsset, template.id]);

  useEffect(() => {
    const root = rootRef.current;
    if (!(root && comp) || missingAsset) {
      return;
    }
    const durFrames = Math.max(1, Math.round(comp.fps * PREVIEW_LOOP_SEC));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      applyGraphicFrame(root, frame % durFrames, durFrames, comp.height, {
        width: comp.width,
        height: comp.height,
      });
      frame += 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [comp, missingAsset, template.id]);

  if (!comp) {
    return (
      <div
        className="flex items-center justify-center bg-black text-muted-foreground text-xs"
        style={{ height: Math.round((GRAPHIC_PREVIEW_WIDTH_PX * 9) / 16) }}
      >
        Loading…
      </div>
    );
  }

  if (missingAsset) {
    return (
      <div
        className="flex items-center justify-center bg-black px-2 text-center text-muted-foreground text-xs"
        style={{ height: previewMediaHeight(comp) }}
      >
        Choose an image asset to preview
      </div>
    );
  }

  const mediaHeight = previewMediaHeight(comp);
  const scale = GRAPHIC_PREVIEW_WIDTH_PX / comp.width;

  return (
    <div
      className="relative overflow-hidden bg-black"
      ref={boxRef}
      style={{ height: mediaHeight, width: GRAPHIC_PREVIEW_WIDTH_PX }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        ref={stageRef}
        style={{
          width: comp.width,
          height: comp.height,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
}

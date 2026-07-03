"use client";

import type { Keyframe } from "@engine/keyframes";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  applyGraphicFrame,
  applyGraphicParams,
  graphicFrameAt,
} from "@/lib/graphic-runtime";

// One active graphic overlay rendered live over the <video>, driven by the SAME
// scheduler-derived sample position the export rasterizer uses. The composition
// fragment is authored at its intrinsic width/height (e.g. 1920x1080); we mount
// it at that intrinsic size and CSS-scale it to fill the preview box, so font
// sizes and slide distances match export pixel-for-pixel rather than reflowing.
export interface GraphicItem {
  catalog?: string;
  endSample: number;
  id: string;
  keyframes?: Keyframe[];
  params: Record<string, string | number | boolean>;
  spec?: unknown;
  startSample: number;
  template: string;
  track: string;
  type?: "template" | "json-render";
}

interface Composition {
  fps: number;
  height: number;
  html: string;
  width: number;
}

// Module-level cache keyed by template id: the fragment + intrinsic metadata are
// immutable per template, so every overlay instance shares one fetch.
const compCache = new Map<string, Promise<Composition | null>>();

function loadComposition(template: string): Promise<Composition | null> {
  const cached = compCache.get(template);
  if (cached) {
    return cached;
  }
  const promise = fetch(`/media/graphic/${encodeURIComponent(template)}`)
    .then(async (res) => {
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as {
        html?: string;
        manifest?: { width: number; height: number; fps?: number };
      };
      if (!(data.html && data.manifest)) {
        return null;
      }
      return {
        html: data.html,
        width: data.manifest.width,
        height: data.manifest.height,
        fps: data.manifest.fps ?? 30,
      };
    })
    .catch(() => null);
  compCache.set(template, promise);
  return promise;
}

export function GraphicOverlay({
  graphic,
  curSample,
  sampleRate,
}: {
  graphic: GraphicItem;
  curSample: number;
  sampleRate: number;
}) {
  const [comp, setComp] = useState<Composition | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);

  // Fetch (cached) the composition fragment for this template.
  useEffect(() => {
    let alive = true;
    loadComposition(graphic.template).then((c) => {
      if (alive) {
        setComp(c);
      }
    });
    return () => {
      alive = false;
    };
  }, [graphic.template]);

  // Inject the fragment once per composition, then capture the [data-graphic-root].
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!(stage && comp)) {
      return;
    }
    stage.innerHTML = comp.html;
    rootRef.current =
      stage.querySelector<HTMLElement>("[data-graphic-root]") ?? stage;
    applyGraphicParams(rootRef.current, graphic.params);
  }, [comp, graphic.params]);

  // Keep the intrinsic stage scaled to fill the fluid preview box.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!(box && comp)) {
      return;
    }
    const update = () => {
      const w = box.clientWidth;
      if (w > 0) {
        setScale(w / comp.width);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, [comp]);

  // Per-frame: write animated styles from the scheduler-derived frame number.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!(root && comp)) {
      return;
    }
    const { frame, durFrames } = graphicFrameAt(
      curSample,
      graphic.startSample,
      graphic.endSample,
      sampleRate,
      comp.fps
    );
    applyGraphicFrame(root, frame, durFrames, comp.height, {
      width: comp.width,
      height: comp.height,
      keyframes: graphic.keyframes,
      sampleOffset: curSample - graphic.startSample,
    });
  }, [
    comp,
    curSample,
    sampleRate,
    graphic.startSample,
    graphic.endSample,
    graphic.keyframes,
  ]);

  if (!comp) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[3]" ref={boxRef}>
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

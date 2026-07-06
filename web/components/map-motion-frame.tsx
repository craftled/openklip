"use client";

import { useLayoutEffect } from "react";
import { Map as MapView, useMap } from "@/components/ui/map";
import {
  applyMapMotionFrame,
  initMapMotionLayers,
  type MapMotionMap,
} from "@/lib/map-motion-runtime";
import {
  MAP_MOTION_FPS,
  MAP_MOTION_HEIGHT,
  MAP_MOTION_WIDTH,
  type MapMotionSpec,
} from "../../src/map-motion.ts";

function MapMotionDriver({
  durFrames,
  frame,
  spec,
}: {
  durFrames: number;
  frame: number;
  spec: MapMotionSpec;
}) {
  const { isLoaded, map } = useMap();

  useLayoutEffect(() => {
    if (!(map && isLoaded)) {
      return;
    }
    initMapMotionLayers(map as unknown as MapMotionMap, spec);
  }, [map, isLoaded, spec]);

  useLayoutEffect(() => {
    if (!(map && isLoaded)) {
      return;
    }
    applyMapMotionFrame(map as unknown as MapMotionMap, spec, frame, durFrames);
  }, [map, isLoaded, spec, frame, durFrames]);

  return null;
}

export function MapMotionFrame({
  durFrames,
  frame,
  spec,
}: {
  durFrames: number;
  frame: number;
  spec: MapMotionSpec;
}) {
  const projection =
    spec.projection === "globe" ? ({ type: "globe" } as const) : undefined;

  return (
    <div
      data-fps={MAP_MOTION_FPS}
      data-graphic-root
      data-height={MAP_MOTION_HEIGHT}
      data-width={MAP_MOTION_WIDTH}
      style={{
        height: MAP_MOTION_HEIGHT,
        position: "relative",
        width: MAP_MOTION_WIDTH,
      }}
    >
      <MapView
        attributionControl={false}
        className="absolute inset-0 h-full w-full"
        projection={projection}
        theme={spec.theme}
      >
        <MapMotionDriver durFrames={durFrames} frame={frame} spec={spec} />
      </MapView>
    </div>
  );
}

"use client";

import { useLayoutEffect } from "react";
import {
  Map as MapView,
  MapArc,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerLabel,
  useMap,
} from "@/components/ui/map";
import {
  applyMapMotionFrame,
  initMapMotionLayers,
  type MapMotionMap,
  specRouteCoordinates,
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
  const coords = specRouteCoordinates(spec);
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
        {spec.mode === "route" || spec.mode === "globe" ? (
          <MapRoute
            color={spec.style.lineColor}
            coordinates={coords}
            interactive={false}
            width={spec.style.lineWidth}
          />
        ) : null}
        {spec.mode === "arc" && spec.points.length >= 2 ? (
          <MapArc
            curvature={spec.style.arcCurvature}
            data={[
              {
                id: "arc-1",
                from: [spec.points[0].lng, spec.points[0].lat],
                to: [spec.points[1].lng, spec.points[1].lat],
              },
            ]}
            interactive={false}
            paint={{
              "line-color": spec.style.lineColor,
              "line-width": spec.style.lineWidth,
            }}
          />
        ) : null}
        {spec.points.map((point, index) => (
          <MapMarker
            key={`${point.lng}-${point.lat}-${index}`}
            latitude={point.lat}
            longitude={point.lng}
          >
            <MarkerContent>
              {point.label ? (
                <MarkerLabel position="top">{point.label}</MarkerLabel>
              ) : null}
            </MarkerContent>
          </MapMarker>
        ))}
      </MapView>
    </div>
  );
}

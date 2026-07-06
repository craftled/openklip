import { easeOut } from "motion";
import type { MapMotionSpec } from "../../src/map-motion.ts";

export const MAP_MOTION_SOURCE_ID = "ok-map-motion-route";
export const MAP_MOTION_LAYER_ID = "ok-map-motion-route-layer";
export const MAP_MOTION_ARC_SOURCE_ID = "ok-map-motion-arc";
export const MAP_MOTION_ARC_LAYER_ID = "ok-map-motion-arc-layer";

export const MAP_MOTION_DEFAULT_STYLES = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
} as const;

export interface MapMotionMap {
  addLayer: (layer: unknown, beforeId?: string) => void;
  addSource: (id: string, source: unknown) => void;
  getLayer: (id: string) => unknown;
  getSource: (id: string) => unknown;
  jumpTo: (options: {
    bearing?: number;
    center?: [number, number];
    pitch?: number;
    zoom?: number;
  }) => void;
  once: (event: string, handler: () => void) => void;
  removeLayer: (id: string) => void;
  removeSource: (id: string) => void;
  setPaintProperty: (layerId: string, name: string, value: unknown) => void;
  setProjection: (projection: { type: string }) => void;
  triggerRepaint?: () => void;
}

export interface MapMotionGeoJsonSource {
  setData: (data: unknown) => void;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpCoord(
  a: [number, number],
  b: [number, number],
  t: number
): [number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

export function specRouteCoordinates(spec: MapMotionSpec): [number, number][] {
  if (spec.route?.coordinates && spec.route.coordinates.length >= 2) {
    return spec.route.coordinates;
  }
  return spec.points.map((p) => [p.lng, p.lat] as [number, number]);
}

export function buildArcCoordinates(
  from: [number, number],
  to: [number, number],
  curvature: number,
  samples = 64
): [number, number][] {
  const [x0, y0] = from;
  const [x2, y2] = to;
  const mx = (x0 + x2) / 2;
  const my = (y0 + y2) / 2;
  const dx = x2 - x0;
  const dy = y2 - y0;
  const cx = mx - dy * curvature;
  const cy = my + dx * curvature;
  const points: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const inv = 1 - t;
    points.push([
      inv * inv * x0 + 2 * inv * t * cx + t * t * x2,
      inv * inv * y0 + 2 * inv * t * cy + t * t * y2,
    ]);
  }
  return points;
}

export function trimCoordinates(
  coordinates: [number, number][],
  progress: number
): [number, number][] {
  if (coordinates.length < 2 || progress <= 0) {
    return [coordinates[0] ?? [0, 0]];
  }
  if (progress >= 1) {
    return coordinates;
  }

  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const dx = coordinates[i][0] - coordinates[i - 1][0];
    const dy = coordinates[i][1] - coordinates[i - 1][1];
    total += Math.hypot(dx, dy);
    lengths.push(total);
  }
  if (total <= 0) {
    return coordinates.slice(0, 1);
  }

  const target = total * progress;
  const out: [number, number][] = [coordinates[0]];
  for (let i = 1; i < coordinates.length; i++) {
    if (lengths[i] <= target) {
      out.push(coordinates[i]);
      continue;
    }
    const segStart = lengths[i - 1];
    const segLen = lengths[i] - segStart;
    const segT = segLen > 0 ? (target - segStart) / segLen : 0;
    out.push(lerpCoord(coordinates[i - 1], coordinates[i], segT));
    break;
  }
  return out;
}

export function boundsForCoordinates(coordinates: [number, number][]): {
  center: [number, number];
  zoom: number;
} {
  if (coordinates.length === 0) {
    return { center: [0, 0], zoom: 1 };
  }
  let minLng = coordinates[0][0];
  let maxLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLat = coordinates[0][1];
  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const center: [number, number] = [
    (minLng + maxLng) / 2,
    (minLat + maxLat) / 2,
  ];
  const span = Math.max(maxLng - minLng, maxLat - minLat, 0.5);
  const zoom = Math.max(2, Math.min(8, 6 - Math.log2(span)));
  return { center, zoom };
}

export function cameraStateForFrame(
  spec: MapMotionSpec,
  frame: number,
  durFrames: number
): {
  bearing: number;
  center: [number, number];
  pitch: number;
  zoom: number;
} {
  const t = durFrames <= 1 ? 1 : easeOut(frame / (durFrames - 1));
  const coords = specRouteCoordinates(spec);
  const bounds = boundsForCoordinates(coords);

  if (spec.animation === "globeSpin") {
    return {
      center: bounds.center,
      zoom: lerp(bounds.zoom - 0.5, bounds.zoom + 0.8, t),
      bearing: lerp(0, 45, t),
      pitch: lerp(0, 25, t),
    };
  }

  if (spec.animation === "flyover" && coords.length >= 2) {
    const start = coords[0];
    const end = coords.at(-1) ?? coords[0];
    return {
      center: lerpCoord(start, end, t),
      zoom: lerp(bounds.zoom + 0.6, bounds.zoom + 1.4, t),
      bearing: lerp(-8, 12, t),
      pitch: lerp(0, 35, t),
    };
  }

  return {
    center: bounds.center,
    zoom: lerp(bounds.zoom, bounds.zoom + 0.4, t),
    bearing: lerp(0, 6, t),
    pitch: 0,
  };
}

export function routeProgressForFrame(
  spec: MapMotionSpec,
  frame: number,
  durFrames: number
): number {
  if (spec.animation !== "routeReveal") {
    return 1;
  }
  return durFrames <= 1 ? 1 : easeOut(frame / (durFrames - 1));
}

function lineFeature(coordinates: [number, number][]): {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: [number, number][] };
} {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
  };
}

export function initMapMotionLayers(
  map: MapMotionMap,
  spec: MapMotionSpec
): void {
  if (spec.projection === "globe") {
    map.setProjection({ type: "globe" });
  }

  const style = spec.style;
  const coords = specRouteCoordinates(spec);

  if (
    (spec.mode === "route" || spec.mode === "globe") &&
    !map.getSource(MAP_MOTION_SOURCE_ID)
  ) {
    map.addSource(MAP_MOTION_SOURCE_ID, {
      type: "geojson",
      data: lineFeature(coords),
    });
    map.addLayer({
      id: MAP_MOTION_LAYER_ID,
      type: "line",
      source: MAP_MOTION_SOURCE_ID,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": style.lineColor,
        "line-width": style.lineWidth,
        "line-opacity": 0.9,
      },
    });
  }

  if (spec.mode === "arc" && spec.points.length >= 2) {
    const from = [spec.points[0].lng, spec.points[0].lat] as [number, number];
    const to = [spec.points[1].lng, spec.points[1].lat] as [number, number];
    const arcCoords = buildArcCoordinates(from, to, style.arcCurvature, 64);
    if (!map.getSource(MAP_MOTION_ARC_SOURCE_ID)) {
      map.addSource(MAP_MOTION_ARC_SOURCE_ID, {
        type: "geojson",
        data: lineFeature(arcCoords),
      });
      map.addLayer({
        id: MAP_MOTION_ARC_LAYER_ID,
        type: "line",
        source: MAP_MOTION_ARC_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": style.lineColor,
          "line-width": style.lineWidth,
          "line-opacity": 0.85,
        },
      });
    }
  }
}

export function applyMapMotionFrame(
  map: MapMotionMap,
  spec: MapMotionSpec,
  frame: number,
  durFrames: number
): void {
  const camera = cameraStateForFrame(spec, frame, durFrames);
  map.jumpTo(camera);

  const progress = routeProgressForFrame(spec, frame, durFrames);
  const fullCoords = specRouteCoordinates(spec);

  if (spec.mode === "route" || spec.mode === "globe") {
    const source = map.getSource(MAP_MOTION_SOURCE_ID) as
      | MapMotionGeoJsonSource
      | undefined;
    if (source) {
      const coords =
        spec.animation === "routeReveal"
          ? trimCoordinates(fullCoords, progress)
          : fullCoords;
      source.setData(lineFeature(coords));
    }
  }

  if (spec.mode === "arc" && spec.points.length >= 2) {
    const from = [spec.points[0].lng, spec.points[0].lat] as [number, number];
    const to = [spec.points[1].lng, spec.points[1].lat] as [number, number];
    const arcCoords = buildArcCoordinates(
      from,
      to,
      spec.style.arcCurvature,
      64
    );
    const source = map.getSource(MAP_MOTION_ARC_SOURCE_ID) as
      | MapMotionGeoJsonSource
      | undefined;
    if (source) {
      const coords =
        spec.animation === "routeReveal"
          ? trimCoordinates(arcCoords, progress)
          : arcCoords;
      source.setData(lineFeature(coords));
    }
  }

  map.triggerRepaint?.();
}

export function disposeMapMotion(map: MapMotionMap): void {
  for (const layerId of [MAP_MOTION_LAYER_ID, MAP_MOTION_ARC_LAYER_ID]) {
    try {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    } catch {
      // ignore teardown races
    }
  }
  for (const sourceId of [MAP_MOTION_SOURCE_ID, MAP_MOTION_ARC_SOURCE_ID]) {
    try {
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    } catch {
      // ignore teardown races
    }
  }
}

export function waitMapIdle(map: MapMotionMap): Promise<void> {
  return new Promise((resolve) => {
    map.once("idle", resolve);
    map.triggerRepaint?.();
  });
}

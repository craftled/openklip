// Browser entry bundled for headless map-motion export. Exposes map init +
// frame stepping on window.__okMapMotion alongside the standard graphic runtime.
import maplibregl from "maplibre-gl";
import { ensureGraphicImagesReady } from "../web/lib/graphic-image-cache.ts";
import {
  applyGraphicFrame,
  applyGraphicParams,
} from "../web/lib/graphic-runtime.ts";
import {
  applyMapMotionFrame,
  disposeMapMotion,
  initMapMotionLayers,
  MAP_MOTION_DEFAULT_STYLES,
  type MapMotionMap,
  waitMapIdle,
} from "../web/lib/map-motion-runtime.ts";
import type { MapMotionSpec } from "./map-motion.ts";

type HeadlessMapMotion = {
  applyFrame: (frame: number, durFrames: number) => void;
  dispose: () => void;
  map: MapMotionMap;
  waitIdle: () => Promise<void>;
};

let activeMapMotion: HeadlessMapMotion | null = null;

function readMapMotionSpec(): MapMotionSpec {
  const el = document.getElementById("map-motion-spec");
  if (!el?.textContent) {
    throw new Error("map-motion spec script not found");
  }
  return JSON.parse(el.textContent) as MapMotionSpec;
}

function createMapMotionInstance(spec: MapMotionSpec): HeadlessMapMotion {
  const container = document.getElementById("map-motion-root");
  if (!container) {
    throw new Error("map-motion root element not found");
  }

  const styleUrl = MAP_MOTION_DEFAULT_STYLES[spec.theme];
  const map = new maplibregl.Map({
    container,
    style: styleUrl,
    center: [0, 20],
    zoom: 1.5,
    bearing: 0,
    pitch: 0,
    attributionControl: false,
    interactive: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  } as maplibregl.MapOptions) as unknown as MapMotionMap;

  return {
    map,
    applyFrame(frame: number, durFrames: number) {
      applyMapMotionFrame(map, spec, frame, durFrames);
    },
    waitIdle() {
      return waitMapIdle(map);
    },
    dispose() {
      disposeMapMotion(map);
      (map as unknown as maplibregl.Map).remove();
    },
  };
}

async function ensureMapMotionReady(): Promise<HeadlessMapMotion> {
  if (activeMapMotion) {
    return activeMapMotion;
  }
  const spec = readMapMotionSpec();
  const instance = createMapMotionInstance(spec);
  const mapInstance = instance.map as unknown as maplibregl.Map;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("map-motion map load timed out after 60s"));
    }, 60_000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };
    mapInstance.once("error", (event) => {
      finish(
        new Error(`map-motion map error: ${event.error?.message ?? "unknown"}`)
      );
    });
    mapInstance.once("load", () => {
      try {
        initMapMotionLayers(instance.map, spec);
        finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
  await instance.waitIdle();
  activeMapMotion = instance;
  return instance;
}

(window as unknown as { __okGraphic: unknown }).__okGraphic = {
  applyGraphicFrame,
  applyGraphicParams,
  ensureGraphicImagesReady,
  ensureMapMotionReady,
  applyMapMotionFrame: async (frame: number, durFrames: number) => {
    const instance = await ensureMapMotionReady();
    instance.applyFrame(frame, durFrames);
    await instance.waitIdle();
  },
  disposeMapMotion: () => {
    activeMapMotion?.dispose();
    activeMapMotion = null;
  },
};

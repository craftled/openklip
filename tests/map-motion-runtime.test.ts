import { describe, expect, it } from "bun:test";
import { sampleMapMotionSpec } from "../src/map-motion.ts";
import {
  boundsForCoordinates,
  buildArcCoordinates,
  cameraStateForFrame,
  mapMotionErrorMessage,
  routeProgressForFrame,
  trimCoordinates,
  waitMapIdle,
} from "../web/lib/map-motion-runtime.ts";

describe("map-motion runtime math", () => {
  it("trims route coordinates by progress", () => {
    const coords: [number, number][] = [
      [0, 0],
      [10, 0],
    ];
    const half = trimCoordinates(coords, 0.5);
    expect(half.length).toBe(2);
    expect(half[1][0]).toBeCloseTo(5, 1);
  });

  it("builds arc coordinates between two points", () => {
    const arc = buildArcCoordinates([0, 0], [10, 0], 0.2, 8);
    expect(arc.length).toBe(9);
    expect(arc[0]).toEqual([0, 0]);
    expect(arc.at(-1)).toEqual([10, 0]);
  });

  it("eases route reveal progress across frames", () => {
    const spec = sampleMapMotionSpec();
    expect(routeProgressForFrame(spec, 0, 30)).toBe(0);
    expect(routeProgressForFrame(spec, 29, 30)).toBeCloseTo(1, 1);
  });

  it("interpolates camera state for flyover", () => {
    const spec = {
      ...sampleMapMotionSpec(),
      animation: "flyover" as const,
    };
    const start = cameraStateForFrame(spec, 0, 30);
    const end = cameraStateForFrame(spec, 29, 30);
    expect(end.zoom).toBeGreaterThan(start.zoom);
  });

  it("computes bounds for coordinates", () => {
    const bounds = boundsForCoordinates([
      [-74, 40],
      [-118, 34],
    ]);
    expect(bounds.center[0]).toBeCloseTo(-96, 0);
    expect(bounds.zoom).toBeGreaterThan(1);
  });

  it("waitMapIdle rejects immediately when the map reports a tile error", async () => {
    const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    const map = {
      once(event: string, handler: (...args: unknown[]) => void) {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
      triggerRepaint() {
        const errorHandlers = handlers.get("error") ?? [];
        for (const handler of errorHandlers) {
          handler({ error: { message: "Failed to fetch" } });
        }
      },
    };

    await expect(waitMapIdle(map)).rejects.toThrow(
      /map-motion tile fetch failed: Failed to fetch/
    );
  });

  it("mapMotionErrorMessage prefers the map error detail", () => {
    expect(mapMotionErrorMessage({ error: { message: "network down" } })).toBe(
      "network down"
    );
    expect(mapMotionErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});

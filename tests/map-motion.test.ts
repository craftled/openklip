import { describe, expect, it } from "bun:test";
import {
  assertJsonRenderSpec,
  MAP_MOTION_CATALOG,
  PRODUCT_ANNOUNCEMENT_CATALOG,
  validateJsonRenderSpec,
} from "../src/json-render-catalogs.ts";
import {
  sampleMapMotionSpec,
  validateMapMotionSpec,
} from "../src/map-motion.ts";
import { sampleProductAnnouncementSpec } from "../src/product-announcement.ts";
import routeFixture from "./fixtures/map-motion-route.json";

describe("map-motion spec", () => {
  it("accepts a valid route spec", () => {
    const result = validateMapMotionSpec(routeFixture);
    expect(result.success).toBe(true);
    expect(result.spec?.mode).toBe("route");
  });

  it("rejects route mode with one point", () => {
    const result = validateMapMotionSpec({
      mode: "route",
      points: [{ lng: 0, lat: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects globe mode without globe projection", () => {
    const result = validateMapMotionSpec({
      mode: "globe",
      projection: "mercator",
      animation: "globeSpin",
      points: [
        { lng: 0, lat: 0 },
        { lng: 10, lat: 10 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("provides a sample spec", () => {
    expect(sampleMapMotionSpec().points.length).toBeGreaterThanOrEqual(2);
  });
});

describe("json-render catalog registry", () => {
  it("validates product-announcement through the registry", () => {
    const spec = sampleProductAnnouncementSpec;
    const result = validateJsonRenderSpec(PRODUCT_ANNOUNCEMENT_CATALOG, spec);
    expect(result.success).toBe(true);
    assertJsonRenderSpec(PRODUCT_ANNOUNCEMENT_CATALOG, spec);
  });

  it("validates map-motion through the registry", () => {
    const spec = sampleMapMotionSpec();
    const result = validateJsonRenderSpec(MAP_MOTION_CATALOG, spec);
    expect(result.success).toBe(true);
    assertJsonRenderSpec(MAP_MOTION_CATALOG, spec);
  });
});

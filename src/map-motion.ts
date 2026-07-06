import { z } from "zod";

export const MAP_MOTION_CATALOG = "map-motion" as const;
export const MAP_MOTION_WIDTH = 1920;
export const MAP_MOTION_HEIGHT = 1080;
export const MAP_MOTION_FPS = 30;
export const MAP_MOTION_LIMITS = {
  points: 24,
  routeCoordinates: 200,
  specBytes: 16_000,
} as const;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const MapPointSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  label: z.string().max(64).optional(),
});

const CoordinatePairSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

const MapMotionStyleSchema = z.object({
  lineColor: HexColorSchema.default("#4285F4"),
  lineWidth: z.number().min(1).max(20).default(3),
  markerColor: HexColorSchema.default("#3b82f6"),
  arcCurvature: z.number().min(-1).max(1).default(0.2),
});

export const MapMotionSpecSchema = z
  .object({
    mode: z.enum(["route", "arc", "markers", "globe"]),
    theme: z.enum(["light", "dark"]).default("dark"),
    projection: z.enum(["mercator", "globe"]).default("mercator"),
    points: z.array(MapPointSchema).min(1).max(MAP_MOTION_LIMITS.points),
    route: z
      .object({
        coordinates: z
          .array(CoordinatePairSchema)
          .min(2)
          .max(MAP_MOTION_LIMITS.routeCoordinates)
          .optional(),
      })
      .optional(),
    animation: z
      .enum(["flyover", "routeReveal", "globeSpin"])
      .default("flyover"),
    style: MapMotionStyleSchema.default({
      lineColor: "#4285F4",
      lineWidth: 3,
      markerColor: "#3b82f6",
      arcCurvature: 0.2,
    }),
  })
  .superRefine((spec, ctx) => {
    if (
      (spec.mode === "route" || spec.mode === "arc") &&
      spec.points.length < 2
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["points"],
        message: `${spec.mode} mode requires at least 2 points`,
      });
    }
    if (spec.mode === "globe" && spec.projection !== "globe") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["projection"],
        message: 'globe mode requires projection "globe"',
      });
    }
    if (spec.mode === "globe" && spec.animation !== "globeSpin") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["animation"],
        message: 'globe mode requires animation "globeSpin"',
      });
    }
    if (spec.mode === "route" && spec.animation === "globeSpin") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["animation"],
        message: "route mode cannot use globeSpin animation",
      });
    }
  });

export type MapMotionSpec = z.infer<typeof MapMotionSpecSchema>;

export const MapMotionCatalogSchema = z.literal(MAP_MOTION_CATALOG);
export type MapMotionCatalog = z.infer<typeof MapMotionCatalogSchema>;

export interface MapMotionValidation {
  issues: string[];
  spec?: MapMotionSpec;
  success: boolean;
}

function assertJsonSerializable(rawSpec: unknown): string | null {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(rawSpec)).length;
    if (bytes > MAP_MOTION_LIMITS.specBytes) {
      return `spec exceeds ${MAP_MOTION_LIMITS.specBytes} byte limit`;
    }
  } catch {
    return "spec must be JSON-serializable";
  }
  return null;
}

export function validateMapMotionSpec(rawSpec: unknown): MapMotionValidation {
  const serializable = assertJsonSerializable(rawSpec);
  if (serializable) {
    return { issues: [serializable], success: false };
  }

  const parsed = MapMotionSpecSchema.safeParse(rawSpec);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map(
        (issue) =>
          `${issue.path.length > 0 ? issue.path.join(".") : "spec"}: ${issue.message}`
      ),
      success: false,
    };
  }

  return { issues: [], spec: parsed.data, success: true };
}

export function assertMapMotionSpec(rawSpec: unknown): MapMotionSpec {
  const result = validateMapMotionSpec(rawSpec);
  if (result.success && result.spec) {
    return result.spec;
  }
  throw new Error(`invalid map-motion spec: ${result.issues.join("; ")}`);
}

export function parseMapMotionSpecJson(rawJson: string): MapMotionSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid map-motion spec JSON: ${detail}`);
  }
  return assertMapMotionSpec(parsed);
}

export function sampleMapMotionSpec(): MapMotionSpec {
  return assertMapMotionSpec({
    mode: "route",
    theme: "dark",
    projection: "mercator",
    animation: "routeReveal",
    points: [
      { lng: -74.006, lat: 40.7128, label: "NYC" },
      { lng: -118.2437, lat: 34.0522, label: "LA" },
    ],
    style: {
      lineColor: "#4285F4",
      lineWidth: 4,
      markerColor: "#3b82f6",
      arcCurvature: 0.2,
    },
  });
}

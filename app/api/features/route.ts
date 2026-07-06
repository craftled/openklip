import {
  FEATURE_GROUP_IDS,
  type FeatureGroupId,
  featureManifest,
} from "@engine/features";
import type { Surface } from "@engine/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  const url = new URL(req.url);
  const group = url.searchParams.get("group");
  const surface = url.searchParams.get("surface");

  if (
    group !== null &&
    !(FEATURE_GROUP_IDS as readonly string[]).includes(group)
  ) {
    return Response.json(
      { error: `group must be one of: ${FEATURE_GROUP_IDS.join(", ")}` },
      { status: 400 }
    );
  }
  if (
    surface !== null &&
    surface !== "cli" &&
    surface !== "gui" &&
    surface !== "mcp"
  ) {
    return Response.json(
      { error: "surface must be cli, gui, or mcp" },
      { status: 400 }
    );
  }

  return Response.json(
    featureManifest({
      group: (group ?? undefined) as FeatureGroupId | undefined,
      surface: (surface ?? undefined) as Surface | undefined,
    })
  );
}

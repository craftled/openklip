import { existsSync } from "node:fs";
import { basename } from "node:path";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { listFrameSamples } from "@engine/scene-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { slug } = await params;
  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const paths = projectPaths(slug);
  if (!existsSync(paths.project)) {
    return Response.json(
      { error: `project not found: ${slug}` },
      { status: 404 }
    );
  }

  const url = new URL(req.url);
  const rawLimit = url.searchParams.get("limit");
  let limit: number | undefined;
  if (rawLimit !== null) {
    limit = Number(rawLimit);

    if (!Number.isInteger(limit) || limit <= 0) {
      return Response.json(
        { error: "limit must be a positive integer when provided" },
        { status: 400 }
      );
    }
  }

  const frames = listFrameSamples(slug, limit);
  return Response.json({
    frames: frames.map((frame) => ({
      name: basename(frame.path),
      atSec: frame.atSec,
      url: `/media/frames/${basename(frame.path)}?slug=${encodeURIComponent(slug)}`,
    })),
  });
}

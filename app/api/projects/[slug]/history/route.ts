import { existsSync } from "node:fs";
import { readActionLog } from "@engine/action-log";
import { assertValidSlug, projectPaths } from "@engine/paths";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// Bound the response: the log is append-only and unbounded on disk, but the
// panel only ever shows the recent past.
const HISTORY_LIMIT = 200;

// Per-project action history, newest first. Mirrors the export route's error
// ladder: invalid slug -> 400, missing project -> 404, else 200 with entries
// (a project with no logged actions yet returns an empty list).
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;

  // 1. Reject hostile slugs before any path is built.
  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  // 2. Project must exist.
  if (!existsSync(projectPaths(slug).project)) {
    return Response.json(
      { error: `project not found: ${slug}` },
      { status: 404 }
    );
  }

  return Response.json({
    entries: await readActionLog(slug, { limit: HISTORY_LIMIT }),
  });
}

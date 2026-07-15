import { existsSync } from "node:fs";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { loadProject } from "@engine/projectStore";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * Lightweight revision probe for the editor live-sync poll.
 * Returns only { revision } so the client can skip a full project load until
 * the EDL actually advances (CLI/MCP external edits).
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;

  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  if (!existsSync(projectPaths(slug).project)) {
    return Response.json(
      { error: `project not found: ${slug}` },
      { status: 404 }
    );
  }

  try {
    const project = await loadProject(slug);
    return Response.json({ revision: project.revision ?? 0 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

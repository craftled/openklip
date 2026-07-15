import { existsSync } from "node:fs";
import { deleteProject } from "@engine/delete-project";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { listProjects, loadProject } from "@engine/projectStore";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * Full project.json for editor live-sync reseed after an external revision
 * advance (CLI/MCP). Client-only fields (brief, mediaVersion, …) stay on the
 * client and are merged there.
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
    return Response.json({
      project,
      revision: project.revision ?? 0,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;

  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    await deleteProject(slug);
    return Response.json({ projects: listProjects() });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes("project not found")) {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

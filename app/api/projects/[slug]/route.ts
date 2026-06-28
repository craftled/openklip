import { deleteProject, listProjects } from "@engine/projectStore";
import { assertValidSlug } from "@engine/paths";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
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

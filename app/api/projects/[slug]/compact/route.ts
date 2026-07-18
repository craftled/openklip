import { existsSync } from "node:fs";
import { compactProject } from "@engine/compact-project";
import { trustGuard } from "@engine/local-trust";
import { assertValidSlug, projectPaths } from "@engine/paths";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

function assertProject(slug: string): Response | undefined {
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
}

/** Whether a project's proxy is missing while it still has an edit: the
 * signal the editor uses to show a "needs rebuild" banner instead of a
 * broken player (proxy.mp4/frames routes 404 rather than lazily rebuilding). */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const err = assertProject(slug);
  if (err) {
    return err;
  }
  const compacted = !existsSync(projectPaths(slug).proxy);
  return Response.json({ compacted });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  const { slug } = await params;
  const err = assertProject(slug);
  if (err) {
    return err;
  }

  try {
    const { bytesFreed } = await compactProject(slug);
    return Response.json({ ok: true, bytesFreed });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes("project not found")) {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

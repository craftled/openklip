import { existsSync } from "node:fs";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { loadHistorySnapshot } from "@engine/projectStore";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

function parseRevision(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0) {
    return null;
  }
  return revision;
}

/** Read-only access to a pre-mutation project.json snapshot for diff review. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;

  try {
    assertValidSlug(slug);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }

  if (!existsSync(projectPaths(slug).project)) {
    return Response.json(
      { error: `project not found: ${slug}` },
      { status: 404 }
    );
  }

  const revision = parseRevision(new URL(req.url).searchParams.get("revision"));
  if (revision === null) {
    return Response.json(
      { error: "revision query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const project = await loadHistorySnapshot(slug, revision);
    return Response.json({
      revision,
      words: project.words.map((word) => ({
        deleted: word.deleted,
        id: word.id,
        text: word.text,
      })),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 404 });
  }
}

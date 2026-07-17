import { existsSync } from "node:fs";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { listSilencesJobs } from "@engine/silences-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// Per-project silences job list for the Job Center UI (mirrors
// app/api/projects/jobs/route.ts's workspace-wide ingest listing). Read-only
// GET, so no trustGuard, matching the sibling silences GETs in this
// directory tree.
export async function GET(_req: Request, { params }: RouteParams) {
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

  return Response.json({ jobs: listSilencesJobs(slug) });
}

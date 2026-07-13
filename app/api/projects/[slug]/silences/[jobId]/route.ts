import { existsSync } from "node:fs";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { getSilencesJob } from "@engine/silences-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string; jobId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { slug, jobId } = await params;
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

  const job = getSilencesJob(jobId);
  if (!job || job.slug !== slug) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }

  return Response.json(job);
}

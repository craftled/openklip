import { existsSync } from "node:fs";
import { trustGuard } from "@engine/local-trust";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { cancelSilencesJob, getSilencesJob } from "@engine/silences-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ jobId: string; slug: string }>;
}

// Cancel a running silences-analysis job. Mirrors the ingest cancel route's
// contract (see app/api/projects/ingest/[jobId]/cancel/route.ts).
export async function POST(
  req: Request,
  { params }: RouteParams
): Promise<Response> {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
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
  const ok = cancelSilencesJob(jobId);
  return Response.json({ ok });
}

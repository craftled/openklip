import { existsSync } from "node:fs";
import { trustGuard } from "@engine/local-trust";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { getSilencesJob, retrySilencesJob } from "@engine/silences-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

interface RouteParams {
  params: Promise<{ jobId: string; slug: string }>;
}

// Retry a terminal, non-"done" silences job. Mirrors the ingest retry
// route's contract (see app/api/projects/ingest/[jobId]/retry/route.ts),
// except a retry here may return a DIFFERENT job (startSilencesJob's own
// per-slug dedup, not a same-id flip; see src/silences-jobs.ts's
// retrySilencesJob doc), so the response returns whatever job is now
// running for this slug.
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
  const result = await retrySilencesJob(jobId);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 409 });
  }
  return Response.json({ job: result.job });
}

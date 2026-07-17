import { getIngestJob, retryIngestJob } from "@engine/ingest-jobs";
import { trustGuard } from "@engine/local-trust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

// Retry a terminal, non-"done" ingest job in place (same jobId, flipped
// back to "running"). 404 for an unknown job id; 409 with an actionable
// error for a job that isn't retryable right now (still running, already
// done, a take/cam job, or a job whose source is gone).
export async function POST(
  req: Request,
  { params }: RouteParams
): Promise<Response> {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  const { jobId } = await params;
  if (!getIngestJob(jobId)) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  const result = await retryIngestJob(jobId);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 409 });
  }
  return Response.json({ job: getIngestJob(jobId) });
}

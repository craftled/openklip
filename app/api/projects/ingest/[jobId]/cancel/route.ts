import { cancelIngestJob, getIngestJob } from "@engine/ingest-jobs";
import { trustGuard } from "@engine/local-trust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

// Cancel a running ingest job. Returns { ok: true } when a live job was
// found and its AbortController was aborted (the job's status transition to
// "cancelled" happens asynchronously once the aborted run settles, not
// synchronously in this response), { ok: false } when the job exists but is
// not currently running (nothing to cancel), and 404 when the job id is
// unknown.
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
  const ok = cancelIngestJob(jobId);
  return Response.json({ ok });
}

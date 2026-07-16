import { deleteIngestJobRecord, getIngestJob } from "@engine/ingest-jobs";
import { trustGuard } from "@engine/local-trust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

// Poll an ingest job's progress/status. The client polls this after upload (and
// the folder-watch reads it for each detected video).
export async function GET(
  _req: Request,
  { params }: RouteParams
): Promise<Response> {
  const { jobId } = await params;
  const job = getIngestJob(jobId);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  return Response.json(job);
}

// Clean up a terminal job's record (does not touch the project directory;
// see src/ingest-jobs.ts's deleteIngestJobRecord doc). 404 for an unknown
// job id; 409 with an actionable error when the job is still running.
export async function DELETE(
  req: Request,
  { params }: RouteParams
): Promise<Response> {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  const { jobId } = await params;
  try {
    const deleted = deleteIngestJobRecord(jobId);
    if (!deleted) {
      return Response.json({ error: "job not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}

import { getIngestJob } from "@engine/ingest-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Poll an ingest job's progress/status. The client polls this after upload (and
// the folder-watch reads it for each detected video).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  const { jobId } = await params;
  const job = getIngestJob(jobId);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  return Response.json(job);
}

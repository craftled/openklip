import { inboxVideoPath, scanInboxRoot } from "@engine/inbox";
import { ingest } from "@engine/ingest";
import {
  isSlugInFlight,
  listIngestJobs,
  startIngestJob,
} from "@engine/ingest-jobs";
import { trustGuard } from "@engine/local-trust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

// Folder-watch tick: detect loose videos in the projects root that aren't
// projects yet, start an ingest job for each (skipping ones already in flight),
// and return the current jobs so the GUI can show progress. POST because it
// mutates (starts work), mirroring the asset-folder sync endpoint.
export function POST(req: Request): Response {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  const pending = scanInboxRoot().filter((v) => !isSlugInFlight(v.slug));
  for (const v of pending) {
    startIngestJob({
      filename: v.file,
      slug: v.slug,
      run: (onProgress) => ingest(inboxVideoPath(v.file), { onProgress }),
    });
  }
  return Response.json({ jobs: listIngestJobs() });
}

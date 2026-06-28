import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest } from "@engine/ingest";
import { startIngestJob } from "@engine/ingest-jobs";
import { projectPaths, slugFromVideo } from "@engine/paths";
import { listProjects } from "@engine/projectStore";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export function GET(): Response {
  return Response.json(listProjects());
}

// Upload a video and start an ingest job. Ingest is minutes-long, so we return
// the job id immediately; the client polls /api/projects/ingest/[jobId] for
// progress. The same-slug guard still answers synchronously (409) so the dialog
// can offer a force re-ingest before any work starts.
export async function POST(req: NextRequest): Promise<Response> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "missing file field" }, { status: 400 });
  }
  const force = new URL(req.url).searchParams.get("force") === "1";
  const filename = file.name.replace(/[^\w.-]+/g, "_") || "video.mp4";
  const slug = slugFromVideo(filename);
  if (!force && existsSync(projectPaths(slug).project)) {
    return Response.json(
      {
        error: `project already exists: ${slug} (re-ingest would wipe it; confirm to overwrite)`,
      },
      { status: 409 }
    );
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "openklip-ingest-"));
  const tmpPath = join(tmpDir, filename);
  await writeFile(tmpPath, new Uint8Array(await file.arrayBuffer()));

  const job = startIngestJob({
    filename: file.name,
    slug,
    run: async (onProgress) => {
      try {
        return await ingest(tmpPath, { force, onProgress });
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    },
  });
  return Response.json({ jobId: job.id, slug });
}

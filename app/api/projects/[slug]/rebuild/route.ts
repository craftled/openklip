import { existsSync } from "node:fs";
import { basename } from "node:path";
import { startIngestJob } from "@engine/ingest-jobs";
import { trustGuard } from "@engine/local-trust";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { loadProject } from "@engine/projectStore";
import { rebuildProjectMedia } from "@engine/rebuild-project";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

interface RouteParams {
  params: Promise<{ slug: string }>;
}

function assertProject(slug: string): Response | undefined {
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
}

// Rehydrate a compacted project's derived media in the background: this is
// minutes-long (transcode + Whisper), the same shape as whole-project ingest
// (app/api/projects/post.ts), so it starts a Job Center job and returns
// immediately rather than blocking the request. The GUI polls the same
// generic /api/projects/ingest/[jobId] route used for ingest.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  const { slug } = await params;
  const err = assertProject(slug);
  if (err) {
    return err;
  }

  const project = await loadProject(slug);
  const job = startIngestJob({
    filename: basename(project.source),
    slug,
    sourcePath: project.source,
    run: async (onProgress, signal) => {
      await rebuildProjectMedia(slug, { onProgress, signal });
      return slug;
    },
  });

  return Response.json({ jobId: job.id });
}

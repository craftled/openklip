import { existsSync } from "node:fs";
import {
  missingAudioRawError,
  tryLoadCachedAudioAnalysis,
} from "@engine/audio-analysis";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { startSilencesJob } from "@engine/silences-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { slug } = await params;
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

  const paths = projectPaths(slug);
  if (!existsSync(paths.audioRaw)) {
    return Response.json(
      { error: missingAudioRawError().message },
      { status: 404 }
    );
  }

  try {
    const cached = await tryLoadCachedAudioAnalysis(slug);
    if (cached) {
      return Response.json({ silences: cached.silences });
    }
  } catch {
    return Response.json(
      { error: "failed to load audio analysis" },
      { status: 500 }
    );
  }

  const job = startSilencesJob(slug);
  return Response.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
  });
}

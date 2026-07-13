import { existsSync } from "node:fs";
import {
  loadAudioAnalysis,
  missingAudioRawError,
} from "@engine/audio-analysis";
import { assertValidSlug, projectPaths } from "@engine/paths";

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
    const analysis = await loadAudioAnalysis(slug);
    return Response.json({ silences: analysis.silences });
  } catch {
    // Do not echo the caught error's message here: an unexpected fs error
    // (e.g. EACCES) formats as "EACCES: permission denied, open '<absolute
    // path>'" in Node/Bun, which would leak the project's filesystem
    // location to an unauthenticated caller.
    return Response.json(
      { error: "failed to load audio analysis" },
      { status: 500 }
    );
  }
}

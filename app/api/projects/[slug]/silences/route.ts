import { existsSync } from "node:fs";
import { loadAudioAnalysis } from "@engine/audio-analysis";
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
      {
        error: `missing ${paths.audioRaw}: this project needs re-ingest (audio16k.f32 is written at ingest time by extractAudio)`,
      },
      { status: 404 }
    );
  }

  try {
    const analysis = await loadAudioAnalysis(slug);
    return Response.json({ silences: analysis.silences });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

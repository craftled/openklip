import { measureProjectAudio } from "@engine/audio-measure";
import { assertValidSlug } from "@engine/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { slug } = await params;
  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const url = new URL(req.url);
  const sourceRaw = url.searchParams.get("source");
  const source =
    sourceRaw === null
      ? undefined
      : sourceRaw === "export" || sourceRaw === "proxy"
        ? sourceRaw
        : null;
  if (source === null) {
    return Response.json(
      { error: "source must be export or proxy when provided" },
      { status: 400 }
    );
  }

  const targetRaw = url.searchParams.get("targetLufs");
  const targetLufs =
    targetRaw === null ? undefined : Number.parseFloat(targetRaw);

  try {
    const result = await measureProjectAudio(slug, {
      source,
      targetLufs:
        targetLufs !== undefined && Number.isFinite(targetLufs)
          ? targetLufs
          : undefined,
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

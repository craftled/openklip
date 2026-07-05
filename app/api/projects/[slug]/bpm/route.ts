import { measureMusicBpm } from "@engine/bpm";
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
  const assetId = url.searchParams.get("assetId")?.trim();
  if (!assetId) {
    return Response.json({ error: "assetId query param is required" }, { status: 400 });
  }

  const force = url.searchParams.get("force") === "1";

  try {
    const result = await measureMusicBpm(slug, assetId, { force });
    return Response.json(result);
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes("unknown asset") || message.includes("requires kind music")) {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

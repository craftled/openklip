import { deleteAsset } from "@engine/assets";
import { assertValidSlug } from "@engine/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string; assetId: string }>;
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { slug, assetId } = await params;

  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  if (!assetId || assetId.includes("/") || assetId.includes("..")) {
    return Response.json({ error: "invalid asset id" }, { status: 400 });
  }

  try {
    // deleteAsset locks internally (via mutateProject): wrapping it in
    // another withProjectLock here would deadlock the per-slug promise
    // queue on the nested lock (see src/project-lock.ts).
    const project = await deleteAsset(slug, assetId, "human");
    return Response.json({
      assets: project.assets,
      broll: project.broll,
      stills: project.stills ?? [],
    });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes("unknown asset")) {
      return Response.json({ error: message }, { status: 404 });
    }
    if (message.includes("project not found")) {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

import { syncAssetsFromFolder } from "@engine/asset-scanner";
import { listAssetsByKind } from "@engine/assets";
import { loadProject } from "@engine/projectStore";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// Folder sync mutates project.json (prunes stale registrations, registers
// files dropped into assets/), so it lives behind POST: a GET that mutates is
// an anti-pattern (crawlers/bots/service workers will issue GETs to any URL
// they discover; see Next.js prefetching guide §"Triggering unwanted
// side-effects during prefetching"). syncAssetsFromFolder serializes per-slug
// so overlapping polls (interval + focus, or multiple tabs) collapse into
// one sync and never interleave the project.json read-modify-write.
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  try {
    await syncAssetsFromFolder(slug);
    const project = await loadProject(slug);
    return Response.json({
      assets: project.assets,
      byKind: listAssetsByKind(project.assets),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

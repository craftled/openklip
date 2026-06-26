import { existsSync } from "node:fs";
import { assetProxyPath } from "@engine/paths";
import { resolveSlug } from "@engine/projectStore";
import { serveRange } from "@engine/serveRange";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = rawId.replace(/[^a-zA-Z0-9._-]/g, "");
  const slug = resolveSlug(req.nextUrl.searchParams.get("slug"));
  const fp = assetProxyPath(slug, id);
  if (!existsSync(fp)) {
    return new Response("not found", { status: 404 });
  }
  return serveRange(req, fp, "video/mp4");
}

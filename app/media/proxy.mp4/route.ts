import { existsSync } from "node:fs";
import type { NextRequest } from "next/server";
import { projectPaths } from "@engine/paths";
import { resolveSlug } from "@engine/projectStore";
import { serveRange } from "@engine/serveRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = resolveSlug(req.nextUrl.searchParams.get("slug"));
  const fp = projectPaths(slug).proxy;
  if (!existsSync(fp)) {
    return new Response("not found", { status: 404 });
  }
  return serveRange(req, fp, "video/mp4");
}

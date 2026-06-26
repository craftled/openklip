import { existsSync } from "node:fs";
import { assetStoragePath } from "@engine/paths";
import { loadProject, resolveSlug } from "@engine/projectStore";
import { serveRange } from "@engine/serveRange";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mimeForPath(fp: string): string {
  const lower = fp.toLowerCase();
  if (lower.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (lower.endsWith(".aac")) {
    return "audio/aac";
  }
  if (lower.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = rawId.replace(/[^a-zA-Z0-9._-]/g, "");
  const slug = resolveSlug(req.nextUrl.searchParams.get("slug"));
  const project = await loadProject(slug);
  const asset = project.assets.find((a) => a.id === id);
  if (!asset) {
    return new Response("not found", { status: 404 });
  }
  const fp = assetStoragePath(slug, asset.proxy);
  if (!existsSync(fp)) {
    return new Response("not found", { status: 404 });
  }
  return serveRange(req, fp, mimeForPath(fp));
}

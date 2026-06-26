import { createReadStream, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { projectPaths } from "@engine/paths";
import { resolveSlug } from "@engine/projectStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name: rawName } = await params;
  const name = rawName.replace(/[^a-zA-Z0-9._-]/g, "");
  const slug = resolveSlug(req.nextUrl.searchParams.get("slug"));
  const fp = join(projectPaths(slug).frames, name);
  if (!existsSync(fp)) return new Response("not found", { status: 404 });
  const node = createReadStream(fp);
  req.signal.addEventListener("abort", () => node.destroy());
  return new Response(Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>, {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(statSync(fp).size) },
  });
}

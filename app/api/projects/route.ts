import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest } from "@engine/ingest";
import { listProjects } from "@engine/projectStore";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export function GET(): Response {
  return Response.json(listProjects());
}

export async function POST(req: NextRequest): Promise<Response> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "missing file field" }, { status: 400 });
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "openklip-ingest-"));
  const tmpPath = join(
    tmpDir,
    file.name.replace(/[^\w.-]+/g, "_") || "video.mp4"
  );
  const force = new URL(req.url).searchParams.get("force") === "1";

  try {
    await writeFile(tmpPath, new Uint8Array(await file.arrayBuffer()));
    const slug = await ingest(tmpPath, { force });
    return Response.json({ slug, projects: listProjects() });
  } catch (e) {
    const message = (e as Error).message;
    // Re-ingesting a slug would wipe it; surface that as 409 Conflict so the
    // client can prompt for a confirm/force rather than silently destroying it.
    if (/already exists/i.test(message)) {
      return Response.json({ error: message }, { status: 409 });
    }
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

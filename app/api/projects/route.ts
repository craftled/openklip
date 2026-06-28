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

  try {
    await writeFile(tmpPath, new Uint8Array(await file.arrayBuffer()));
    const slug = await ingest(tmpPath);
    return Response.json({ slug, projects: listProjects() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

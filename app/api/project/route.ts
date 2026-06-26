import { statSync } from "node:fs";
import { projectPaths } from "@engine/paths";
import { loadProject, resolveSlug, saveProject } from "@engine/projectStore";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest) {
  try {
    const slug = resolveSlug(req.nextUrl.searchParams.get("slug"));
    const project = await loadProject(slug);
    const mediaVersion = Math.round(statSync(projectPaths(slug).proxy).mtimeMs);
    return NextResponse.json(
      { ...project, mediaVersion },
      { headers: noStore }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { headers: noStore, status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  const slug = resolveSlug(req.nextUrl.searchParams.get("slug"));
  const body = (await req.json()) as {
    words?: Array<{ id: string; deleted: boolean }>;
    captions?: { enabled?: boolean; maxWords?: number };
    padMs?: number;
  };
  const project = await loadProject(slug);
  if (body.words) {
    const del = new Map(body.words.map((w) => [w.id, w.deleted]));
    for (const w of project.words) {
      if (del.has(w.id)) {
        w.deleted = Boolean(del.get(w.id));
      }
    }
  }
  if (typeof body.captions?.enabled === "boolean") {
    project.captions = { ...project.captions, enabled: body.captions.enabled };
  }
  if (typeof body.captions?.maxWords === "number") {
    const mw = Math.max(1, Math.min(12, Math.round(body.captions.maxWords)));
    project.captions = { ...project.captions, maxWords: mw };
  }
  if (typeof body.padMs === "number") {
    project.padMs = Math.max(0, Math.min(500, Math.round(body.padMs)));
  }
  await saveProject(slug, project);
  return NextResponse.json({ ok: true }, { headers: noStore });
}

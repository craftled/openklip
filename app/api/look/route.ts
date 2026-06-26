import { loadProject, resolveSlug, saveProject } from "@engine/projectStore";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const slug = resolveSlug(req.nextUrl.searchParams.get("slug"));
  const body = (await req.json()) as { vignette?: boolean };
  const project = await loadProject(slug);
  if (typeof body.vignette === "boolean") {
    project.look = { ...project.look, vignette: body.vignette };
  }
  await saveProject(slug, project);
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}

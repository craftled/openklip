import { type NextRequest, NextResponse } from "next/server";
import { ZoomSchema } from "@engine/edl";
import { loadProject, resolveSlug, saveProject } from "@engine/projectStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const slug = resolveSlug(req.nextUrl.searchParams.get("slug"));
    const body = (await req.json()) as { zooms?: unknown[] };
    const project = await loadProject(slug);
    const dur = project.durationSamples;
    const items = [];
    for (const raw of body.zooms ?? []) {
      const z = ZoomSchema.parse(raw);
      const start = Math.max(0, Math.min(z.startSample, dur));
      const end = Math.max(start + 1, Math.min(z.endSample, dur));
      items.push({ ...z, startSample: start, endSample: end });
    }
    project.zooms = items;
    await saveProject(slug, project);
    return NextResponse.json({ ok: true, zooms: items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

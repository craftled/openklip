import { BrollSchema } from "@engine/edl";
import { loadProject, resolveSlug, saveProject } from "@engine/projectStore";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const slug = resolveSlug(req.nextUrl.searchParams.get("slug"));
    const body = (await req.json()) as { broll?: unknown[] };
    const project = await loadProject(slug);
    const assetIds = new Set(project.assets.map((a) => a.id));
    const dur = project.durationSamples;
    const items = [];
    for (const raw of body.broll ?? []) {
      const b = BrollSchema.parse(raw);
      if (!assetIds.has(b.assetId)) {
        continue;
      }
      const start = Math.max(0, Math.min(b.startSample, dur));
      const end = Math.max(start + 1, Math.min(b.endSample, dur));
      items.push({ ...b, startSample: start, endSample: end });
    }
    project.broll = items;
    await saveProject(slug, project);
    return NextResponse.json(
      { ok: true, broll: items },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 400 }
    );
  }
}

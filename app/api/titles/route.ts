import { TitleSchema } from "@engine/edl";
import { loadProject, resolveSlug, saveProject } from "@engine/projectStore";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const slug = resolveSlug(req.nextUrl.searchParams.get("slug"));
    const body = (await req.json()) as { titles?: unknown[] };
    const project = await loadProject(slug);
    const dur = project.durationSamples;
    const items = [];
    for (const raw of body.titles ?? []) {
      const titleItem = TitleSchema.parse(raw);
      if (!titleItem.text.trim()) {
        continue;
      }
      const start = Math.max(0, Math.min(titleItem.startSample, dur));
      const end = Math.max(start + 1, Math.min(titleItem.endSample, dur));
      items.push({ ...titleItem, startSample: start, endSample: end });
    }
    project.titles = items;
    await saveProject(slug, project);
    return NextResponse.json(
      { ok: true, titles: items },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 400 }
    );
  }
}

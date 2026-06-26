import { type NextRequest, NextResponse } from "next/server";
import { exportCut } from "@engine/exporter";
import { resolveSlug } from "@engine/projectStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const slug = resolveSlug(req.nextUrl.searchParams.get("slug"));
    const body = (await req.json().catch(() => ({}))) as { maxHeight?: number };
    return NextResponse.json(
      { ok: true, ...(await exportCut(slug, { maxHeight: body.maxHeight })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

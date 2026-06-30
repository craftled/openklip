import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ColorAdjustSchema, FilterSchema } from "@engine/edl";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { type PreviewLook, renderPreviewFrame } from "@engine/preview-frame";
import { loadProject } from "@engine/projectStore";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

function numParam(value: string | null): number | undefined {
  if (value === null) {
    return;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Build the effective look from query overrides on top of the saved project
// look. The GUI passes the live (unsaved) slider values so tuning previews
// instantly; an agent or CLI can request a frame with no overrides to see the
// committed look. Out-of-range numbers are clamped by the schemas.
function resolveLook(
  params: URLSearchParams,
  saved: PreviewLook
): { look: PreviewLook; atSec: number } {
  const filterRaw = params.get("filter");
  const filter = filterRaw
    ? (FilterSchema.safeParse(filterRaw).data ?? saved.filter)
    : saved.filter;

  const lutRaw = params.get("lut");
  let lut = saved.lut ?? null;
  if (lutRaw !== null) {
    lut = lutRaw === "" || lutRaw === "none" ? null : lutRaw;
  }

  const hasColorParam = [
    "temperature",
    "tint",
    "brightness",
    "contrast",
    "saturation",
  ].some((k) => params.get(k) !== null);
  let color = saved.color ?? null;
  if (hasColorParam) {
    color = ColorAdjustSchema.parse({
      temperature: numParam(params.get("temperature")),
      tint: numParam(params.get("tint")),
      brightness: numParam(params.get("brightness")),
      contrast: numParam(params.get("contrast")),
      saturation: numParam(params.get("saturation")),
    });
  }

  return {
    look: { filter, lut, color },
    atSec: numParam(params.get("t")) ?? 1,
  };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  if (!existsSync(projectPaths(slug).project)) {
    return Response.json(
      { error: `project not found: ${slug}` },
      { status: 404 }
    );
  }

  try {
    const project = await loadProject(slug);
    const { look, atSec } = resolveLook(req.nextUrl.searchParams, {
      filter: project.look?.filter,
      lut: project.look?.lut ?? null,
      color: project.look?.color ?? null,
    });
    const outPath = join(projectPaths(slug).working, "preview-frame.jpg");
    await renderPreviewFrame({ project, slug, atSec, look, outPath });
    const bytes = await readFile(outPath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

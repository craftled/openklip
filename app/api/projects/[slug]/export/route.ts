import { existsSync } from "node:fs";
import { effectiveRanges } from "@engine/edl";
import { EXPORT_COMPRESSIONS, exportCut } from "@engine/exporter";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { loadProject } from "@engine/projectStore";
import type { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// Export options the GUI / an agent may pass. `height` mirrors the CLI
// `--height` flag (max output height); `compression` and `fps` mirror
// `--compression` / `--fps`; everything else stays project-driven.
const ExportRequestSchema = z
  .object({
    compression: z.enum(EXPORT_COMPRESSIONS).optional(),
    fps: z.number().int().min(1).max(120).optional(),
    height: z.number().int().positive().max(4320).optional(),
  })
  .strict();

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;

  // 1. Reject hostile slugs before any path is built.
  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  // 2. Validate the request body.
  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = ExportRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: `invalid export options: ${parsed.error.message}` },
      { status: 400 }
    );
  }

  // 3. Project must exist.
  if (!existsSync(projectPaths(slug).project)) {
    return Response.json(
      { error: `project not found: ${slug}` },
      { status: 404 }
    );
  }

  // 4. Guard against rendering an empty cut before invoking ffmpeg. F2: reads
  // effectiveRanges (dead-air subtraction + snap), not the raw survivingRanges
  // - dead-air subtraction alone can empty an otherwise-nonempty cut, and this
  // guard must agree with what exportCut itself is about to compute or it
  // passes here and throws a 500 there instead of a clean 400. No silences
  // are loaded for this check: VAD snap only shifts existing boundaries
  // inward, never outward (see snapRanges/snapBoundary's no-inversion
  // invariant in src/audio-analysis-core.ts), so it never empties ranges
  // dead-air subtraction alone would have kept - omitting silences here
  // cannot produce a false pass.
  try {
    const project = await loadProject(slug);
    if (effectiveRanges(project).length === 0) {
      return Response.json(
        { error: "nothing to export (all words deleted)" },
        { status: 400 }
      );
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  // 5. Render.
  try {
    const result = await exportCut(slug, {
      compression: parsed.data.compression,
      fps: parsed.data.fps,
      maxHeight: parsed.data.height,
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

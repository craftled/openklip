import { existsSync, readFileSync } from "node:fs";
import {
  assertValidGraphicId,
  graphicCompositionPath,
  loadGraphicManifest,
} from "@engine/graphics";
import { assertValidSlug } from "@engine/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve a graphic template's composition.html + validated manifest in one shot
// so the preview overlay (web/components/graphic-overlay.tsx) can mount the
// fragment and read its intrinsic width/height/fps. The export path reads the
// same files off disk directly via src/graphics.ts, so preview === export.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ template: string }> }
): Promise<Response> {
  const { template } = await params;
  let id: string;
  try {
    id = assertValidGraphicId(template);
  } catch {
    return new Response("invalid graphic id", { status: 400 });
  }
  const slugParam = new URL(req.url).searchParams.get("slug");
  let slugOpts: { slug: string } | undefined;
  if (slugParam) {
    try {
      assertValidSlug(slugParam);
      slugOpts = { slug: slugParam };
    } catch {
      return new Response("invalid slug", { status: 400 });
    }
  }
  const htmlPath = graphicCompositionPath(id, slugOpts);
  if (!existsSync(htmlPath)) {
    return new Response("not found", { status: 404 });
  }
  try {
    const manifest = loadGraphicManifest(id, slugOpts);
    const html = readFileSync(htmlPath, "utf8");
    return Response.json({ id, manifest, html });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}

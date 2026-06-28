import { existsSync, mkdirSync } from "node:fs";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { revealInFileManager } from "@engine/reveal-path";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

const RevealRequestSchema = z
  .object({
    target: z.enum(["project", "assets"]).default("project"),
  })
  .strict();

export async function POST(req: Request, { params }: RouteParams) {
  const { slug } = await params;

  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const paths = projectPaths(slug);
  if (!existsSync(paths.project)) {
    return Response.json(
      { error: `project not found: ${slug}` },
      { status: 404 }
    );
  }

  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = RevealRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: `invalid reveal options: ${parsed.error.message}` },
      { status: 400 }
    );
  }

  const targetPath = parsed.data.target === "assets" ? paths.assets : paths.dir;
  if (parsed.data.target === "assets" && !existsSync(targetPath)) {
    mkdirSync(targetPath, { recursive: true });
  }

  try {
    await revealInFileManager(targetPath);
    return Response.json({
      ok: true,
      path: targetPath,
      target: parsed.data.target,
    });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message ?? String(e) },
      { status: 500 }
    );
  }
}

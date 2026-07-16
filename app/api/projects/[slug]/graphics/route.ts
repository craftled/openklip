import {
  GraphicManifestSchema,
  listGraphics,
  saveProjectGraphicTemplate,
} from "@engine/graphics";
import { trustGuard } from "@engine/local-trust";
import { assertValidSlug } from "@engine/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;
  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  return Response.json({ graphics: listGraphics({ slug }) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  const { slug } = await params;
  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { error: "expected multipart form data" },
      { status: 400 }
    );
  }

  const idRaw = form.get("id");
  const manifestFile = form.get("manifest");
  const compositionFile = form.get("composition");
  if (typeof idRaw !== "string" || !idRaw.trim()) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }
  if (!(manifestFile instanceof File && compositionFile instanceof File)) {
    return Response.json(
      { error: "manifest and composition files are required" },
      { status: 400 }
    );
  }

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(await manifestFile.text());
  } catch {
    return Response.json(
      { error: "manifest must be valid JSON" },
      { status: 400 }
    );
  }

  const parsed = GraphicManifestSchema.safeParse(manifestJson);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }
  if (parsed.data.id !== idRaw.trim()) {
    return Response.json(
      { error: "manifest id must match the id field" },
      { status: 400 }
    );
  }

  try {
    const graphic = await saveProjectGraphicTemplate(
      slug,
      parsed.data,
      await compositionFile.text()
    );
    return Response.json({ graphic, graphics: listGraphics({ slug }) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

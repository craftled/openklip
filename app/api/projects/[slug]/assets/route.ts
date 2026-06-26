import {
  type AssetKind,
  AssetKindSchema,
  type Asset,
} from "@engine/edl";
import { listAssetsByKind, registerAssetBytes } from "@engine/assets";
import { loadProject } from "@engine/projectStore";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  try {
    const project = await loadProject(slug);
    return Response.json({
      assets: project.assets,
      byKind: listAssetsByKind(project.assets),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "missing file field" }, { status: 400 });
    }
    const kindRaw = form.get("kind");
    let kind: AssetKind | undefined;
    if (typeof kindRaw === "string" && kindRaw.length > 0) {
      const parsed = AssetKindSchema.safeParse(kindRaw);
      if (!parsed.success) {
        return Response.json({ error: "invalid kind" }, { status: 400 });
      }
      kind = parsed.data;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const asset = await registerAssetBytes(slug, file.name, bytes, kind);
    const project = await loadProject(slug);
    return Response.json({
      asset,
      assets: project.assets,
      byKind: listAssetsByKind(project.assets),
    } satisfies {
      asset: Asset;
      assets: Asset[];
      byKind: ReturnType<typeof listAssetsByKind>;
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

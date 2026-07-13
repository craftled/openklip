import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadCam } from "@engine/cams";
import { assertValidSlug, camDir } from "@engine/paths";
import { serveRange } from "@engine/serveRange";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string; camId: string }>;
}

function assertCamId(camId: string): Response | undefined {
  if (!camId || camId.includes("/") || camId.includes("..")) {
    return Response.json({ error: "invalid cam id" }, { status: 400 });
  }
  try {
    assertValidSlug(camId);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { slug, camId } = await params;

  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const camErr = assertCamId(camId);
  if (camErr) {
    return camErr;
  }

  try {
    const cam = await loadCam(slug, camId);
    const fp = join(camDir(slug, camId), cam.proxy);
    if (!existsSync(fp)) {
      return new Response("not found", { status: 404 });
    }
    return serveRange(req, fp, "video/mp4");
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes("cam not found")) {
      return new Response("not found", { status: 404 });
    }
    if (message.includes("project not found")) {
      return new Response("not found", { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

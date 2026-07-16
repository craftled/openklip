import { type BlankAspect, ingestBlank } from "@engine/blank-ingest";
import { trustGuard } from "@engine/local-trust";
import { assertValidSlug } from "@engine/paths";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  let body: {
    slug?: string;
    durationSec?: number;
    aspect?: BlankAspect;
    fps?: number;
    color?: string;
    force?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (body.slug) {
    try {
      assertValidSlug(body.slug);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  try {
    const slug = await ingestBlank({
      slug: body.slug,
      durationSec: body.durationSec,
      aspect: body.aspect,
      fps: body.fps,
      color: body.color,
      force: body.force,
    });
    return Response.json({ slug });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

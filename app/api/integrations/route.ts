import {
  clearElevenLabsApiKey,
  readIntegrationsStatus,
  setElevenLabsApiKey,
  testElevenLabsApiKey,
} from "@engine/integrations-config";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SaveIntegrationsRequestSchema = z
  .object({
    elevenLabsApiKey: z.string().trim().min(1),
  })
  .strict();

const TestIntegrationsRequestSchema = z
  .object({
    elevenLabsApiKey: z.string().trim().optional(),
  })
  .strict();

export function GET(): Response {
  return Response.json(readIntegrationsStatus());
}

export async function PUT(req: Request): Promise<Response> {
  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = SaveIntegrationsRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: `invalid integrations request: ${parsed.error.message}` },
      { status: 400 }
    );
  }

  try {
    return Response.json(setElevenLabsApiKey(parsed.data.elevenLabsApiKey));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = TestIntegrationsRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: `invalid integrations request: ${parsed.error.message}` },
      { status: 400 }
    );
  }

  return Response.json({
    elevenLabs: await testElevenLabsApiKey(parsed.data.elevenLabsApiKey),
  });
}

export function DELETE(): Response {
  try {
    return Response.json(clearElevenLabsApiKey());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

import {
  clearElevenLabsApiKey,
  clearReveApiKey,
  clearXaiApiKey,
  readIntegrationsStatus,
  setElevenLabsApiKey,
  setReveApiKey,
  setXaiApiKey,
  testElevenLabsApiKey,
  testReveApiKey,
  testXaiApiKey,
} from "@engine/integrations-config";
import { trustGuard } from "@engine/local-trust";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SaveIntegrationsRequestSchema = z
  .object({
    elevenLabsApiKey: z.string().trim().min(1).optional(),
    reveApiKey: z.string().trim().min(1).optional(),
    xaiApiKey: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine(
    (data) =>
      Boolean(data.elevenLabsApiKey || data.reveApiKey || data.xaiApiKey),
    "at least one provider API key is required"
  );

const TestIntegrationsRequestSchema = z
  .object({
    provider: z.enum(["elevenLabs", "reve", "xai"]).optional(),
    elevenLabsApiKey: z.string().trim().optional(),
    reveApiKey: z.string().trim().optional(),
    xaiApiKey: z.string().trim().optional(),
  })
  .strict();

async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  return text ? JSON.parse(text) : {};
}

export function GET(): Response {
  return Response.json(readIntegrationsStatus());
}

export async function PUT(req: Request): Promise<Response> {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  let raw: unknown = {};
  try {
    raw = await readJsonBody(req);
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
    let status = readIntegrationsStatus();
    if (parsed.data.elevenLabsApiKey) {
      status = setElevenLabsApiKey(parsed.data.elevenLabsApiKey);
    }
    if (parsed.data.reveApiKey) {
      status = setReveApiKey(parsed.data.reveApiKey);
    }
    if (parsed.data.xaiApiKey) {
      status = setXaiApiKey(parsed.data.xaiApiKey);
    }
    return Response.json(status);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  let raw: unknown = {};
  try {
    raw = await readJsonBody(req);
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

  const provider =
    parsed.data.provider ??
    (parsed.data.xaiApiKey
      ? "xai"
      : parsed.data.reveApiKey
        ? "reve"
        : "elevenLabs");

  if (provider === "reve") {
    return Response.json({
      reve: await testReveApiKey(parsed.data.reveApiKey),
    });
  }

  if (provider === "xai") {
    return Response.json({
      xai: await testXaiApiKey(parsed.data.xaiApiKey),
    });
  }

  return Response.json({
    elevenLabs: await testElevenLabsApiKey(parsed.data.elevenLabsApiKey),
  });
}

export function DELETE(req: Request): Response {
  const denied = trustGuard(req);
  if (denied) {
    return denied;
  }
  const provider = new URL(req.url).searchParams.get("provider");
  try {
    if (provider === "reve") {
      return Response.json(clearReveApiKey());
    }
    if (provider === "xai") {
      return Response.json(clearXaiApiKey());
    }
    return Response.json(clearElevenLabsApiKey());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

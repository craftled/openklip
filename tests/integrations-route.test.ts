import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET as GET_DETAILS } from "../app/api/integrations/details/route.ts";
import { DELETE, GET, POST, PUT } from "../app/api/integrations/route.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function withTempRepo<T>(fn: () => T | Promise<T>): Promise<T> {
  const prevCwd = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), "openklip-integrations-route-"));
  process.chdir(temp);
  try {
    return await fn();
  } finally {
    process.chdir(prevCwd);
    rmSync(temp, { recursive: true, force: true });
  }
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/integrations", () => {
  test("saves and clears ElevenLabs status without returning the key", async () => {
    await withTempRepo(async () => {
      const saved = await PUT(jsonRequest({ elevenLabsApiKey: "secret-key" }));
      expect(saved.status).toBe(200);
      expect(await saved.json()).toEqual({
        elevenLabs: {
          hasApiKey: true,
          keyPreview: expect.any(String),
          updatedAt: expect.any(String),
        },
      });

      const status = GET();
      expect(await status.json()).toEqual({
        elevenLabs: {
          hasApiKey: true,
          keyPreview: expect.any(String),
          updatedAt: expect.any(String),
        },
      });

      const cleared = DELETE();
      expect(cleared.status).toBe(200);
      expect(await cleared.json()).toEqual({
        elevenLabs: {
          hasApiKey: false,
          keyPreview: null,
          updatedAt: null,
        },
      });
    });
  });

  test("rejects malformed save requests", async () => {
    await withTempRepo(async () => {
      const res = await PUT(jsonRequest({ elevenLabsApiKey: "" }));

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain("invalid integrations request");
    });
  });

  test("tests either a typed key or the saved key", async () => {
    await withTempRepo(async () => {
      const seenKeys: string[] = [];
      globalThis.fetch = (async (_input, init) => {
        await Promise.resolve();
        seenKeys.push(new Headers(init?.headers).get("xi-api-key") ?? "");
        return Response.json([]);
      }) as typeof fetch;

      await PUT(jsonRequest({ elevenLabsApiKey: "saved-key" }));
      const typed = await POST(jsonRequest({ elevenLabsApiKey: "typed-key" }));
      const saved = await POST(jsonRequest({}));

      expect((await typed.json()).elevenLabs.ok).toBe(true);
      expect((await saved.json()).elevenLabs.ok).toBe(true);
      expect(seenKeys).toEqual(["typed-key", "saved-key"]);
    });
  });

  test("details route returns normalized account data", async () => {
    await withTempRepo(async () => {
      await PUT(jsonRequest({ elevenLabsApiKey: "saved-key" }));
      globalThis.fetch = (async (input) => {
        await Promise.resolve();
        const url = String(input);
        if (url.endsWith("/v1/user")) {
          return Response.json({
            subscription: {
              tier: "creator",
              status: "active",
              character_count: 3,
              character_limit: 10,
              voice_slots_used: 1,
              voice_limit: 30,
            },
          });
        }
        if (url.endsWith("/v1/models")) {
          return Response.json([{ model_id: "m" }]);
        }
        return Response.json({
          total_count: 1,
          voices: [{ name: "Tomas voice" }],
        });
      }) as typeof fetch;

      const res = await GET_DETAILS();

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        elevenLabs: {
          characterCount: 3,
          characterLimit: 10,
          characterResetAt: null,
          modelCount: 1,
          status: "active",
          tier: "creator",
          voiceCount: 1,
          voiceLimit: 30,
          voiceSlotsUsed: 1,
          voices: ["Tomas voice"],
        },
      });
    });
  });
});

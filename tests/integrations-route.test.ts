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

function deleteRequest(provider?: string): Request {
  const url = provider
    ? `http://localhost/api/integrations?provider=${provider}`
    : "http://localhost/api/integrations";
  return new Request(url, { method: "DELETE" });
}

const EMPTY_PROVIDER = {
  hasApiKey: false,
  keyPreview: null,
  updatedAt: null,
};

const EMPTY_STATUS = {
  elevenLabs: EMPTY_PROVIDER,
  reve: EMPTY_PROVIDER,
  xai: EMPTY_PROVIDER,
};

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
        reve: EMPTY_PROVIDER,
        xai: EMPTY_PROVIDER,
      });

      const status = GET();
      expect(await status.json()).toEqual({
        elevenLabs: {
          hasApiKey: true,
          keyPreview: expect.any(String),
          updatedAt: expect.any(String),
        },
        reve: EMPTY_PROVIDER,
        xai: EMPTY_PROVIDER,
      });

      const cleared = DELETE(deleteRequest());
      expect(cleared.status).toBe(200);
      expect(await cleared.json()).toEqual(EMPTY_STATUS);
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

      const res = await GET_DETAILS(
        new Request("http://localhost/api/integrations/details")
      );

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

  test("saves, tests, and clears the Reve key independently", async () => {
    await withTempRepo(async () => {
      const seenAuth: string[] = [];
      globalThis.fetch = (async (input, init) => {
        await Promise.resolve();
        expect(String(input)).toBe("https://api.reve.com/v1/image/create");
        seenAuth.push(new Headers(init?.headers).get("authorization") ?? "");
        // Valid key: schema-valid but out-of-range probe → 400, not billed.
        return Response.json(
          { error_code: "INVALID_PARAMETER_VALUE" },
          {
            status: 400,
          }
        );
      }) as typeof fetch;

      const saved = await PUT(jsonRequest({ reveApiKey: "reve-secret" }));
      expect(await saved.json()).toEqual({
        elevenLabs: EMPTY_PROVIDER,
        reve: {
          hasApiKey: true,
          keyPreview: expect.any(String),
          updatedAt: expect.any(String),
        },
        xai: EMPTY_PROVIDER,
      });

      const tested = await POST(jsonRequest({ provider: "reve" }));
      const testJson = await tested.json();
      expect(testJson.reve.ok).toBe(true);
      expect(seenAuth).toEqual(["Bearer reve-secret"]);

      const cleared = DELETE(deleteRequest("reve"));
      expect(await cleared.json()).toEqual(EMPTY_STATUS);
    });
  });

  test("saves, tests, and clears the xAI key independently", async () => {
    await withTempRepo(async () => {
      const seenAuth: string[] = [];
      globalThis.fetch = (async (input, init) => {
        await Promise.resolve();
        expect(String(input)).toBe("https://api.x.ai/v1/tts/voices");
        seenAuth.push(new Headers(init?.headers).get("authorization") ?? "");
        return Response.json({ voices: [{ voice_id: "eve", name: "Eve" }] });
      }) as typeof fetch;

      const saved = await PUT(jsonRequest({ xaiApiKey: "xai-secret" }));
      expect(await saved.json()).toEqual({
        elevenLabs: EMPTY_PROVIDER,
        reve: EMPTY_PROVIDER,
        xai: {
          hasApiKey: true,
          keyPreview: expect.any(String),
          updatedAt: expect.any(String),
        },
      });

      const tested = await POST(
        jsonRequest({ provider: "xai", xaiApiKey: "typed-key" })
      );
      const testJson = await tested.json();
      expect(testJson.xai.ok).toBe(true);
      expect(seenAuth[0]).toBe("Bearer typed-key");

      const cleared = DELETE(deleteRequest("xai"));
      expect(await cleared.json()).toEqual(EMPTY_STATUS);
    });
  });

  test("xAI details route returns normalized voice data", async () => {
    await withTempRepo(async () => {
      await PUT(jsonRequest({ xaiApiKey: "saved-key" }));
      globalThis.fetch = (async (input) => {
        await Promise.resolve();
        const url = String(input);
        if (url.endsWith("/v1/api-key")) {
          return Response.json({
            name: "OpenKlip dev",
            api_key_blocked: false,
            api_key_disabled: false,
            team_blocked: false,
          });
        }
        if (url.includes("/v1/tts/voices")) {
          return Response.json({
            voices: [
              { voice_id: "eve", name: "Eve" },
              { voice_id: "luna", name: "Luna" },
            ],
          });
        }
        return Response.json({
          voices: [{ voice_id: "abc12345", name: "Brand voice" }],
        });
      }) as typeof fetch;

      const res = await GET_DETAILS(
        new Request("http://localhost/api/integrations/details?provider=xai")
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        xai: {
          apiKeyBlocked: false,
          apiKeyDisabled: false,
          apiKeyName: "OpenKlip dev",
          builtinVoiceCount: 2,
          customVoiceCount: 1,
          customVoiceLimit: 30,
          customVoices: ["Brand voice (abc12345)"],
          teamBlocked: false,
          voices: ["Eve (eve)", "Luna (luna)"],
        },
      });
    });
  });

  test("reports an invalid Reve key as rejected", async () => {
    await withTempRepo(async () => {
      globalThis.fetch = (async () => {
        await Promise.resolve();
        return Response.json(
          { error_code: "PARTNER_API_TOKEN_INVALID" },
          {
            status: 401,
          }
        );
      }) as typeof fetch;

      const tested = await POST(
        jsonRequest({ provider: "reve", reveApiKey: "bad-key" })
      );
      const testJson = await tested.json();
      expect(testJson.reve.ok).toBe(false);
      expect(testJson.reve.status).toBe(401);
    });
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearElevenLabsApiKey,
  clearReveApiKey,
  fetchElevenLabsDetails,
  readElevenLabsApiKey,
  readIntegrationsStatus,
  readReveApiKey,
  setElevenLabsApiKey,
  setReveApiKey,
  testElevenLabsApiKey,
  testReveApiKey,
} from "../src/integrations-config.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function withTempRepo<T>(
  fn: (root: string) => T | Promise<T>
): Promise<T> {
  const prevCwd = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), "openklip-integrations-"));
  process.chdir(temp);
  try {
    return await fn(temp);
  } finally {
    process.chdir(prevCwd);
    rmSync(temp, { recursive: true, force: true });
  }
}

describe("integrations config", () => {
  test("stores ElevenLabs keys locally without exposing them in status", async () => {
    await withTempRepo((root) => {
      expect(readIntegrationsStatus().elevenLabs.hasApiKey).toBe(false);

      const status = setElevenLabsApiKey("  test-key  ");

      expect(status.elevenLabs.hasApiKey).toBe(true);
      expect(status.elevenLabs.keyPreview).toBe("••••••••-key");
      expect(status.elevenLabs.keyPreview).not.toContain("test");
      expect(readElevenLabsApiKey()).toBe("test-key");
      expect(readIntegrationsStatus()).not.toHaveProperty("elevenLabs.apiKey");

      const configPath = join(root, ".openklip", "integrations.json");
      expect(existsSync(configPath)).toBe(true);
      expect(readFileSync(configPath, "utf8")).toContain("test-key");
      expect((statSync(configPath).mode & 0o777).toString(8)).toBe("600");
    });
  });

  test("clears saved ElevenLabs keys", async () => {
    await withTempRepo(() => {
      setElevenLabsApiKey("test-key");

      const status = clearElevenLabsApiKey();

      expect(status.elevenLabs.hasApiKey).toBe(false);
      expect(readElevenLabsApiKey()).toBeNull();
    });
  });

  test("tests a key against ElevenLabs using xi-api-key", async () => {
    const calls: Array<{ headers: Headers; url: string }> = [];
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      await Promise.resolve();
      calls.push({
        url: String(input),
        headers: new Headers(init?.headers),
      });
      return Response.json([{ model_id: "eleven_multilingual_v2" }]);
    }) as typeof fetch;

    const result = await testElevenLabsApiKey("secret-key");

    expect(result).toEqual({
      ok: true,
      message: "ElevenLabs accepted this API key.",
      status: 200,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.elevenlabs.io/v1/models");
    expect(calls[0]?.headers.get("xi-api-key")).toBe("secret-key");
  });

  test("maps rejected ElevenLabs keys to a clear failure", async () => {
    globalThis.fetch = (async () =>
      Response.json(
        { detail: "invalid api key" },
        { status: 401 }
      )) as typeof fetch;

    const result = await testElevenLabsApiKey("bad-key");

    expect(result).toEqual({
      ok: false,
      message: "ElevenLabs rejected this API key.",
      status: 401,
    });
  });

  test("fetches account details without returning secret fields", async () => {
    await withTempRepo(async () => {
      setElevenLabsApiKey("saved-key");
      globalThis.fetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit
      ) => {
        await Promise.resolve();
        const headers = new Headers(init?.headers);
        expect(headers.get("xi-api-key")).toBe("saved-key");
        const url = String(input);
        if (url.endsWith("/v1/user")) {
          return Response.json({
            xi_api_key: "must-not-leak",
            subscription: {
              tier: "creator",
              status: "active",
              character_count: 12,
              character_limit: 300_000,
              next_character_count_reset_unix: 1_800_000_000,
              voice_slots_used: 1,
              voice_limit: 30,
            },
          });
        }
        if (url.endsWith("/v1/models")) {
          return Response.json([{ model_id: "a" }, { model_id: "b" }]);
        }
        if (url.includes("/v2/voices")) {
          return Response.json({
            total_count: 2,
            voices: [{ name: "Tomas voice" }, { name: "Bella" }],
          });
        }
        return Response.json({ error: "unexpected url" }, { status: 500 });
      }) as typeof fetch;

      const details = await fetchElevenLabsDetails();

      expect(details).toEqual({
        characterCount: 12,
        characterLimit: 300_000,
        characterResetAt: "2027-01-15T08:00:00.000Z",
        modelCount: 2,
        status: "active",
        tier: "creator",
        voiceCount: 2,
        voiceLimit: 30,
        voiceSlotsUsed: 1,
        voices: ["Tomas voice", "Bella"],
      });
      expect(details).not.toHaveProperty("xi_api_key");
    });
  });

  test("stores and clears Reve keys independently of ElevenLabs", async () => {
    await withTempRepo(() => {
      const saved = setReveApiKey("  reve-secret-key  ");

      expect(saved.reve.hasApiKey).toBe(true);
      expect(saved.reve.keyPreview).toBe("••••••••-key");
      expect(saved.reve.keyPreview).not.toContain("reve-secret");
      expect(saved.elevenLabs.hasApiKey).toBe(false);
      expect(readReveApiKey()).toBe("reve-secret-key");

      const cleared = clearReveApiKey();
      expect(cleared.reve.hasApiKey).toBe(false);
      expect(readReveApiKey()).toBeNull();
    });
  });

  test("verifies a Reve key with a no-cost probe (400 = accepted)", async () => {
    const calls: Array<{ headers: Headers; method: string; url: string }> = [];
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      await Promise.resolve();
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
      });
      // Valid key hits the intentional out-of-range param error, not billing.
      return Response.json(
        { error_code: "INVALID_PARAMETER_VALUE" },
        { status: 400 }
      );
    }) as typeof fetch;

    const result = await testReveApiKey("reve-secret-key");

    expect(result).toEqual({
      ok: true,
      message: "Reve accepted this API key.",
      status: 400,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.reve.com/v1/image/create");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers.get("authorization")).toBe(
      "Bearer reve-secret-key"
    );
  });

  test("maps a rejected Reve key (401) to a clear failure", async () => {
    globalThis.fetch = (async () => {
      await Promise.resolve();
      return Response.json(
        { error_code: "PARTNER_API_TOKEN_INVALID" },
        { status: 401 }
      );
    }) as typeof fetch;

    const result = await testReveApiKey("bad-key");

    expect(result).toEqual({
      ok: false,
      message: "Reve rejected this API key.",
      status: 401,
    });
  });
});

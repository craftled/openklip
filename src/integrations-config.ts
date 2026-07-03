import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { repoPath } from "./repo-paths.ts";

const ProviderConfigSchema = z
  .object({
    apiKey: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .optional();

const IntegrationsConfigSchema = z
  .object({
    elevenLabs: ProviderConfigSchema,
    reve: ProviderConfigSchema,
  })
  .catchall(z.unknown());

export interface ProviderStatus {
  hasApiKey: boolean;
  keyPreview: string | null;
  updatedAt: string | null;
}

export interface IntegrationStatus {
  elevenLabs: ProviderStatus;
  reve: ProviderStatus;
}

function maskApiKey(apiKey: string): string {
  const visible = apiKey.slice(-4);
  return `${"•".repeat(8)}${visible}`;
}

export interface IntegrationTestResult {
  message: string;
  ok: boolean;
  status: number | null;
}

export interface ElevenLabsDetails {
  characterCount: number | null;
  characterLimit: number | null;
  characterResetAt: string | null;
  modelCount: number | null;
  status: string | null;
  tier: string | null;
  voiceCount: number | null;
  voiceLimit: number | null;
  voiceSlotsUsed: number | null;
  voices: string[];
}

function configDir(): string {
  return repoPath(".openklip");
}

function configPath(): string {
  return join(configDir(), "integrations.json");
}

function loadConfig(): z.infer<typeof IntegrationsConfigSchema> {
  const fp = configPath();
  if (!existsSync(fp)) {
    return {};
  }
  try {
    return IntegrationsConfigSchema.parse(JSON.parse(readFileSync(fp, "utf8")));
  } catch {
    return {};
  }
}

function saveConfig(config: z.infer<typeof IntegrationsConfigSchema>): void {
  mkdirSync(configDir(), { recursive: true });
  const fp = configPath();
  writeFileSync(fp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  try {
    chmodSync(fp, 0o600);
  } catch {
    // Best-effort on platforms/filesystems without POSIX permissions.
  }
}

type ProviderId = "elevenLabs" | "reve";

function providerStatus(
  provider?: z.infer<typeof ProviderConfigSchema>
): ProviderStatus {
  const apiKey = provider?.apiKey?.trim();
  return {
    hasApiKey: Boolean(apiKey),
    keyPreview: apiKey ? maskApiKey(apiKey) : null,
    updatedAt: provider?.updatedAt ?? null,
  };
}

export function readIntegrationsStatus(): IntegrationStatus {
  const config = loadConfig();
  return {
    elevenLabs: providerStatus(config.elevenLabs),
    reve: providerStatus(config.reve),
  };
}

function setProviderApiKey(
  provider: ProviderId,
  apiKey: string,
  label: string
): IntegrationStatus {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error(`${label} API key is required`);
  }
  const config = loadConfig();
  config[provider] = {
    apiKey: trimmed,
    updatedAt: new Date().toISOString(),
  };
  saveConfig(config);
  return readIntegrationsStatus();
}

function clearProviderApiKey(provider: ProviderId): IntegrationStatus {
  const config = loadConfig();
  config[provider] = undefined;
  saveConfig(config);
  return readIntegrationsStatus();
}

function readProviderApiKey(provider: ProviderId): string | null {
  const apiKey = loadConfig()[provider]?.apiKey?.trim();
  return apiKey || null;
}

export function setElevenLabsApiKey(apiKey: string): IntegrationStatus {
  return setProviderApiKey("elevenLabs", apiKey, "ElevenLabs");
}

export function clearElevenLabsApiKey(): IntegrationStatus {
  return clearProviderApiKey("elevenLabs");
}

export function readElevenLabsApiKey(): string | null {
  return readProviderApiKey("elevenLabs");
}

export function setReveApiKey(apiKey: string): IntegrationStatus {
  return setProviderApiKey("reve", apiKey, "Reve");
}

export function clearReveApiKey(): IntegrationStatus {
  return clearProviderApiKey("reve");
}

export function readReveApiKey(): string | null {
  return readProviderApiKey("reve");
}

export async function testElevenLabsApiKey(
  apiKey = readElevenLabsApiKey()
): Promise<IntegrationTestResult> {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: "Add an ElevenLabs API key before testing.",
      status: null,
    };
  }

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/models", {
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": trimmed,
      },
    });

    if (res.ok) {
      return {
        ok: true,
        message: "ElevenLabs accepted this API key.",
        status: res.status,
      };
    }

    if (res.status === 401) {
      return {
        ok: false,
        message: "ElevenLabs rejected this API key.",
        status: res.status,
      };
    }

    if (res.status === 403) {
      return {
        ok: false,
        message: "ElevenLabs refused this key or IP for this request.",
        status: res.status,
      };
    }

    return {
      ok: false,
      message: `ElevenLabs test failed with HTTP ${res.status}.`,
      status: res.status,
    };
  } catch (e) {
    return {
      ok: false,
      message: `Could not reach ElevenLabs: ${(e as Error).message}`,
      status: null,
    };
  }
}

/**
 * Verify a Reve API key without spending credits.
 *
 * Reve has no free "get account" endpoint — every documented route is a paid
 * POST image generation. We exploit Reve's validation ordering: a request whose
 * body is schema-valid but semantically out of range (test_time_scaling below
 * its minimum) is checked for auth BEFORE the range is rejected, and the range
 * error fires BEFORE any image is generated or billed. So an invalid key gets
 * 401, and a valid key gets a 400 range error — neither produces an image.
 */
export async function testReveApiKey(
  apiKey = readReveApiKey()
): Promise<IntegrationTestResult> {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: "Add a Reve API key before testing.",
      status: null,
    };
  }

  try {
    const res = await fetch("https://api.reve.com/v1/image/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${trimmed}`,
      },
      // Intentionally invalid: schema-valid so auth is checked, but the negative
      // test_time_scaling is rejected before generation. See doc comment above.
      body: JSON.stringify({
        prompt: "openklip key verification",
        aspect_ratio: "1:1",
        test_time_scaling: -1,
      }),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: "Reve rejected this API key.",
        status: res.status,
      };
    }

    // Anything else (200 success or a 400 for our intentionally invalid body)
    // means the key passed authentication.
    if (res.ok || res.status === 400) {
      return {
        ok: true,
        message: "Reve accepted this API key.",
        status: res.status,
      };
    }

    return {
      ok: false,
      message: `Reve test failed with HTTP ${res.status}.`,
      status: res.status,
    };
  } catch (e) {
    return {
      ok: false,
      message: `Could not reach Reve: ${(e as Error).message}`,
      status: null,
    };
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function fetchElevenLabsJson(
  path: string,
  apiKey: string
): Promise<unknown> {
  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs ${path} failed with HTTP ${res.status}`);
  }
  return await res.json();
}

export async function fetchElevenLabsDetails(): Promise<ElevenLabsDetails> {
  const apiKey = readElevenLabsApiKey();
  if (!apiKey) {
    throw new Error("Add an ElevenLabs API key before loading details.");
  }

  const [userRaw, modelsRaw, voicesRaw] = await Promise.all([
    fetchElevenLabsJson("/v1/user", apiKey),
    fetchElevenLabsJson("/v1/models", apiKey),
    fetchElevenLabsJson("/v2/voices?page_size=5", apiKey),
  ]);

  const user = objectOrNull(userRaw);
  const subscription = objectOrNull(user?.subscription);
  const voicesObj = objectOrNull(voicesRaw);
  const voices = Array.isArray(voicesObj?.voices)
    ? voicesObj.voices
        .map((voice) => stringOrNull(objectOrNull(voice)?.name))
        .filter((name): name is string => Boolean(name))
    : [];
  const resetUnix = numberOrNull(subscription?.next_character_count_reset_unix);

  return {
    characterCount: numberOrNull(subscription?.character_count),
    characterLimit: numberOrNull(subscription?.character_limit),
    characterResetAt: resetUnix
      ? new Date(resetUnix * 1000).toISOString()
      : null,
    modelCount: Array.isArray(modelsRaw) ? modelsRaw.length : null,
    status: stringOrNull(subscription?.status),
    tier: stringOrNull(subscription?.tier),
    voiceCount: numberOrNull(voicesObj?.total_count),
    voiceLimit: numberOrNull(subscription?.voice_limit),
    voiceSlotsUsed: numberOrNull(subscription?.voice_slots_used),
    voices,
  };
}

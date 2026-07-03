export interface ProviderKeyStatus {
  hasApiKey: boolean;
  keyPreview: string | null;
  updatedAt: string | null;
}

export interface IntegrationsStatus {
  elevenLabs: ProviderKeyStatus;
  reve: ProviderKeyStatus;
}

export interface ProviderTestResult {
  message: string;
  ok: boolean;
  status: number | null;
}

export interface IntegrationTestStatus {
  elevenLabs: ProviderTestResult;
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

function providerKeyStatus(
  data: Partial<ProviderKeyStatus> | undefined
): ProviderKeyStatus {
  return {
    hasApiKey: data?.hasApiKey ?? false,
    keyPreview: data?.keyPreview ?? null,
    updatedAt: data?.updatedAt ?? null,
  };
}

function mapStatus(data: Partial<IntegrationsStatus>): IntegrationsStatus {
  return {
    elevenLabs: providerKeyStatus(data.elevenLabs),
    reve: providerKeyStatus(data.reve),
  };
}

async function readStatusResponse(
  res: Response,
  fallback: string
): Promise<IntegrationsStatus> {
  const data = (await res.json()) as Partial<IntegrationsStatus> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `${fallback} (${res.status})`);
  }
  return mapStatus(data);
}

export async function fetchIntegrationsStatus(): Promise<IntegrationsStatus> {
  const res = await fetch("/api/integrations");
  return readStatusResponse(res, "Integrations request failed");
}

export async function saveElevenLabsApiKey(
  elevenLabsApiKey: string
): Promise<IntegrationsStatus> {
  const res = await fetch("/api/integrations", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ elevenLabsApiKey }),
  });
  return readStatusResponse(res, "Save integration failed");
}

export async function clearElevenLabsApiKey(): Promise<IntegrationsStatus> {
  const res = await fetch("/api/integrations", { method: "DELETE" });
  return readStatusResponse(res, "Clear integration failed");
}

export async function testElevenLabsApiKey(
  elevenLabsApiKey?: string
): Promise<IntegrationTestStatus> {
  const res = await fetch("/api/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(elevenLabsApiKey?.trim() ? { elevenLabsApiKey } : {}),
  });
  const data = (await res.json()) as Partial<IntegrationTestStatus> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `Test integration failed (${res.status})`);
  }
  return {
    elevenLabs: {
      ok: data.elevenLabs?.ok ?? false,
      message: data.elevenLabs?.message ?? "ElevenLabs test did not run.",
      status: data.elevenLabs?.status ?? null,
    },
  };
}

export async function saveReveApiKey(
  reveApiKey: string
): Promise<IntegrationsStatus> {
  const res = await fetch("/api/integrations", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reveApiKey }),
  });
  return readStatusResponse(res, "Save integration failed");
}

export async function clearReveApiKey(): Promise<IntegrationsStatus> {
  const res = await fetch("/api/integrations?provider=reve", {
    method: "DELETE",
  });
  return readStatusResponse(res, "Clear integration failed");
}

export async function testReveApiKey(
  reveApiKey?: string
): Promise<ProviderTestResult> {
  const res = await fetch("/api/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      reveApiKey?.trim()
        ? { provider: "reve", reveApiKey }
        : { provider: "reve" }
    ),
  });
  const data = (await res.json()) as {
    reve?: Partial<ProviderTestResult>;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `Test integration failed (${res.status})`);
  }
  return {
    ok: data.reve?.ok ?? false,
    message: data.reve?.message ?? "Reve test did not run.",
    status: data.reve?.status ?? null,
  };
}

export async function fetchElevenLabsDetails(): Promise<ElevenLabsDetails> {
  const res = await fetch("/api/integrations/details");
  const data = (await res.json()) as {
    elevenLabs?: Partial<ElevenLabsDetails>;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      data.error ?? `Load integration details failed (${res.status})`
    );
  }
  return {
    characterCount: data.elevenLabs?.characterCount ?? null,
    characterLimit: data.elevenLabs?.characterLimit ?? null,
    characterResetAt: data.elevenLabs?.characterResetAt ?? null,
    modelCount: data.elevenLabs?.modelCount ?? null,
    status: data.elevenLabs?.status ?? null,
    tier: data.elevenLabs?.tier ?? null,
    voiceCount: data.elevenLabs?.voiceCount ?? null,
    voiceLimit: data.elevenLabs?.voiceLimit ?? null,
    voiceSlotsUsed: data.elevenLabs?.voiceSlotsUsed ?? null,
    voices: data.elevenLabs?.voices ?? [],
  };
}

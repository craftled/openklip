export interface IntegrationsStatus {
  elevenLabs: {
    hasApiKey: boolean;
    updatedAt: string | null;
  };
}

export interface IntegrationTestStatus {
  elevenLabs: {
    ok: boolean;
    message: string;
    status: number | null;
  };
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

export async function fetchIntegrationsStatus(): Promise<IntegrationsStatus> {
  const res = await fetch("/api/integrations");
  const data = (await res.json()) as Partial<IntegrationsStatus> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      data.error ?? `Integrations request failed (${res.status})`
    );
  }
  return {
    elevenLabs: {
      hasApiKey: data.elevenLabs?.hasApiKey ?? false,
      updatedAt: data.elevenLabs?.updatedAt ?? null,
    },
  };
}

export async function saveElevenLabsApiKey(
  elevenLabsApiKey: string
): Promise<IntegrationsStatus> {
  const res = await fetch("/api/integrations", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ elevenLabsApiKey }),
  });
  const data = (await res.json()) as Partial<IntegrationsStatus> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `Save integration failed (${res.status})`);
  }
  return {
    elevenLabs: {
      hasApiKey: data.elevenLabs?.hasApiKey ?? false,
      updatedAt: data.elevenLabs?.updatedAt ?? null,
    },
  };
}

export async function clearElevenLabsApiKey(): Promise<IntegrationsStatus> {
  const res = await fetch("/api/integrations", { method: "DELETE" });
  const data = (await res.json()) as Partial<IntegrationsStatus> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `Clear integration failed (${res.status})`);
  }
  return {
    elevenLabs: {
      hasApiKey: data.elevenLabs?.hasApiKey ?? false,
      updatedAt: data.elevenLabs?.updatedAt ?? null,
    },
  };
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

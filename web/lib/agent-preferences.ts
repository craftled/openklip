export const DEFAULT_AGENT_MODEL = "claude-opus-4-8";

export const AGENT_MODEL_GROUPS = [
  {
    id: "claude",
    label: "Claude · Max",
    models: [
      { value: "claude-opus-4-8", label: "Opus 4.8" },
      { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
      { value: "claude-haiku-4-5", label: "Haiku 4.5" },
    ],
  },
  {
    id: "codex",
    label: "Codex · ChatGPT",
    models: [
      { value: "gpt-5-5", label: "GPT-5.5" },
      { value: "gpt-5-4", label: "GPT-5.4" },
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    models: [{ value: "composer-2-5", label: "Composer 2.5" }],
  },
  {
    id: "grok",
    label: "xAI · SuperGrok",
    models: [{ value: "grok-build", label: "Grok Build" }],
  },
] as const;

export type AgentModelId =
  (typeof AGENT_MODEL_GROUPS)[number]["models"][number]["value"];

const AGENT_MODEL_IDS = new Set<string>(
  AGENT_MODEL_GROUPS.flatMap((g) => g.models.map((m) => m.value))
);

const STORAGE_KEY = "openklip-default-agent";

const listeners = new Set<(model: AgentModelId) => void>();

function isAgentModelId(value: string): value is AgentModelId {
  return AGENT_MODEL_IDS.has(value);
}

export function getAgentModelLabel(id: string): string {
  for (const group of AGENT_MODEL_GROUPS) {
    const match = group.models.find((m) => m.value === id);
    if (match) {
      return match.label;
    }
  }
  return id;
}

export function getDefaultAgentModel(): AgentModelId {
  if (typeof window === "undefined") {
    return DEFAULT_AGENT_MODEL;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isAgentModelId(stored)) {
      return stored;
    }
  } catch {
    // ignore unavailable storage
  }
  return DEFAULT_AGENT_MODEL;
}

export function setDefaultAgentModel(model: AgentModelId): void {
  try {
    localStorage.setItem(STORAGE_KEY, model);
  } catch {
    // ignore quota / private mode
  }
  for (const listener of listeners) {
    listener(model);
  }
}

export function subscribeDefaultAgent(
  listener: (model: AgentModelId) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: clear subscribers and stored default between cases. */
export function resetDefaultAgentForTests(): void {
  listeners.clear();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore unavailable storage
    }
  }
}

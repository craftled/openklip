/** Client-safe author display helpers (no node:fs imports). */

/** Known agent model slugs for display labels (mirrors web/lib/agent-preferences). */
const MODEL_LABELS: Readonly<Record<string, string>> = {
  "claude-opus-4-8": "Opus 4.8",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5": "Haiku 4.5",
  "gpt-5-5": "GPT-5.5",
  "gpt-5-4": "GPT-5.4",
  "composer-2-5": "Composer 2.5",
  "grok-build": "Grok Build",
};

/** Human-readable label for an authorId or model slug. */
export function authorDisplayLabel(authorIdOrModel: string): string {
  if (MODEL_LABELS[authorIdOrModel]) {
    return MODEL_LABELS[authorIdOrModel];
  }
  const parts = authorIdOrModel.split(":");
  const last = parts.at(-1);
  if (last && MODEL_LABELS[last]) {
    return MODEL_LABELS[last];
  }
  if (authorIdOrModel.startsWith("human:")) {
    const name = parts.slice(1).join(":");
    if (name === "local") {
      return "You (editor)";
    }
    if (name === "cli") {
      return "CLI";
    }
    return name || "Human";
  }
  if (authorIdOrModel.startsWith("ai:")) {
    const model = parts.at(-1) ?? authorIdOrModel;
    return MODEL_LABELS[model] ?? model;
  }
  return authorIdOrModel;
}

/** CSS tone class key for author highlighting (human vs agent vs cli). */
export function authorToneClass(
  authorId: string
): "human" | "agent" | "cli" | "other" {
  if (authorId.startsWith("human:")) {
    return "human";
  }
  if (authorId.startsWith("ai:")) {
    return "agent";
  }
  if (authorId.startsWith("cli:")) {
    return "cli";
  }
  return "other";
}

/** authorId for explicit GUI human edits (matches server guiMutateMeta). */
export const GUI_HUMAN_AUTHOR_ID = "human:local";

/** Optimistic word-level provenance for GUI edit-words saves. */
export function stampGuiWordProvenance<
  T extends {
    id: string;
    authoredAt?: number;
    authoredBy?: string;
    authoredRevision?: number;
    authoredTaskId?: string;
  },
>(words: T[], wordIds: Iterable<string>, revisionAfter: number): T[] {
  const idSet = new Set(wordIds);
  const at = Date.now();
  return words.map((word) => {
    if (!idSet.has(word.id)) {
      return word;
    }
    const { authoredTaskId: _drop, ...rest } = word;
    return {
      ...rest,
      authoredBy: GUI_HUMAN_AUTHOR_ID,
      authoredAt: at,
      authoredRevision: revisionAfter,
    };
  });
}

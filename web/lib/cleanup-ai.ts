import type { CleanupCandidate } from "@engine/cleanup";

export type AiCleanupCategory = "hesitation" | "hedging" | "repeat";

export interface AiCleanupWord {
  category: AiCleanupCategory;
  endSec: number;
  id: string;
  startSec: number;
  text: string;
}

export function aiCleanupWordToCandidate(
  word: AiCleanupWord
): CleanupCandidate {
  return {
    category: word.category,
    endSec: word.endSec,
    estSavedSec: Math.max(0, word.endSec - word.startSec),
    id: `ai-${word.id}`,
    kind: "filler",
    reason: "AI-suggested cut",
    risk: "review",
    startSec: word.startSec,
    text: word.text,
    wordIds: [word.id],
  };
}

export function aiCleanupWordsToCandidates(
  words: readonly AiCleanupWord[]
): CleanupCandidate[] {
  return words.map(aiCleanupWordToCandidate);
}

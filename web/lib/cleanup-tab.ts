import type {
  CleanupCandidate,
  CleanupCandidateCategory,
} from "@engine/cleanup";

export const CLEANUP_LIST_CATEGORY_ORDER = [
  "hesitation",
  "hedging",
  "repeat",
  "dead-air",
] as const satisfies readonly CleanupCandidateCategory[];

export type ToggleableCleanupCategory = "hesitation" | "hedging" | "repeat";

export const CATEGORY_CARD_META: Record<
  ToggleableCleanupCategory,
  { subtitle: string; title: string }
> = {
  hesitation: {
    title: "Hesitations",
    subtitle: '"Um", "Uh", "Er"',
  },
  hedging: {
    title: "Hedging",
    subtitle: '"You know", "Sort of", "I mean"',
  },
  repeat: {
    title: "Repeats",
    subtitle: "Repeated words and false starts",
  },
};

export const CATEGORY_HEADING_LABELS: Record<CleanupCandidateCategory, string> =
  {
    hesitation: "Hesitations",
    hedging: "Hedging",
    repeat: "Repeats",
    "dead-air": "Dead air",
  };

export interface CleanupUndoSnapshot {
  deadAirSpanIds: string[];
  wordIds: string[];
}

export function buildCleanupConfigPatch(
  category: ToggleableCleanupCategory,
  enabled: boolean
): Partial<Record<ToggleableCleanupCategory, boolean>> {
  return { [category]: enabled };
}

export function groupCandidatesByCategory(
  candidates: CleanupCandidate[]
): { candidates: CleanupCandidate[]; category: CleanupCandidateCategory }[] {
  const byCategory = new Map<CleanupCandidateCategory, CleanupCandidate[]>();
  for (const category of CLEANUP_LIST_CATEGORY_ORDER) {
    byCategory.set(category, []);
  }
  for (const candidate of candidates) {
    byCategory.get(candidate.category)?.push(candidate);
  }
  return CLEANUP_LIST_CATEGORY_ORDER.map((category) => ({
    category,
    candidates: byCategory.get(category) ?? [],
  })).filter((group) => group.candidates.length > 0);
}

export function exampleSnippetsForCategory(
  candidates: CleanupCandidate[],
  category: CleanupCandidateCategory,
  limit = 2
): string[] {
  return candidates
    .filter((candidate) => candidate.category === category && candidate.text)
    .slice(0, limit)
    .map((candidate) => candidate.text);
}

export function undoItemCount(undo: CleanupUndoSnapshot): number {
  return undo.wordIds.length + undo.deadAirSpanIds.length;
}

export async function runToggleCleanupCategory(
  slug: string,
  category: ToggleableCleanupCategory,
  enabled: boolean,
  runAction: (
    slug: string,
    action: string,
    input: unknown
  ) => Promise<{ ok: boolean }>
): Promise<{ ok: boolean }> {
  return await runAction(
    slug,
    "cleanup-config",
    buildCleanupConfigPatch(category, enabled)
  );
}

export async function runApplyEnabledCleanup(
  slug: string,
  runAction: (
    slug: string,
    action: string,
    input: unknown
  ) => Promise<{ ok: boolean }>
): Promise<{ ok: boolean }> {
  return await runAction(slug, "cleanup-apply", { mode: "enabled" });
}

export async function runUndoLastCleanup(
  slug: string,
  undo: CleanupUndoSnapshot,
  runAction: (
    slug: string,
    action: string,
    input: unknown
  ) => Promise<{ ok: boolean }>
): Promise<{ ok: boolean }[]> {
  const results: { ok: boolean }[] = [];
  if (undo.wordIds.length > 0) {
    results.push(
      await runAction(slug, "cut", { ids: undo.wordIds, deleted: false })
    );
  }
  for (const id of undo.deadAirSpanIds) {
    results.push(await runAction(slug, "dead-air-rm", { id }));
  }
  return results;
}

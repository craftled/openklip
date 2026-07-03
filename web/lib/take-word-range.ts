// Pure click-to-range helper for the takes browser (web/components/takes-panel.tsx):
// click one word as the start anchor, click a second word to close the range,
// and resolve the pair into an inclusive {startWordId, endWordId} span. Kept
// free of React and of any take/project shape beyond {id} so it is trivially
// unit-testable and reusable if another read-only word-range picker ever needs
// it. This is deliberately its own small helper rather than a reuse of
// web/lib/transcript-edit.ts's WordRange: that helper is index-based and
// tightly coupled to the main editor's cut/restore/reconcile state, whereas a
// take's words are only ever addressed by id (see src/edl.ts's
// AssemblySegmentSchema), never spliced or reconciled here.

export interface WordRangeRef {
  id: string;
}

/**
 * Resolve two clicked word ids into an inclusive range, ordered by the words'
 * position in `words` rather than click order. Reversed clicks (the user
 * clicks the later word first) are swapped instead of rejected: both clicks
 * landed on real, valid words, so there is an unambiguous correct range: no
 * error state is needed, and rejecting would just make the user click again
 * in the other order for the same result.
 *
 * Returns null when either clicked id is not found in `words` (stale
 * selection after the take's transcript changed underneath the click).
 */
export function resolveWordRange<T extends WordRangeRef>(
  words: readonly T[],
  firstClickedId: string,
  secondClickedId: string
): { endWordId: string; startWordId: string } | null {
  const firstIndex = words.findIndex((w) => w.id === firstClickedId);
  const secondIndex = words.findIndex((w) => w.id === secondClickedId);
  if (firstIndex === -1 || secondIndex === -1) {
    return null;
  }
  const [loIndex, hiIndex] =
    firstIndex <= secondIndex
      ? [firstIndex, secondIndex]
      : [secondIndex, firstIndex];
  return { startWordId: words[loIndex].id, endWordId: words[hiIndex].id };
}

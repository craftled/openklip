export interface TranscriptEditWord {
  deleted: boolean;
  id: string;
  text?: string;
}

export type WordRange = readonly [number, number];

export function normalizeWordRange(
  range: WordRange,
  wordCount: number
): WordRange | null {
  if (wordCount <= 0) {
    return null;
  }
  const lo = Math.max(0, Math.min(range[0], range[1]));
  const hi = Math.min(wordCount - 1, Math.max(range[0], range[1]));
  if (hi < lo) {
    return null;
  }
  return [lo, hi];
}

export function setWordRangeDeleted<T extends TranscriptEditWord>(
  words: readonly T[],
  range: WordRange,
  deleted: boolean
): T[] {
  const normalized = normalizeWordRange(range, words.length);
  if (!normalized) {
    return [...words];
  }
  const [lo, hi] = normalized;
  return words.map((word, index) =>
    index >= lo && index <= hi ? { ...word, deleted } : word
  );
}

export function selectedWordStats(
  words: readonly TranscriptEditWord[],
  range: WordRange | null
): { cut: number; kept: number; total: number } {
  const normalized = range ? normalizeWordRange(range, words.length) : null;
  if (!normalized) {
    return { total: 0, kept: 0, cut: 0 };
  }
  const [lo, hi] = normalized;
  let cut = 0;
  for (let index = lo; index <= hi; index++) {
    if (words[index]?.deleted) {
      cut += 1;
    }
  }
  const total = hi - lo + 1;
  return { total, kept: total - cut, cut };
}

interface EditOp {
  editedIndex?: number;
  kind: "delete" | "insert" | "match" | "replace";
  wordIndex?: number;
}

const normalizeToken = (token: string): string =>
  token
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, "")
    .trim();

export function transcriptTextTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * True when `editedText` tokenizes to exactly the words' current text, in
 * order. A contentEditable transcript renders deleted words struck through
 * but still present in the DOM, so a blur with no real edit (or one that
 * only changed whitespace/styling) must not trigger a save: reconcile would
 * otherwise be invoked on unchanged content for no reason.
 */
export function transcriptTextUnchanged<T extends TranscriptEditWord>(
  words: readonly T[],
  editedText: string
): boolean {
  const currentTokens = transcriptTextTokens(
    words.map((word) => word.text ?? "").join(" ")
  );
  const editedTokens = transcriptTextTokens(editedText);
  if (currentTokens.length !== editedTokens.length) {
    return false;
  }
  return currentTokens.every((token, index) => token === editedTokens[index]);
}

export function reconcileTranscriptText<T extends TranscriptEditWord>(
  words: readonly T[],
  editedText: string
): T[] {
  const edited = transcriptTextTokens(editedText);
  const ops = alignTranscriptTokens(
    words.map((word) => word.text ?? ""),
    edited
  );
  const next = words.map((word) => ({ ...word }));
  // lastWordIndex tracks the most recent match/replace target regardless of
  // its deleted flag (used to decide, at the next insert, whether forward
  // folding is safe). lastNonDeletedWordIndex tracks only non-deleted
  // targets, and is the anchor for a trailing insert that never finds a
  // later non-deleted match (backward fold).
  let lastWordIndex: number | null = null;
  let lastNonDeletedWordIndex: number | null = null;
  let pendingPrefix = "";

  for (const op of ops) {
    if (op.kind === "delete" && op.wordIndex !== undefined) {
      next[op.wordIndex] = { ...next[op.wordIndex], deleted: true };
      continue;
    }
    if (
      (op.kind === "match" || op.kind === "replace") &&
      op.wordIndex !== undefined &&
      op.editedIndex !== undefined
    ) {
      // A word being present (matched or with edited text) in the
      // contentEditable is not evidence the user restored it: deleted words
      // stay visible (struck through) alongside kept ones, so every blur
      // would otherwise resurrect every cut. Restoring stays an explicit
      // action (timeline toggle, search restore, cleanup, revert).
      const isDeleted = next[op.wordIndex].deleted;
      if (isDeleted) {
        // A deleted word is never a valid anchor for inserted text: leave
        // pendingPrefix untouched so it keeps accumulating for the next
        // non-deleted match (or the backward fold below).
        next[op.wordIndex] = {
          ...next[op.wordIndex],
          text: edited[op.editedIndex],
        };
      } else {
        next[op.wordIndex] = {
          ...next[op.wordIndex],
          text: `${pendingPrefix} ${edited[op.editedIndex]}`.trim(),
        };
        pendingPrefix = "";
        lastNonDeletedWordIndex = op.wordIndex;
      }
      lastWordIndex = op.wordIndex;
      continue;
    }
    if (op.kind === "insert" && op.editedIndex !== undefined) {
      if (lastWordIndex !== null && !next[lastWordIndex].deleted) {
        next[lastWordIndex] = {
          ...next[lastWordIndex],
          text: `${next[lastWordIndex].text ?? ""} ${edited[op.editedIndex]}`.trim(),
        };
      } else if (next.length > 0) {
        // No safe (non-deleted) anchor yet: accumulate for the next
        // non-deleted match, or the end-of-loop backward fold below.
        pendingPrefix = `${pendingPrefix} ${edited[op.editedIndex]}`.trim();
      }
    }
  }

  if (pendingPrefix) {
    if (lastNonDeletedWordIndex !== null) {
      next[lastNonDeletedWordIndex] = {
        ...next[lastNonDeletedWordIndex],
        text: `${next[lastNonDeletedWordIndex].text ?? ""} ${pendingPrefix}`.trim(),
      };
    } else if (lastWordIndex !== null) {
      // Degenerate case: every word in the transcript is deleted, so there
      // is no non-deleted anchor at all. Fall back to grafting onto the
      // last touched (deleted) word rather than silently dropping the text.
      next[lastWordIndex] = {
        ...next[lastWordIndex],
        text: `${next[lastWordIndex].text ?? ""} ${pendingPrefix}`.trim(),
      };
    }
  }

  return next;
}

function alignTranscriptTokens(original: string[], edited: string[]): EditOp[] {
  const originalNorm = original.map(normalizeToken);
  const editedNorm = edited.map(normalizeToken);
  const dp = Array.from({ length: original.length + 1 }, () =>
    new Array(edited.length + 1).fill(0)
  );

  for (let i = original.length - 1; i >= 0; i--) {
    for (let j = edited.length - 1; j >= 0; j--) {
      dp[i][j] =
        originalNorm[i] === editedNorm[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const matches: Array<{ editedIndex: number; wordIndex: number }> = [];
  let i = 0;
  let j = 0;
  while (i < original.length && j < edited.length) {
    if (originalNorm[i] === editedNorm[j]) {
      matches.push({ wordIndex: i, editedIndex: j });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  const ops: EditOp[] = [];
  let prevWord = -1;
  let prevEdited = -1;
  for (const match of [
    ...matches,
    { wordIndex: original.length, editedIndex: edited.length },
  ]) {
    ops.push(
      ...opsForGap(
        prevWord + 1,
        match.wordIndex,
        prevEdited + 1,
        match.editedIndex
      )
    );
    if (
      match.wordIndex < original.length &&
      match.editedIndex < edited.length
    ) {
      ops.push({
        kind: "match",
        wordIndex: match.wordIndex,
        editedIndex: match.editedIndex,
      });
    }
    prevWord = match.wordIndex;
    prevEdited = match.editedIndex;
  }

  return ops;
}

function opsForGap(
  wordStart: number,
  wordEnd: number,
  editedStart: number,
  editedEnd: number
): EditOp[] {
  const ops: EditOp[] = [];
  const wordCount = wordEnd - wordStart;
  const editedCount = editedEnd - editedStart;
  const replaceCount = Math.min(wordCount, editedCount);

  for (let offset = 0; offset < replaceCount; offset++) {
    ops.push({
      kind: "replace",
      wordIndex: wordStart + offset,
      editedIndex: editedStart + offset,
    });
  }
  for (let offset = replaceCount; offset < wordCount; offset++) {
    ops.push({ kind: "delete", wordIndex: wordStart + offset });
  }
  for (let offset = replaceCount; offset < editedCount; offset++) {
    ops.push({ kind: "insert", editedIndex: editedStart + offset });
  }

  return ops;
}

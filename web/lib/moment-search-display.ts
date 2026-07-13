// Pure view-model helpers for the moment-search Search sidebar panel
// (web/components/moment-search-panel.tsx, web/hooks/use-moment-search.tsx).
// Kept free of engine imports: src/moment-search.ts imports node:fs at
// module scope, so per the client-bundle rule this module never
// value-imports it, even for a constant. Anything shared with the server
// side is duplicated here by hand with a comment, the same way
// src/embed.mjs hand-duplicates FRAME_STEP_SEC from src/scene-log.ts.

export interface TextSnippetWord {
  text: string;
}

export interface TextSnippetMatch {
  range: readonly [number, number];
  text: string;
}

export interface TextSnippet {
  after: string;
  before: string;
  match: string;
}

export type MomentSearchTab = "scene" | "text";

export type MomentIndexBanner = "building" | "error" | "none";

// Sidebar cards cap at this many results per tab; also the `limit` sent to
// the moment-search API. Mirrors DEFAULT_SEARCH_LIMIT in
// src/moment-search.ts (that module cannot be value-imported here).
export const MOMENT_SEARCH_RESULT_LIMIT = 24;

const DEFAULT_SNIPPET_CONTEXT_WORDS = 4;

// m:ss under an hour, h:mm:ss once the clip runs an hour or more.
export function formatClock(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

// Tab-header result count: exact below the limit, "<limit>+" once a search
// hits its cap (the true total beyond the cap is unknown, so a plain number
// would understate it).
export function countBadge(n: number, limit: number): string {
  return n >= limit ? `${limit}+` : `${n}`;
}

// "Text if it has results, else Scene" - the panel recomputes this fresh
// whenever the debounced query changes, letting a manual tab click override
// it until the next query.
export function defaultMomentSearchTab(textCount: number): MomentSearchTab {
  return textCount > 0 ? "text" : "scene";
}

// Which state banner the Scene tab shows: an error (one-shot, until the
// user retries) always wins; otherwise "not indexed yet" reads as
// "building" from the moment the panel mounts, since there is nothing more
// useful to tell the user before the first status poll resolves.
export function momentIndexBanner(
  indexed: boolean,
  errored: boolean
): MomentIndexBanner {
  if (errored) {
    return "error";
  }
  return indexed ? "none" : "building";
}

// /media/frames/<name>?slug=<slug> (see app/media/frames/[name]/route.ts).
// `name` is always one of our own generated NNNN.jpg filenames so it is not
// encoded, matching the frames API route's own URL construction.
export function momentFrameThumbnailUrl(slug: string, name: string): string {
  return `/media/frames/${name}?slug=${encodeURIComponent(slug)}`;
}

// Snippet line for a Text-tab card: the matched phrase (verbatim, from
// PhraseSearchMatch.text) with a few words of surrounding context pulled
// from the full word list via the match's word-index range. Clamped at the
// ends of the transcript.
export function buildTextSnippet(
  words: readonly TextSnippetWord[],
  match: TextSnippetMatch,
  contextWords = DEFAULT_SNIPPET_CONTEXT_WORDS
): TextSnippet {
  const [start, end] = match.range;
  const before = words
    .slice(Math.max(0, start - contextWords), start)
    .map((w) => w.text)
    .join(" ");
  const after = words
    .slice(end + 1, Math.min(words.length, end + 1 + contextWords))
    .map((w) => w.text)
    .join(" ");
  return { before, match: match.text, after };
}

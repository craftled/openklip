import type { Project } from "./edl.ts";
import { samplesToSec } from "./edl.ts";

// Normalize text for phrase matching: lowercase, strip anything that isn't a
// letter/number/space, collapse whitespace.
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PhraseRun {
  fromSec: number;
  ids: string[];
  text: string;
  toSec: number;
}

// Find contiguous runs of kept words whose normalized text matches the phrase.
// Non-mutating: used by cutByText and agent query tools.
export function findPhraseRuns(
  project: Project,
  phrase: string,
  options: { all?: boolean; includeDeleted?: boolean } = {}
): PhraseRun[] {
  const { all = false, includeDeleted = false } = options;
  const target = normalizeText(phrase);
  if (!target) {
    return [];
  }

  const tokens = project.words.map((w) => normalizeText(w.text));
  const targetTokens = target.split(" ");
  const runs: PhraseRun[] = [];
  let i = 0;

  while (i < project.words.length) {
    if (!includeDeleted && project.words[i].deleted) {
      i++;
      continue;
    }

    const matchedIdx: number[] = [];
    let cursor = 0;
    let j = i;
    while (j < project.words.length && cursor < targetTokens.length) {
      if (!includeDeleted && project.words[j].deleted) {
        break;
      }
      const tok = tokens[j];
      if (tok === "") {
        matchedIdx.push(j);
        j++;
        continue;
      }
      if (tok !== targetTokens[cursor]) {
        break;
      }
      matchedIdx.push(j);
      cursor++;
      j++;
    }

    if (cursor === targetTokens.length) {
      while (
        matchedIdx.length > 0 &&
        tokens[matchedIdx[matchedIdx.length - 1]] === ""
      ) {
        matchedIdx.pop();
      }
      if (matchedIdx.length > 0) {
        const first = project.words[matchedIdx[0]];
        const last = project.words[matchedIdx[matchedIdx.length - 1]];
        runs.push({
          ids: matchedIdx.map((k) => project.words[k].id),
          fromSec: samplesToSec(first.startSample),
          toSec: samplesToSec(last.endSample),
          text: matchedIdx.map((k) => project.words[k].text).join(" "),
        });
        if (!all) {
          return runs;
        }
        i = matchedIdx[matchedIdx.length - 1] + 1;
        continue;
      }
    }
    i++;
  }

  return runs;
}

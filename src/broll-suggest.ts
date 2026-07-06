import { type BrollRankResult, rankBrollAssets } from "./broll-rank.ts";
import type { Project } from "./edl.ts";
import { findPhraseRuns, normalizeText } from "./phrase-match.ts";
import { placeFromPhrase } from "./reanchor.ts";

export interface BrollSuggestInput {
  phrase?: string;
  text?: string;
  top?: number;
}

export interface BrollSuggestResult extends BrollRankResult {
  phrase?: {
    matched: boolean;
    fromSec?: number;
    ids?: string[];
    toSec?: number;
  };
}

function phraseQueryText(project: Project, phrase: string): string | undefined {
  const runs = findPhraseRuns(project, phrase, { all: false });
  if (runs.length === 0) {
    return;
  }
  return normalizeText(runs[0].text);
}

export function suggestBroll(
  project: Project,
  input: BrollSuggestInput
): BrollSuggestResult {
  const top = input.top ?? 5;

  if (input.text && input.phrase) {
    return {
      query: "",
      suggestions: [],
      uncarded: [],
      avoided: [],
      warning: "pass only one of text or phrase",
    };
  }

  if (input.phrase) {
    const query = phraseQueryText(project, input.phrase);
    if (!query) {
      const span = placeFromPhrase(project, input.phrase);
      return {
        query: normalizeText(input.phrase),
        suggestions: [],
        uncarded: [],
        avoided: [],
        warning: `no match for phrase "${input.phrase}"`,
        phrase: {
          matched: false,
          fromSec: span.fromSec,
          toSec: span.toSec,
          ids: span.ids,
        },
      };
    }

    const span = placeFromPhrase(project, input.phrase);
    const ranked = rankBrollAssets(project, query, { top });
    return {
      ...ranked,
      query,
      phrase: {
        matched: true,
        fromSec: span.fromSec,
        toSec: span.toSec,
        ids: span.ids,
      },
    };
  }

  const text = input.text?.trim() ?? "";
  const ranked = rankBrollAssets(project, text, { top });
  return ranked;
}

export function formatBrollSuggestHuman(result: BrollSuggestResult): string {
  if (result.warning && result.suggestions.length === 0) {
    return `${result.warning}\n`;
  }

  const lines: string[] = [];
  if (result.query) {
    lines.push(`query: ${result.query}`);
  }
  if (result.phrase) {
    const status = result.phrase.matched ? "matched" : "unmatched";
    lines.push(`phrase: ${status}`);
  }
  if (result.warning) {
    lines.push(`warning: ${result.warning}`);
  }
  if (result.suggestions.length === 0) {
    lines.push("no suggestions");
    return `${lines.join("\n")}\n`;
  }

  for (const [index, item] of result.suggestions.entries()) {
    const reason =
      item.reasons.length > 0 ? ` (${item.reasons.join("; ")})` : "";
    lines.push(`${index + 1}. ${item.assetId} score=${item.score}${reason}`);
  }
  return `${lines.join("\n")}\n`;
}

export function formatBrollSuggestJson(result: BrollSuggestResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

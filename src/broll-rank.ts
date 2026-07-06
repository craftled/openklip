import type { Asset, Project } from "./edl.ts";
import { normalizeText } from "./phrase-match.ts";

const WEIGHT_BEST_FOR = 4;
const WEIGHT_TAGS = 3;
const WEIGHT_SUMMARY = 2;
const WEIGHT_MUST_USE = 10;

export interface BrollRankedSuggestion {
  assetId: string;
  bestFor: string[];
  name: string;
  reasons: string[];
  score: number;
  summary?: string;
  tags: string[];
}

export interface BrollRankResult {
  avoided: string[];
  query: string;
  suggestions: BrollRankedSuggestion[];
  uncarded: string[];
  warning?: string;
}

export interface RankBrollAssetsOptions {
  top?: number;
}

function queryTokens(query: string): string[] {
  return normalizeText(query).split(" ").filter(Boolean);
}

function fieldTokens(text: string): Set<string> {
  return new Set(normalizeText(text).split(" ").filter(Boolean));
}

function matchedInField(tokens: string[], fieldText: string): string[] {
  const field = fieldTokens(fieldText);
  return tokens.filter((token) => field.has(token));
}

function scoreAsset(
  asset: Asset,
  tokens: string[]
): { score: number; reasons: string[] } {
  const card = asset.card;
  if (!card) {
    return { score: 0, reasons: [] };
  }

  let score = 0;
  const reasons: string[] = [];

  for (const entry of card.bestFor) {
    const hits = matchedInField(tokens, entry);
    if (hits.length === 0) {
      continue;
    }
    score += hits.length * WEIGHT_BEST_FOR;
    reasons.push(`bestFor "${entry}": ${hits.join(", ")}`);
  }

  for (const tag of card.tags) {
    const hits = matchedInField(tokens, tag);
    if (hits.length === 0) {
      continue;
    }
    score += hits.length * WEIGHT_TAGS;
    reasons.push(`tag "${tag}": ${hits.join(", ")}`);
  }

  const summaryHits = matchedInField(tokens, card.summary);
  if (summaryHits.length > 0) {
    score += summaryHits.length * WEIGHT_SUMMARY;
    reasons.push(`summary: ${summaryHits.join(", ")}`);
  }

  if (asset.mustUse) {
    score += WEIGHT_MUST_USE;
    reasons.push("mustUse flag");
  }

  return { score, reasons };
}

function isBrollAsset(asset: Asset): boolean {
  return (asset.kind ?? "broll") === "broll";
}

export function rankBrollAssets(
  project: Project,
  query: string,
  options: RankBrollAssetsOptions = {}
): BrollRankResult {
  const tokens = queryTokens(query);
  const top = options.top ?? 5;
  const uncarded: string[] = [];
  const avoided: string[] = [];
  const ranked: BrollRankedSuggestion[] = [];

  for (const asset of project.assets) {
    if (!isBrollAsset(asset)) {
      continue;
    }
    if (asset.avoid) {
      avoided.push(asset.id);
      continue;
    }
    if (!asset.card) {
      uncarded.push(asset.id);
      continue;
    }

    const { score, reasons } = scoreAsset(asset, tokens);
    if (tokens.length > 0 && score === 0) {
      continue;
    }

    ranked.push({
      assetId: asset.id,
      name: asset.name,
      score,
      reasons,
      summary: asset.card.summary,
      tags: asset.card.tags,
      bestFor: asset.card.bestFor,
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.assetId.localeCompare(b.assetId);
  });

  const suggestions =
    tokens.length === 0 ? [] : ranked.slice(0, Math.max(1, top));

  let warning: string | undefined;
  if (uncarded.length > 0) {
    warning = `${uncarded.length} b-roll asset(s) have no card; run: openklip analyze ${project.slug}`;
  }
  if (tokens.length === 0) {
    warning = "query is empty; pass --text or --phrase";
  }

  return {
    query: normalizeText(query),
    suggestions,
    uncarded,
    avoided,
    warning,
  };
}

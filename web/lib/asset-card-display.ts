// Presentation helpers for an asset's subagent "card" in the bin. Pure so the
// formatting is unit tested without rendering. The card itself is produced by
// the analyze pass (src/asset-cards.ts) and rides along on project.assets.

export interface AssetCardLite {
  bestFor?: string[];
  summary: string;
  tags?: string[];
}

// Native-tooltip text for a carded asset: the summary, then a hashtag line of
// tags, then its editorial uses. Lines the browser renders on hover via title.
export function assetCardTooltip(card: AssetCardLite): string {
  const lines = [card.summary.trim()];
  if (card.tags?.length) {
    lines.push(card.tags.map((t) => `#${t}`).join(" "));
  }
  if (card.bestFor?.length) {
    lines.push(`Good for: ${card.bestFor.join(", ")}`);
  }
  return lines.join("\n");
}

// Short one-line caption shown under the asset name once described.
export function assetCardCaption(card: AssetCardLite): string {
  return card.summary.trim();
}

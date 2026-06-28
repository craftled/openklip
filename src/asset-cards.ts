// Per-asset subagents: the deck's "one subagent per scene" applied to the asset
// bin. When media lands in a project (b-roll, stills, images), one agent run per
// asset reads a few reference frames and writes an "asset card" : a structured
// description of what the asset shows and where it belongs. The editing agent
// then places media by meaning (`broll-add-phrase`, `still-add`) instead of
// guessing from a filename. Reuses the user's existing agent subscription via
// runAgentText (no API key), fanned out one call per asset.
//
// Prompt-building, reply-parsing, and card-line rendering are pure and unit
// tested; only frame extraction (ffmpeg) and the agent spawn touch the world.

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { runAgentText } from "./agent-driver.ts";
import {
  type Asset,
  type AssetCard,
  type AssetKind,
  type Project,
  SAMPLE_RATE,
} from "./edl.ts";
import { FFMPEG, run } from "./ffmpeg.ts";
import { projectPaths } from "./paths.ts";

// Kinds we can describe from visual frames today. Music needs real audio
// analysis (out of scope for the MVP slice), so it is skipped, not faked.
const CARDABLE_KINDS: ReadonlySet<AssetKind> = new Set(["broll", "still"]);

// Where in a clip to sample reference frames (fractions of its duration). Three
// frames catch the open, middle, and close without a heavy extract.
const SAMPLE_FRACTIONS = [0.2, 0.5, 0.8] as const;

const DEFAULT_CONCURRENCY = 4;

export function isCardableKind(kind: AssetKind): boolean {
  return CARDABLE_KINDS.has(kind);
}

/** True when an asset is analyzable but has no card yet. */
export function needsCard(asset: Asset): boolean {
  return isCardableKind(asset.kind ?? "broll") && !asset.card;
}

export function assetsNeedingCards(project: Project): Asset[] {
  return project.assets.filter(needsCard);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// Self-contained per-asset prompt. The model is told to describe ONLY what it
// can actually see in the referenced frames and to return an empty summary if it
// cannot read them : that way a blind run degrades to "skipped", never to a
// hallucinated card. JSON only, so the reply parses without prose-stripping.
export function buildAssetCardPrompt(
  asset: { durationSamples: number; kind: AssetKind; name: string },
  framePaths: string[]
): string {
  const durationSec = (asset.durationSamples / SAMPLE_RATE).toFixed(1);
  const focusLine =
    asset.kind === "still"
      ? ' Also include "suggestedFocus":{"x":0-1,"y":0-1} marking the visual center of interest for a Ken Burns push-in.'
      : "";
  const frames = framePaths.length
    ? `\n\nReference frame image file(s) : read each one to view it:\n${framePaths
        .map((p) => `- ${p}`)
        .join("\n")}`
    : "";
  return `You are cataloguing a media asset for a video editor. It is a ${asset.kind} named "${asset.name}" (~${durationSec}s). Look at the reference frame(s) and return ONLY a JSON object an editor can use to decide where to place it:
{"summary":"one concise sentence of what is visually shown","tags":["3-8 short lowercase keywords"],"bestFor":["1-4 editorial uses like intro, b-roll cover, location-setup, transition, outro"]}.${focusLine}
Base the description ONLY on what you can actually see in the frames. If you cannot read the frame files, reply with {"summary":""}. Respond with JSON only: no prose, no code fence.${frames}`;
}

// Parse the model's JSON reply into the descriptive part of a card (no
// timestamp/agent yet). Returns null on garbage or an empty summary, so callers
// can skip rather than store a useless card. Mirrors parseCutIds: direct parse
// first, then a permissive brace match for fenced/prose-wrapped replies.
export function parseAssetCard(
  text: string
): Pick<AssetCard, "bestFor" | "suggestedFocus" | "summary" | "tags"> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s) as unknown;
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const braceMatch = text.match(/\{[\s\S]*\}/);
  const obj =
    tryParse(text.trim()) ?? (braceMatch ? tryParse(braceMatch[0]) : null);
  if (!obj || typeof obj.summary !== "string" || !obj.summary.trim()) {
    return null;
  }
  const strArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
      : [];
  const card: Pick<
    AssetCard,
    "bestFor" | "suggestedFocus" | "summary" | "tags"
  > = {
    summary: obj.summary.trim(),
    tags: strArr(obj.tags),
    bestFor: strArr(obj.bestFor),
  };
  const focus = obj.suggestedFocus;
  if (focus && typeof focus === "object") {
    const fx = (focus as Record<string, unknown>).x;
    const fy = (focus as Record<string, unknown>).y;
    if (typeof fx === "number" && typeof fy === "number") {
      card.suggestedFocus = { x: clamp01(fx), y: clamp01(fy) };
    }
  }
  return card;
}

// Render analyzed assets as compact lines for the editing prompt, so the model
// can match spoken content to media by description and id. Assets without a card
// are omitted (the editor still sees them via list_assets).
export function assetCardLines(assets: Asset[]): string {
  const lines: string[] = [];
  for (const a of assets) {
    if (!a.card) {
      continue;
    }
    const tags = a.card.tags.length ? ` [${a.card.tags.join(", ")}]` : "";
    const uses = a.card.bestFor.length
      ? ` (good for: ${a.card.bestFor.join(", ")})`
      : "";
    lines.push(
      `- ${a.id} (${a.kind ?? "broll"}): ${a.card.summary}${tags}${uses}`
    );
  }
  return lines.join("\n");
}

// Extract up to three reference frames from a b-roll proxy via ffmpeg. Stills
// need no extraction : the image file itself is the reference frame.
async function referenceFrames(slug: string, asset: Asset): Promise<string[]> {
  const p = projectPaths(slug);
  const proxyAbs = resolve(p.dir, asset.proxy);
  if ((asset.kind ?? "broll") === "still") {
    return existsSync(proxyAbs) ? [proxyAbs] : [];
  }
  const durationSec = asset.durationSamples / SAMPLE_RATE;
  if (!(durationSec > 0 && existsSync(proxyAbs))) {
    return [];
  }
  const dir = resolve(p.assetProxies, `${asset.id}.frames`);
  await mkdir(dir, { recursive: true });
  const out: string[] = [];
  for (let i = 0; i < SAMPLE_FRACTIONS.length; i += 1) {
    const t = (SAMPLE_FRACTIONS[i] * durationSec).toFixed(3);
    const frame = resolve(dir, `f${i}.jpg`);
    try {
      await run(
        FFMPEG,
        ["-y", "-ss", t, "-i", proxyAbs, "-frames:v", "1", "-q:v", "3", frame],
        "ffmpeg(asset-frame)"
      );
      if (existsSync(frame)) {
        out.push(frame);
      }
    } catch {
      // A failed seek (e.g. past the end) just yields fewer frames.
    }
  }
  return out;
}

export interface AnalyzeOptions {
  agent: string;
  timeoutMs?: number;
}

// Analyze one asset into a card (or null if the agent could not describe it).
// Read-only on project.json : the caller persists the returned card.
export async function analyzeAsset(
  slug: string,
  asset: Asset,
  opts: AnalyzeOptions
): Promise<AssetCard | null> {
  const frames = await referenceFrames(slug, asset);
  if (frames.length === 0) {
    return null;
  }
  const prompt = buildAssetCardPrompt(asset, frames);
  const { text, agent } = await runAgentText(prompt, {
    agent: opts.agent,
    timeoutMs: opts.timeoutMs,
  });
  const parsed = parseAssetCard(text);
  if (!parsed) {
    return null;
  }
  return { ...parsed, analyzedAt: new Date().toISOString(), agent };
}

export interface AnalyzeResult {
  analyzed: Array<{ id: string; summary: string }>;
  skipped: string[];
  total: number;
}

// Run a bounded pool of mapper tasks (the per-asset subagents) and collect
// results in input order.
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i]);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// Fan out one subagent per un-carded asset, then write every produced card back
// in a single locked mutation. Analysis (slow: ffmpeg + agent) runs outside the
// lock; the write is short, so concurrent edits aren't blocked while agents run.
export async function analyzeAssets(
  slug: string,
  opts: AnalyzeOptions & { concurrency?: number },
  store: {
    loadProject: (slug: string) => Promise<Project>;
    mutateProject: <T>(
      slug: string,
      fn: (project: Project) => T | Promise<T>
    ) => Promise<T>;
  }
): Promise<AnalyzeResult> {
  const project = await store.loadProject(slug);
  const pending = assetsNeedingCards(project);
  if (pending.length === 0) {
    return { analyzed: [], skipped: [], total: 0 };
  }
  const cards = await mapPool(
    pending,
    opts.concurrency ?? DEFAULT_CONCURRENCY,
    async (asset) => ({
      id: asset.id,
      card: await analyzeAsset(slug, asset, opts).catch(() => null),
    })
  );
  const cardById = new Map(
    cards.filter((c) => c.card).map((c) => [c.id, c.card as AssetCard])
  );
  const analyzed: Array<{ id: string; summary: string }> = [];
  const skipped: string[] = [];
  for (const c of cards) {
    if (c.card) {
      analyzed.push({ id: c.id, summary: c.card.summary });
    } else {
      skipped.push(c.id);
    }
  }
  if (cardById.size > 0) {
    await store.mutateProject(slug, (proj) => {
      for (const asset of proj.assets) {
        const card = cardById.get(asset.id);
        if (card && !asset.card) {
          asset.card = card;
        }
      }
    });
  }
  return { analyzed, skipped, total: pending.length };
}

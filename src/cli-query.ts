import type { SilenceSpan } from "./audio-analysis-core.ts";
import { transitionExportPreview } from "./cut-transition-gate.ts";
import type { Project } from "./edl.ts";
import {
  buildMomentIndex,
  embedQueryText,
  isMomentIndexCurrent,
  type SearchScenesResult,
  searchScenes,
} from "./moment-search.ts";
import { findPhraseRuns } from "./phrase-match.ts";
import {
  grepTranscript,
  listOverlays,
  listRanges,
  phraseSpan,
  projectStatus,
  wordSpan,
} from "./query.ts";
import { placeFromPhrase } from "./reanchor.ts";
import { resolveSourceMediaStatus } from "./source-media.ts";

// Re-exported so existing importers of the min-span constant keep one source of
// truth; ownership now lives in reanchor.ts alongside the resolver.
// biome-ignore lint/performance/noBarrelFile: intentional back-compat re-export of the MIN_PHRASE_OVERLAY_SEC const whose ownership moved to reanchor.ts, so existing importers don't all have to repoint.
export { MIN_PHRASE_OVERLAY_SEC } from "./reanchor.ts";

function jsonOut(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function formatGrepHuman(
  result: ReturnType<typeof grepTranscript>
): string {
  if (result.matches.length === 0) {
    return `no matches for "${result.phrase}"\n`;
  }
  const lines = result.matches.map(
    (m) =>
      `  ${m.fromSec.toFixed(3)}s-${m.toSec.toFixed(3)}s  ${m.ids.join(", ")}  ${m.text}`
  );
  return `${result.matches.length} match(es) for "${result.phrase}":\n${lines.join("\n")}\n`;
}

export interface MomentTextMatch {
  cut: boolean;
  fromSec: number;
  ids: string[];
  text: string;
  toSec: number;
}

interface MomentTextMatchDraft extends MomentTextMatch {
  range: readonly [number, number];
}

function wordIndexRange(
  project: Project,
  ids: readonly string[]
): [number, number] | null {
  const indexById = new Map(project.words.map((w, i) => [w.id, i]));
  const indices = ids
    .map((id) => indexById.get(id))
    .filter((i): i is number => i !== undefined);
  if (indices.length === 0) {
    return null;
  }
  return [Math.min(...indices), Math.max(...indices)];
}

function phraseRunsForMomentMode(
  project: Project,
  phrase: string,
  mode: "cut" | "kept"
): MomentTextMatchDraft[] {
  const cutMode = mode === "cut";
  const runs = findPhraseRuns(project, phrase, {
    all: true,
    includeDeleted: cutMode,
  });
  const deletedIds = new Set(
    project.words.filter((w) => w.deleted).map((w) => w.id)
  );
  const matches: MomentTextMatchDraft[] = [];
  for (const run of runs) {
    if (cutMode && !run.ids.some((id) => deletedIds.has(id))) {
      continue;
    }
    const range = wordIndexRange(project, run.ids);
    if (!range) {
      continue;
    }
    matches.push({
      fromSec: run.fromSec,
      toSec: run.toSec,
      ids: run.ids,
      text: run.text,
      range,
      cut: run.ids.some((id) => deletedIds.has(id)),
    });
  }
  return matches;
}

// Kept + cut transcript hits for moment search. Mirrors web/lib/moment-keep.ts
// merge semantics (dedupe by word-index range, sort by fromSec) without
// importing web code into src/.
export function grepMomentTextMatches(
  project: Project,
  phrase: string
): MomentTextMatch[] {
  const trimmed = phrase.trim();
  if (!trimmed) {
    return [];
  }
  const kept = phraseRunsForMomentMode(project, trimmed, "kept");
  const cut = phraseRunsForMomentMode(project, trimmed, "cut");
  const seen = new Set<string>();
  const merged: MomentTextMatch[] = [];
  for (const match of [...kept, ...cut]) {
    const key = `${match.range[0]}-${match.range[1]}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const { range: _range, ...entry } = match;
    merged.push(entry);
  }
  merged.sort((a, b) => a.fromSec - b.fromSec);
  return merged;
}

export function formatMomentTextMatchesHuman(
  phrase: string,
  matches: readonly MomentTextMatch[]
): string {
  if (matches.length === 0) {
    return `no matches for "${phrase}"\n`;
  }
  const lines = matches.map(
    (m) =>
      `  ${m.fromSec.toFixed(3)}s-${m.toSec.toFixed(3)}s  ${m.ids.join(", ")}  ${m.text}${m.cut ? "  [cut]" : ""}`
  );
  return `${matches.length} match(es) for "${phrase}":\n${lines.join("\n")}\n`;
}

export function formatWordSpanHuman(
  result: ReturnType<typeof wordSpan>
): string {
  const lines = result.words.map(
    (w) =>
      `${String(w.index).padStart(4)}  ${w.id.padEnd(6)}  ${w.startSec.toFixed(3)}s  ${w.text}${w.deleted ? "  [cut]" : ""}`
  );
  return `span ${result.token} (${result.words.length} words):\n${lines.join("\n")}\n`;
}

export function formatPhraseSpanHuman(
  result: ReturnType<typeof phraseSpan>,
  phrase: string
): string {
  if (!result.matched) {
    return `no match for "${phrase}"\n`;
  }
  return `phrase "${phrase}" → ${result.fromSec.toFixed(3)}s-${result.toSec.toFixed(3)}s  ${result.ids.join(", ")}\n`;
}

export function formatRangesHuman(
  ranges: ReturnType<typeof listRanges>
): string {
  if (ranges.length === 0) {
    return "no kept ranges\n";
  }
  const lines = ranges.map(
    (r, i) =>
      `  ${i + 1}. ${r.startSec.toFixed(3)}s-${r.endSec.toFixed(3)}s (${(r.endSec - r.startSec).toFixed(3)}s)`
  );
  return `${ranges.length} kept range(s):\n${lines.join("\n")}\n`;
}

export function runTranscriptGrep(
  project: Project,
  phrase: string,
  options: { all?: boolean; json?: boolean }
): string {
  const result = grepTranscript(project, phrase, { all: options.all });
  return options.json ? jsonOut(result) : formatGrepHuman(result);
}

export function runTranscriptSpan(
  project: Project,
  token: string,
  options: { context?: number; json?: boolean }
): string {
  const result = wordSpan(project, token, { context: options.context });
  return options.json ? jsonOut(result) : formatWordSpanHuman(result);
}

export function runTranscriptPhrase(
  project: Project,
  phrase: string,
  options: { json?: boolean }
): string {
  const result = phraseSpan(project, phrase);
  return options.json
    ? jsonOut({ phrase, ...result })
    : formatPhraseSpanHuman(result, phrase);
}

export function runRanges(
  project: Project,
  options: { json?: boolean; silences?: SilenceSpan[] }
): string {
  const ranges = listRanges(project, options.silences);
  return options.json ? jsonOut({ ranges }) : formatRangesHuman(ranges);
}

export function runOverlays(
  project: Project,
  options: { json?: boolean }
): string {
  const overlays = listOverlays(project);
  if (options.json) {
    return jsonOut(overlays);
  }
  // Append the human rationale (F1 note) as a trailing `: <why>` on the line.
  const noteSuffix = (note?: string) => (note ? `: ${note}` : "");
  const lines: string[] = [];
  lines.push(`b-roll (${overlays.broll.length}):`);
  for (const b of overlays.broll) {
    lines.push(
      `  ${b.id}  asset ${b.assetId}  ${b.fromSec.toFixed(3)}s-${b.toSec.toFixed(3)}s${noteSuffix(b.note)}`
    );
  }
  lines.push(`titles (${overlays.titles.length}):`);
  for (const t of overlays.titles) {
    const preview = t.text.replace(/\n/g, "\\n").slice(0, 40);
    lines.push(
      `  ${t.id}  ${t.position}  ${t.fromSec.toFixed(3)}s-${t.toSec.toFixed(3)}s  "${preview}"${noteSuffix(t.note)}`
    );
  }
  lines.push(`zooms (${overlays.zooms.length}):`);
  for (const z of overlays.zooms) {
    lines.push(
      `  ${z.id}  ${z.scale}x  ramp ${z.rampSec}s  ${z.fromSec.toFixed(3)}s-${z.toSec.toFixed(3)}s${noteSuffix(z.note)}`
    );
  }
  lines.push(`stills (${overlays.stills.length}):`);
  for (const s of overlays.stills) {
    lines.push(
      `  ${s.id}  asset ${s.assetId}  ${s.fromSec.toFixed(3)}s-${s.toSec.toFixed(3)}s${noteSuffix(s.note)}`
    );
  }
  lines.push(`music (${overlays.music.length}):`);
  for (const m of overlays.music) {
    lines.push(
      `  ${m.id}  asset ${m.assetId}  ${m.fromSec.toFixed(3)}s-${m.toSec.toFixed(3)}s  gain ${m.gain}  ${m.mode}${noteSuffix(m.note)}`
    );
  }
  lines.push(`graphics (${overlays.graphics.length}):`);
  for (const g of overlays.graphics) {
    const label =
      g.type === "json-render"
        ? `Announcement graphic (${g.catalog ?? "product-announcement"})`
        : `template ${g.template}`;
    const validation =
      g.validation && !g.validation.success ? "  [invalid]" : "";
    lines.push(
      `  ${g.id}  ${label}  ${g.fromSec.toFixed(3)}s-${g.toSec.toFixed(3)}s  ${g.track}${validation}${noteSuffix(g.note)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

export function runStatusJson(
  project: Project,
  silences?: SilenceSpan[],
  projectDir?: string
): string {
  const ranges = listRanges(project, silences);
  const extras = {
    transitionExport: transitionExportPreview(project, ranges),
    ...(projectDir === undefined
      ? {}
      : {
          sourceMedia: resolveSourceMediaStatus({
            dir: projectDir,
            source: project.source,
            proxy: project.proxy,
          }),
        }),
  };
  return jsonOut(projectStatus(project, silences, extras));
}

// Resolve a spoken phrase to an overlay placement span. Delegates to the pure
// reanchor resolver so manual phrase-placement and post-cut re-anchoring share
// exactly one span-math implementation (min-span clamp, project-duration clamp).
export function spanForPhraseOverlay(
  project: Project,
  phrase: string
): { fromSec: number; matched: boolean; toSec: number } {
  const span = placeFromPhrase(project, phrase);
  return { matched: span.matched, fromSec: span.fromSec, toSec: span.toSec };
}

// One line per scene result: "  12.0s-21.0s  0.41  both  <summary-or-frame>".
export function formatSceneMatchesHuman(result: SearchScenesResult): string {
  if (!result.indexed) {
    return "  (no moment index yet; run: openklip index <slug>)\n";
  }
  if (result.results.length === 0) {
    return "  no scene matches\n";
  }
  const lines = result.results.map((r) => {
    const label = r.summary ?? r.bestFrame ?? "";
    return `  ${r.fromSec.toFixed(1)}s-${r.toSec.toFixed(1)}s  ${r.score.toFixed(2)}  ${r.source}  ${label}`;
  });
  return `${lines.join("\n")}\n`;
}

export interface MomentSearchPayload {
  error?: string;
  indexed: boolean;
  query: string;
  scenes: SearchScenesResult["results"];
  text: MomentTextMatch[];
}

// Shared JSON shape for CLI `openklip search --json` and MCP `moment_search`.
export function composeMomentSearchResult(
  project: Project,
  query: string,
  sceneResult: SearchScenesResult,
  extra?: { error?: string }
): MomentSearchPayload {
  return {
    query,
    indexed: sceneResult.indexed,
    text: grepMomentTextMatches(project, query),
    scenes: sceneResult.results,
    ...(extra?.error ? { error: extra.error } : {}),
  };
}

// End-to-end moment search for agent surfaces: builds a stale/missing visual
// index synchronously, embeds the query, and returns transcript + scene hits.
export async function executeMomentSearch(
  slug: string,
  project: Project,
  query: string,
  options: { limit?: number } = {}
): Promise<MomentSearchPayload> {
  if (!isMomentIndexCurrent(slug)) {
    try {
      await buildMomentIndex(slug);
    } catch (e) {
      return {
        indexed: false,
        query,
        error: e instanceof Error ? e.message : "moment index build failed",
        text: grepMomentTextMatches(project, query),
        scenes: [],
      };
    }
  }
  const { vector } = await embedQueryText(query);
  const sceneResult = searchScenes(slug, project, vector, query, {
    limit: options.limit,
  });
  return composeMomentSearchResult(project, query, sceneResult);
}

// Combined moment search: transcript text matches (grepTranscript, reusing
// formatGrepHuman) plus scene matches (embedding + scene-log blend). The
// scene half is precomputed by the caller (searchScenes needs an
// already-embedded query vector and project frames on disk, which this pure
// formatter has no business touching).
export function runMomentSearch(
  project: Project,
  query: string,
  sceneResult: SearchScenesResult,
  options: { json?: boolean }
): string {
  const payload = composeMomentSearchResult(project, query, sceneResult);
  if (options.json) {
    return jsonOut(payload);
  }
  return (
    `text matches:\n${formatMomentTextMatchesHuman(query, payload.text)}` +
    `\nscene matches:\n${formatSceneMatchesHuman(sceneResult)}`
  );
}

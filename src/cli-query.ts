import type { SilenceSpan } from "./audio-analysis-core.ts";
import type { Project } from "./edl.ts";
import {
  grepTranscript,
  listOverlays,
  listRanges,
  phraseSpan,
  projectStatus,
  wordSpan,
} from "./query.ts";
import { placeFromPhrase } from "./reanchor.ts";

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
  silences?: SilenceSpan[]
): string {
  return jsonOut(projectStatus(project, silences));
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

// Phrase-anchored cues (Feature 2). An overlay that was placed from a spoken
// phrase remembers that phrase in its `anchor`; after a re-cut shifts the
// transcript, re-resolution snaps the overlay's sample span back onto the words
// it belongs to (resolve-and-REMEMBER), instead of leaving it stranded at the
// span it was first placed at (resolve-and-forget). Pure module: no file IO, no
// ffmpeg; it only reads `phrase-match`'s kept-word matcher and mutates the
// passed overlay/project. The exporter still reads startSample/endSample, so the
// only thing that moves is the overlay window.
import {
  type Broll,
  type Graphic,
  type Project,
  SAMPLE_RATE,
  type Still,
  type Title,
  type Zoom,
} from "./edl.ts";
import { findPhraseRuns } from "./phrase-match.ts";

// Minimum overlay duration when placing from a short spoken phrase (seconds).
// Owned here so cli-query's spanForPhraseOverlay and the re-anchor span math use
// one constant and cannot drift.
export const MIN_PHRASE_OVERLAY_SEC = 2;

// The overlay kinds that carry a phrase anchor (every overlay schema gained one).
export type OverlayKind = "broll" | "title" | "zoom" | "still" | "graphic";

// Any anchorable overlay: it has a sample span and an optional anchor.
type Anchored = Broll | Title | Zoom | Still | Graphic;

// How a single overlay fared after re-resolution.
// - moved:     the phrase resolved and the span changed.
// - unchanged: the phrase resolved to the same span it already had.
// - stale:     the phrase can no longer be found in the kept words; the last
//              good span is preserved and the anchor is flagged stale.
export type ReanchorStatus = "moved" | "stale" | "unchanged";

export interface ReanchorResult {
  id: string;
  kind: OverlayKind;
  status: ReanchorStatus;
}

// Resolve a spoken phrase to a sample span on the CURRENT kept words. Mirrors
// cli-query's spanForPhraseOverlay exactly (min-span clamp, project-duration
// clamp), and additionally returns the matched word ids for anchor provenance.
export function placeFromPhrase(
  project: Project,
  phrase: string
): { fromSec: number; ids: string[]; matched: boolean; toSec: number } {
  const runs = findPhraseRuns(project, phrase, { all: false });
  if (runs.length === 0) {
    return { matched: false, fromSec: 0, toSec: 0, ids: [] };
  }
  const run = runs[0];
  const dur = run.toSec - run.fromSec;
  const toSec =
    dur >= MIN_PHRASE_OVERLAY_SEC
      ? run.toSec
      : Math.min(
          project.durationSamples / project.sampleRate,
          run.fromSec + MIN_PHRASE_OVERLAY_SEC
        );
  return { matched: true, fromSec: run.fromSec, toSec, ids: run.ids };
}

// Re-resolve one overlay's anchor against the current kept words. On a match the
// overlay's startSample/endSample snap to the (clamped) phrase span and the
// anchor's wordIds/stale are refreshed. On a miss the span is left untouched and
// the anchor is flagged stale, so the last good placement survives.
export function reanchorOverlay(
  project: Project,
  overlay: Anchored
): { matched: boolean; stale: boolean } {
  const anchor = overlay.anchor;
  if (!anchor) {
    return { matched: false, stale: false };
  }
  const span = placeFromPhrase(project, anchor.phrase);
  if (!span.matched) {
    anchor.stale = true;
    return { matched: false, stale: true };
  }
  overlay.startSample = Math.round(span.fromSec * SAMPLE_RATE);
  overlay.endSample = Math.round(span.toSec * SAMPLE_RATE);
  anchor.wordIds = span.ids;
  anchor.stale = false;
  return { matched: true, stale: false };
}

// Re-resolve a single overlay by id, searching every anchorable track. Returns a
// status row; throws if no overlay with that id exists.
export function reanchorOne(project: Project, id: string): ReanchorResult {
  for (const { kind, list } of anchorableTracks(project)) {
    const overlay = list.find((o) => o.id === id);
    if (overlay) {
      return classify(project, overlay, kind);
    }
  }
  throw new Error(`unknown overlay "${id}"`);
}

// Re-resolve every anchored overlay across all five tracks. Un-anchored overlays
// are skipped (no row, no mutation). Returns one status row per anchored overlay.
export function reanchorProject(project: Project): ReanchorResult[] {
  const results: ReanchorResult[] = [];
  for (const { kind, list } of anchorableTracks(project)) {
    for (const overlay of list) {
      if (!overlay.anchor) {
        continue;
      }
      results.push(classify(project, overlay, kind));
    }
  }
  return results;
}

// Re-resolve one anchored overlay and classify the outcome (moved/unchanged/
// stale) by comparing the span before and after.
function classify(
  project: Project,
  overlay: Anchored,
  kind: OverlayKind
): ReanchorResult {
  const beforeStart = overlay.startSample;
  const beforeEnd = overlay.endSample;
  const { stale } = reanchorOverlay(project, overlay);
  let status: ReanchorStatus;
  if (stale) {
    status = "stale";
  } else if (
    overlay.startSample === beforeStart &&
    overlay.endSample === beforeEnd
  ) {
    status = "unchanged";
  } else {
    status = "moved";
  }
  return { id: overlay.id, kind, status };
}

// The five anchorable tracks of a project, paired with their kind tag.
function anchorableTracks(
  project: Project
): Array<{ kind: OverlayKind; list: Anchored[] }> {
  return [
    { kind: "broll", list: project.broll },
    { kind: "title", list: project.titles ?? [] },
    { kind: "zoom", list: project.zooms ?? [] },
    { kind: "still", list: project.stills ?? [] },
    { kind: "graphic", list: project.graphics ?? [] },
  ];
}

// Re-export the anchor type so callers wiring an anchor onto an overlay (cli,
// agent-tools, actions) get it from one place alongside the resolver.
export type { PhraseAnchor } from "./edl.ts";

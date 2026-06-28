// A client-safe leaf: the quick "health read" of an edit (word counts, surviving
// ranges, kept duration). Lives apart from actions.ts on purpose. The GUI's
// project hover card needs summarize() on the client, and importing it from the
// actions.ts barrel would drag that whole module, including its server-only
// graphics catalog (node:fs), into the browser bundle. This module imports only
// from edl.ts (pure zod + math), so it bundles cleanly for client and server.
import { type Project, survivingRanges } from "./edl.ts";

export interface ProjectSummary {
  assetCount: number;
  brollCount: number;
  cuts: number;
  deleted: number;
  kept: number;
  keptDurationSec: number;
  titleCount: number;
  words: number;
  zoomCount: number;
}

// A quick health read of the edit: word counts, number of surviving ranges, and
// the kept duration in seconds (what the exported cut will run to).
export function summarize(project: Project): ProjectSummary {
  const deleted = project.words.filter((w) => w.deleted).length;
  const ranges = survivingRanges(project);
  const keptDurationSec = ranges.reduce(
    (a, r) => a + (r.endSec - r.startSec),
    0
  );
  return {
    words: project.words.length,
    deleted,
    kept: project.words.length - deleted,
    cuts: ranges.length,
    brollCount: project.broll.length,
    titleCount: project.titles?.length ?? 0,
    zoomCount: project.zooms?.length ?? 0,
    assetCount: project.assets.length,
    keptDurationSec,
  };
}

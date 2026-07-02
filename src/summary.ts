// A client-safe leaf: the quick "health read" of an edit (word counts, surviving
// ranges, kept duration). Lives apart from actions.ts on purpose. The GUI's
// project hover card needs summarize() on the client, and importing it from the
// actions.ts barrel would drag that whole module, including its server-only
// graphics catalog (node:fs), into the browser bundle. This module imports only
// from edl.ts (pure zod + math), so it bundles cleanly for client and server.
import type { SilenceSpan } from "./audio-analysis-core.ts";
import { effectiveRanges, type Project } from "./edl.ts";

export interface ProjectSummary {
  assetCount: number;
  brollCount: number;
  cuts: number;
  deleted: number;
  kept: number;
  keptDurationSec: number;
  musicCount: number;
  titleCount: number;
  words: number;
  zoomCount: number;
}

// A quick health read of the edit: word counts, number of surviving ranges, and
// the kept duration in seconds (what the exported cut will run to). Stays
// sync (the client hover card calls it directly): `silences` is optional and,
// when supplied, lets effectiveRanges() apply VAD snap on top of the always-on
// dead-air subtraction. Callers with no silence data still get correct
// dead-air-adjusted counts; they just don't reflect snap.
export function summarize(
  project: Project,
  silences?: SilenceSpan[]
): ProjectSummary {
  const deleted = project.words.filter((w) => w.deleted).length;
  const ranges = effectiveRanges(project, silences);
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
    musicCount: project.music?.length ?? 0,
    titleCount: project.titles?.length ?? 0,
    zoomCount: project.zooms?.length ?? 0,
    assetCount: project.assets.length,
    keptDurationSec,
  };
}

import { summarize } from "./actions.ts";
import type { Project } from "./edl.ts";
import { samplesToSec, survivingRanges } from "./edl.ts";
import { findPhraseRuns, type PhraseRun } from "./phrase-match.ts";

export interface TranscriptWordView {
  deleted: boolean;
  endSec: number;
  id: string;
  index: number;
  startSec: number;
  text: string;
}

export interface PhraseMatch extends PhraseRun {}

export interface GrepResult {
  matches: PhraseMatch[];
  phrase: string;
}

export interface PhraseSpanResult {
  fromSec: number;
  ids: string[];
  matched: boolean;
  text: string;
  toSec: number;
}

export interface WordSpanResult {
  token: string;
  words: TranscriptWordView[];
}

export interface OverlayViews {
  broll: Array<{
    assetId: string;
    fromSec: number;
    id: string;
    srcInSec: number;
    toSec: number;
  }>;
  stills: Array<{
    assetId: string;
    focusX: number;
    focusY: number;
    fromSec: number;
    id: string;
    scale: number;
    toSec: number;
  }>;
  titles: Array<{
    fromSec: number;
    id: string;
    position: string;
    text: string;
    toSec: number;
  }>;
  zooms: Array<{
    fromSec: number;
    id: string;
    rampSec: number;
    scale: number;
    toSec: number;
  }>;
}

export interface ProjectStatusJson {
  captions: { enabled: boolean; maxWords: number };
  keptDurationSec: number;
  look: { vignette: boolean };
  overlays: OverlayViews;
  padMs: number;
  ranges: Array<{ endSec: number; startSec: number }>;
  slug: string;
  template?: string;
  words: { deleted: number; kept: number; total: number };
}

function wordView(project: Project, index: number): TranscriptWordView {
  const w = project.words[index];
  return {
    index,
    id: w.id,
    text: w.text,
    startSec: samplesToSec(w.startSample),
    endSec: samplesToSec(w.endSample),
    deleted: w.deleted,
  };
}

// Expand word ids ("w12") and inclusive ranges ("w12-w20") in project order.
export function expandWordTokens(project: Project, tokens: string[]): string[] {
  const order = new Map(project.words.map((w, i) => [w.id, i]));
  const picked = new Set<string>();
  for (const tok of tokens) {
    const dash = tok.indexOf("-");
    if (dash > 0) {
      const from = tok.slice(0, dash);
      const to = tok.slice(dash + 1);
      const a = order.get(from);
      const b = order.get(to);
      if (a === undefined) {
        throw new Error(`unknown word id "${from}"`);
      }
      if (b === undefined) {
        throw new Error(`unknown word id "${to}"`);
      }
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      for (let i = lo; i <= hi; i++) {
        picked.add(project.words[i].id);
      }
    } else {
      if (!order.has(tok)) {
        throw new Error(`unknown word id "${tok}"`);
      }
      picked.add(tok);
    }
  }
  return project.words.map((w) => w.id).filter((id) => picked.has(id));
}

export function grepTranscript(
  project: Project,
  phrase: string,
  options: { all?: boolean } = {}
): GrepResult {
  return {
    phrase,
    matches: findPhraseRuns(project, phrase, { all: options.all ?? false }),
  };
}

export function phraseSpan(project: Project, phrase: string): PhraseSpanResult {
  const runs = findPhraseRuns(project, phrase, { all: false });
  if (runs.length === 0) {
    return { matched: false, ids: [], fromSec: 0, toSec: 0, text: "" };
  }
  const run = runs[0];
  return {
    matched: true,
    ids: run.ids,
    fromSec: run.fromSec,
    toSec: run.toSec,
    text: run.text,
  };
}

export function wordSpan(
  project: Project,
  token: string,
  options: { context?: number } = {}
): WordSpanResult {
  const context = options.context ?? 0;
  const ids = expandWordTokens(project, [token]);
  if (ids.length === 0) {
    throw new Error(`unknown word token "${token}"`);
  }
  const order = new Map(project.words.map((w, i) => [w.id, i]));
  const indices = ids.map((id) => order.get(id) as number);
  const lo = Math.max(0, Math.min(...indices) - context);
  const hi = Math.min(project.words.length - 1, Math.max(...indices) + context);
  const words: TranscriptWordView[] = [];
  for (let i = lo; i <= hi; i++) {
    words.push(wordView(project, i));
  }
  return { token, words };
}

export function listRanges(
  project: Project
): Array<{ endSec: number; startSec: number }> {
  return survivingRanges(project);
}

export function listOverlays(project: Project): OverlayViews {
  const sec = (samples: number) => samplesToSec(samples);
  return {
    broll: project.broll.map((b) => ({
      id: b.id,
      assetId: b.assetId,
      fromSec: sec(b.startSample),
      toSec: sec(b.endSample),
      srcInSec: sec(b.srcInSample ?? 0),
    })),
    titles: (project.titles ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      position: t.position,
      fromSec: sec(t.startSample),
      toSec: sec(t.endSample),
    })),
    zooms: (project.zooms ?? []).map((z) => ({
      id: z.id,
      scale: z.scale,
      rampSec: z.rampSec,
      fromSec: sec(z.startSample),
      toSec: sec(z.endSample),
    })),
    stills: (project.stills ?? []).map((s) => ({
      id: s.id,
      assetId: s.assetId,
      scale: s.scale,
      focusX: s.focusX,
      focusY: s.focusY,
      fromSec: sec(s.startSample),
      toSec: sec(s.endSample),
    })),
  };
}

export function projectStatus(project: Project): ProjectStatusJson {
  const s = summarize(project);
  return {
    slug: project.slug,
    template: project.template,
    words: {
      total: s.words,
      kept: s.kept,
      deleted: s.deleted,
    },
    keptDurationSec: s.keptDurationSec,
    ranges: listRanges(project),
    padMs: project.padMs ?? 50,
    captions: {
      enabled: project.captions.enabled,
      maxWords: project.captions.maxWords ?? 6,
    },
    look: { vignette: project.look?.vignette ?? false },
    overlays: listOverlays(project),
  };
}

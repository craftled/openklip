import { summarize } from "./actions.ts";
import type { SilenceSpan } from "./audio-analysis-core.ts";
import {
  type CutSnap,
  CutsSchema,
  effectiveRanges,
  type Filter,
  type PhraseAnchor,
  type Project,
  samplesToSec,
} from "./edl.ts";
import { findPhraseRuns, type PhraseRun } from "./phrase-match.ts";
import { validateProductAnnouncementSpec } from "./product-announcement.ts";

export interface TranscriptWordView {
  deleted: boolean;
  endSec: number;
  id: string;
  index: number;
  note?: string;
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
    anchor: PhraseAnchor | null;
    assetId: string;
    fromSec: number;
    id: string;
    note?: string;
    srcInSec: number;
    toSec: number;
  }>;
  graphics: Array<{
    anchor: PhraseAnchor | null;
    catalog?: string;
    fromSec: number;
    id: string;
    note?: string;
    params?: Record<string, string | number | boolean>;
    template: string;
    toSec: number;
    track: string;
    type: "template" | "json-render";
    validation?: { issues: string[]; success: boolean };
  }>;
  music: Array<{
    assetId: string;
    fadeInSec: number;
    fadeOutSec: number;
    fromSec: number;
    gain: number;
    id: string;
    mode: "trim" | "loop";
    note?: string;
    srcInSec: number;
    toSec: number;
  }>;
  stills: Array<{
    anchor: PhraseAnchor | null;
    assetId: string;
    focusX: number;
    focusY: number;
    fromSec: number;
    id: string;
    note?: string;
    scale: number;
    toSec: number;
  }>;
  titles: Array<{
    anchor: PhraseAnchor | null;
    fromSec: number;
    id: string;
    note?: string;
    position: string;
    text: string;
    toSec: number;
  }>;
  zooms: Array<{
    anchor: PhraseAnchor | null;
    fromSec: number;
    id: string;
    note?: string;
    rampSec: number;
    scale: number;
    toSec: number;
  }>;
}

export interface ProjectStatusJson {
  captions: { enabled: boolean; maxWords: number };
  cuts: { snap: CutSnap };
  keptDurationSec: number;
  look: { vignette: boolean; filter: Filter; lut?: string };
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
    ...(w.note === undefined ? {} : { note: w.note }),
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

// Stays sync (many callers, including the CLI's non-analysis paths, have no
// silence data): `silences` is optional and, when supplied, lets
// effectiveRanges() apply VAD snap on top of the always-on dead-air
// subtraction, so CLI/agent output matches export truth exactly when the
// caller has loaded working/audio-analysis.json.
export function listRanges(
  project: Project,
  silences?: SilenceSpan[]
): Array<{ endSec: number; startSec: number }> {
  return effectiveRanges(project, silences);
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
      anchor: b.anchor ?? null,
      ...(b.note === undefined ? {} : { note: b.note }),
    })),
    titles: (project.titles ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      position: t.position,
      fromSec: sec(t.startSample),
      toSec: sec(t.endSample),
      anchor: t.anchor ?? null,
      ...(t.note === undefined ? {} : { note: t.note }),
    })),
    zooms: (project.zooms ?? []).map((z) => ({
      id: z.id,
      scale: z.scale,
      rampSec: z.rampSec,
      fromSec: sec(z.startSample),
      toSec: sec(z.endSample),
      anchor: z.anchor ?? null,
      ...(z.note === undefined ? {} : { note: z.note }),
    })),
    stills: (project.stills ?? []).map((s) => ({
      id: s.id,
      assetId: s.assetId,
      scale: s.scale,
      focusX: s.focusX,
      focusY: s.focusY,
      fromSec: sec(s.startSample),
      toSec: sec(s.endSample),
      anchor: s.anchor ?? null,
      ...(s.note === undefined ? {} : { note: s.note }),
    })),
    music: (project.music ?? []).map((m) => ({
      id: m.id,
      assetId: m.assetId,
      fromSec: sec(m.startSample),
      toSec: sec(m.endSample),
      srcInSec: sec(m.srcInSample ?? 0),
      gain: m.gain,
      fadeInSec: m.fadeInSec,
      fadeOutSec: m.fadeOutSec,
      mode: m.mode,
      ...(m.note === undefined ? {} : { note: m.note }),
    })),
    graphics: (project.graphics ?? []).map((g) => {
      const type = g.type ?? "template";
      const validation =
        type === "json-render"
          ? validateProductAnnouncementSpec(g.spec)
          : undefined;
      return {
        id: g.id,
        type,
        template: g.template,
        track: g.track,
        fromSec: sec(g.startSample),
        toSec: sec(g.endSample),
        anchor: g.anchor ?? null,
        ...(g.catalog === undefined ? {} : { catalog: g.catalog }),
        ...(type === "template" ? { params: g.params } : {}),
        ...(validation === undefined
          ? {}
          : {
              validation: {
                success: validation.success,
                issues: validation.issues,
              },
            }),
        ...(g.note === undefined ? {} : { note: g.note }),
      };
    }),
  };
}

export function projectStatus(
  project: Project,
  silences?: SilenceSpan[]
): ProjectStatusJson {
  const s = summarize(project, silences);
  const cuts = CutsSchema.parse(project.cuts ?? {});
  return {
    slug: project.slug,
    template: project.template,
    words: {
      total: s.words,
      kept: s.kept,
      deleted: s.deleted,
    },
    keptDurationSec: s.keptDurationSec,
    ranges: listRanges(project, silences),
    padMs: project.padMs ?? 50,
    captions: {
      enabled: project.captions.enabled,
      maxWords: project.captions.maxWords ?? 6,
    },
    cuts: {
      snap: cuts.snap,
    },
    look: {
      vignette: project.look?.vignette ?? false,
      filter: project.look?.filter ?? "none",
      ...(project.look?.lut ? { lut: project.look.lut } : {}),
    },
    overlays: listOverlays(project),
  };
}

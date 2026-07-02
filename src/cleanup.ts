// Cleanup-candidate engine (Descript-match Milestone 3.3, analysis half):
// surfaces filler words and dead-air pauses as reviewable/auto-applicable
// candidates. Pure: takes an already-loaded Project and (for dead air) an
// already-computed SilenceSpan[] (see src/audio-analysis.ts loadAudioAnalysis)
// so this module has no node imports and no IO of its own.
import type { SilenceSpan } from "./audio-analysis-core.ts";
import { type Project, SAMPLE_RATE, samplesToSec, type Word } from "./edl.ts";
import { findPhraseRuns, normalizeText } from "./phrase-match.ts";

export type CleanupCandidateKind = "filler" | "dead-air";

export interface CleanupCandidate {
  endSec: number;
  estSavedSec: number;
  id: string;
  kind: CleanupCandidateKind;
  reason: string;
  risk: "safe" | "review";
  startSec: number;
  text: string;
  wordIds: string[];
}

export interface CleanupReport {
  candidates: CleanupCandidate[];
  deadAirCount: number;
  estSavedSec: number;
  fillerCount: number;
  warnings: string[];
}

// Conservative disfluency set matching src/verify.ts's spirit, minus "hmm"/
// "mm" (deliberately excluded so a hummed "mm-hm" agreement doesn't get
// silently classified alongside filler "um"). Isolated occurrences of any of
// these are always safe to auto-cut.
const CORE_FILLER_TOKENS = new Set([
  "um",
  "umm",
  "ummm",
  "uh",
  "uhh",
  "uhm",
  "er",
  "erm",
  "ah",
  "mhm",
]);

// "like" and "so" are real words most of the time, so they are only flagged
// when the SAME normalized token repeats back to back ("like like", "so so"):
// a lone occurrence is never touched.
const REVIEW_REPEAT_TOKENS = new Set(["like", "so"]);

const DEFAULT_FILLER_PHRASES = ["you know", "sort of", "kind of", "i mean"];

const DEFAULT_DEAD_AIR_MIN_SEC = 0.7;
const DEFAULT_DEAD_AIR_KEEP_PAD_SEC = 0.15;
// A dead-air candidate whose RAW (pre-pad) gap exceeds this is safe to
// auto-apply; shorter pauses (still above minSec) are still natural-sounding
// enough to want a human's eyes, so they stay "review".
const DEAD_AIR_SAFE_RAW_SEC = 1.2;
// How close a candidate has to come to an overlay span before cleanupReport
// forces it to "review" (an agent-applied cut near a title/b-roll/etc. risks
// visibly shifting that overlay's timing).
const OVERLAY_PROXIMITY_SEC = 0.3;

export interface FillerCandidatesOpts {
  phrases?: string[];
  tokens?: string[];
}

// Contiguous runs of KEPT words whose normalized text is in `tokens`,
// regardless of which specific token repeats (e.g. "uh um" merges into one
// run: they're both filler, just not the same word).
function coreFillerRuns(keptWords: Word[], tokens: Set<string>): Word[][] {
  const runs: Word[][] = [];
  let current: Word[] = [];
  for (const w of keptWords) {
    if (tokens.has(normalizeText(w.text))) {
      current.push(w);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    runs.push(current);
  }
  return runs;
}

// Contiguous runs of KEPT words whose normalized text is the SAME token from
// `tokens`, dropping runs of length 1 (a lone occurrence is not flagged).
function repeatedTokenRuns(keptWords: Word[], tokens: Set<string>): Word[][] {
  const runs: Word[][] = [];
  let current: Word[] = [];
  let currentToken: string | null = null;
  for (const w of keptWords) {
    const token = normalizeText(w.text);
    const matches = tokens.has(token);
    if (matches && token === currentToken) {
      current.push(w);
      continue;
    }
    if (current.length > 1) {
      runs.push(current);
    }
    current = matches ? [w] : [];
    currentToken = matches ? token : null;
  }
  if (current.length > 1) {
    runs.push(current);
  }
  return runs;
}

function fillerCandidateFromWords(
  words: Word[],
  risk: "safe" | "review",
  reason: string
): CleanupCandidate {
  const first = words[0];
  const last = words[words.length - 1];
  const startSec = samplesToSec(first.startSample);
  const endSec = samplesToSec(last.endSample);
  return {
    id: `f-${first.id}`,
    kind: "filler",
    wordIds: words.map((w) => w.id),
    startSec,
    endSec,
    text: words.map((w) => w.text).join(" "),
    reason,
    risk,
    estSavedSec: Math.max(0, endSec - startSec),
  };
}

// Filler-word candidates over KEPT words only: isolated core disfluencies
// (safe), repeated core disfluencies (still safe, "repeated filler"),
// repeated "like"/"so" (review), and default multi-word filler phrases
// (review), matched via findPhraseRuns's existing normalizeText-based phrase
// matcher so this stays consistent with cut-text.
export function fillerCandidates(
  project: Project,
  opts: FillerCandidatesOpts = {}
): CleanupCandidate[] {
  const coreTokens = new Set(
    (opts.tokens ?? [...CORE_FILLER_TOKENS]).map((t) => normalizeText(t))
  );
  const phrases = opts.phrases ?? DEFAULT_FILLER_PHRASES;
  const keptWords = project.words.filter((w) => !w.deleted);

  const candidates: CleanupCandidate[] = [];

  for (const run of coreFillerRuns(keptWords, coreTokens)) {
    const reason =
      run.length > 1
        ? "repeated filler"
        : `isolated '${normalizeText(run[0].text)}'`;
    candidates.push(fillerCandidateFromWords(run, "safe", reason));
  }

  for (const run of repeatedTokenRuns(keptWords, REVIEW_REPEAT_TOKENS)) {
    candidates.push(
      fillerCandidateFromWords(
        run,
        "review",
        `repeated "${normalizeText(run[0].text)}"`
      )
    );
  }

  for (const phrase of phrases) {
    for (const r of findPhraseRuns(project, phrase, { all: true })) {
      candidates.push({
        id: `f-${r.ids[0]}`,
        kind: "filler",
        wordIds: r.ids,
        startSec: r.fromSec,
        endSec: r.toSec,
        text: r.text,
        reason: `filler phrase "${phrase}"`,
        risk: "review",
        estSavedSec: Math.max(0, r.toSec - r.fromSec),
      });
    }
  }

  candidates.sort((a, b) => a.startSec - b.startSec);
  return candidates;
}

export interface DeadAirCandidatesOpts {
  keepPadSec?: number;
  minSec?: number;
}

interface SecSpan {
  endSec: number;
  startSec: number;
}

function overlapsSpan(a: SecSpan, b: SecSpan): boolean {
  return a.startSec < b.endSec && b.startSec < a.endSec;
}

// F4 idempotency: a silence already covered by a REGISTERED dead-air span
// (project.cuts.deadAir, already applied by a prior cut) must not resurface
// as a fresh candidate, or re-running cleanupReport after "apply all safe"
// would keep suggesting the same gap forever. Converts the sample-grid spans
// to seconds once so the caller's silences (already in seconds) compare
// directly.
function excludeAppliedSilences(
  project: Project,
  silences: SilenceSpan[]
): SilenceSpan[] {
  const applied = project.cuts?.deadAir ?? [];
  if (applied.length === 0) {
    return silences;
  }
  const appliedSpans: SecSpan[] = applied.map((d) => ({
    startSec: samplesToSec(d.startSample),
    endSec: samplesToSec(d.endSample),
  }));
  return silences.filter((s) => !appliedSpans.some((a) => overlapsSpan(s, a)));
}

// Dead-air candidates: VAD silence overlapping the gap between two RAW-
// adjacent kept words (no word, deleted or not, between them, so the gap is
// entirely inside one still-kept stretch of source time; a deleted word in
// between would mean the gap crosses a cut, not a natural in-speech pause).
// The candidate span is the overlap shrunk by keepPadSec on each side so a
// little breathing room survives the cut; risk is graded on the RAW overlap
// length (the natural pause an editor perceives), not the padded remainder.
export function deadAirCandidates(
  project: Project,
  silences: SilenceSpan[],
  opts: DeadAirCandidatesOpts = {}
): CleanupCandidate[] {
  const minSec = opts.minSec ?? DEFAULT_DEAD_AIR_MIN_SEC;
  const keepPadSec = opts.keepPadSec ?? DEFAULT_DEAD_AIR_KEEP_PAD_SEC;
  const { words } = project;
  const candidates: CleanupCandidate[] = [];
  const activeSilences = excludeAppliedSilences(project, silences);

  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (a.deleted || b.deleted) {
      continue;
    }
    const gapStartSec = samplesToSec(a.endSample);
    const gapEndSec = samplesToSec(b.startSample);
    if (gapEndSec <= gapStartSec) {
      continue;
    }

    for (const s of activeSilences) {
      const overlapStart = Math.max(s.startSec, gapStartSec);
      const overlapEnd = Math.min(s.endSec, gapEndSec);
      const rawSec = overlapEnd - overlapStart;
      if (rawSec < minSec) {
        continue;
      }

      let candStart = overlapStart + keepPadSec;
      let candEnd = overlapEnd - keepPadSec;
      if (candEnd < candStart) {
        const mid = (overlapStart + overlapEnd) / 2;
        candStart = mid;
        candEnd = mid;
      }
      const span = candEnd - candStart;
      const startSample = Math.round(candStart * SAMPLE_RATE);

      candidates.push({
        id: `da-${startSample}`,
        kind: "dead-air",
        wordIds: [],
        startSec: candStart,
        endSec: candEnd,
        text: "",
        reason: `${rawSec.toFixed(1)}s silence between words`,
        risk: rawSec > DEAD_AIR_SAFE_RAW_SEC ? "safe" : "review",
        estSavedSec: span,
      });
    }
  }

  return candidates;
}

interface OverlaySpan {
  endSample: number;
  startSample: number;
}

function isNearOverlay(
  cand: CleanupCandidate,
  overlay: OverlaySpan,
  proximitySec: number
): boolean {
  const oStart = samplesToSec(overlay.startSample);
  const oEnd = samplesToSec(overlay.endSample);
  return (
    cand.startSec <= oEnd + proximitySec && cand.endSec >= oStart - proximitySec
  );
}

// Full cleanup report: filler + dead-air candidates, merged and sorted, with
// any candidate within OVERLAY_PROXIMITY_SEC of a broll/title/zoom/still/
// graphic span forced to "review" and called out in warnings (an automatic
// cut there risks visibly shifting that overlay's timing).
export function cleanupReport(
  project: Project,
  silences: SilenceSpan[]
): CleanupReport {
  const filler = fillerCandidates(project);
  const deadAir = deadAirCandidates(project, silences);
  const candidates = [...filler, ...deadAir].sort(
    (a, b) => a.startSec - b.startSec
  );

  const overlaySpans: OverlaySpan[] = [
    ...(project.broll ?? []),
    ...(project.titles ?? []),
    ...(project.zooms ?? []),
    ...(project.stills ?? []),
    ...(project.graphics ?? []),
  ];

  const warnings: string[] = [];
  let nearOverlayCount = 0;
  for (const cand of candidates) {
    const near = overlaySpans.some((o) =>
      isNearOverlay(cand, o, OVERLAY_PROXIMITY_SEC)
    );
    if (near) {
      cand.risk = "review";
      nearOverlayCount++;
    }
  }
  if (nearOverlayCount > 0) {
    warnings.push(
      `${nearOverlayCount} candidate${nearOverlayCount === 1 ? "" : "s"} within ${OVERLAY_PROXIMITY_SEC}s of an overlay span`
    );
  }

  const estSavedSec = candidates.reduce((sum, c) => sum + c.estSavedSec, 0);

  return {
    candidates,
    fillerCount: filler.length,
    deadAirCount: deadAir.length,
    estSavedSec,
    warnings,
  };
}

// M1: the shared "no audio analysis yet" fallback, previously copy-pasted
// three ways (src/agent-tools.ts's cleanup_report tool, src/cli.ts's
// `openklip cleanup`, and web/components/cleanup-panel.tsx's
// buildCleanupCandidates client-side fallback). Filler detection doesn't need
// silences at all, so this degrades to filler-only candidates plus one
// explanatory warning instead of failing the whole report. Kept in this
// module (pure, no node imports) so the client-side cleanup-panel.tsx caller
// can import it too.
export const CLEANUP_DEGRADED_WARNING =
  "dead-air detection needs audio analysis (enable snap or open once with analysis available)";

export function fillerOnlyCleanupReport(project: Project): CleanupReport {
  const candidates = fillerCandidates(project);
  return {
    candidates,
    fillerCount: candidates.length,
    deadAirCount: 0,
    estSavedSec: candidates.reduce((sum, c) => sum + c.estSavedSec, 0),
    warnings: [CLEANUP_DEGRADED_WARNING],
  };
}

// M2: partition a cleanup report's candidates into the two shapes the "apply
// all safe" flow's two registry actions want (cut's `ids`, dead-air-add's
// `spans`). Previously hand-duplicated in src/cli.ts's `cleanup --apply-safe`
// and web/app.tsx's applyAllSafeCleanup.
export function partitionSafeCandidates(candidates: CleanupCandidate[]): {
  deadAirSpans: { fromSec: number; toSec: number }[];
  fillerIds: string[];
} {
  const safe = candidates.filter((c) => c.risk === "safe");
  return {
    fillerIds: safe
      .filter((c) => c.kind === "filler")
      .flatMap((c) => c.wordIds),
    deadAirSpans: safe
      .filter((c) => c.kind === "dead-air")
      .map((c) => ({ fromSec: c.startSec, toSec: c.endSec })),
  };
}

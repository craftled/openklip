// Cleanup-candidate engine (Descript-match Milestone 3.3, analysis half):
// surfaces filler words and dead-air pauses as reviewable/auto-applicable
// candidates. Pure: takes an already-loaded Project and (for dead air) an
// already-computed SilenceSpan[] (see src/audio-analysis.ts loadAudioAnalysis)
// so this module has no node imports and no IO of its own.
import type { SilenceSpan } from "./audio-analysis-core.ts";
import type { CleanupPhraseConfig } from "./cleanup-phrases.ts";
import {
  DEFAULT_FILLER_PHRASES,
  fillerPhraseOptsFromConfig,
  filterNeverCutCandidates,
  neverCutWordIds,
  resolveCleanupPhrases,
} from "./cleanup-phrases.ts";
import { type Project, SAMPLE_RATE, samplesToSec, type Word } from "./edl.ts";
import { findPhraseRuns, normalizeText } from "./phrase-match.ts";

export type CleanupCandidateKind = "filler" | "dead-air";

// Deterministic cleanup-engine categories. Intentionally NOT the same semantics
// as AgentCutCategories / categorizeAgentCutIds (see that type below): the
// engine never flags a lone "like"/"so" as hedging, and its "repeat" bucket is
// only immediate n-gram false starts, not a general content catch-all.
export type CleanupCandidateCategory =
  | "hesitation"
  | "hedging"
  | "repeat"
  | "dead-air";

export const CLEANUP_FILLER_CATEGORIES = [
  "hesitation",
  "hedging",
  "repeat",
] as const;

export const CLEANUP_CATEGORY_DISPLAY_ORDER = [
  ...CLEANUP_FILLER_CATEGORIES,
  "dead-air",
] as const;

export interface CleanupCandidate {
  category: CleanupCandidateCategory;
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

export interface CleanupConfig {
  categories: {
    hedging: boolean;
    hesitation: boolean;
    repeat: boolean;
  };
  keepPadSec: number;
  minSec: number;
}

export interface CleanupCategoryCounts {
  "dead-air": number;
  hedging: number;
  hesitation: number;
  repeat: number;
}

export interface CleanupReport {
  candidates: CleanupCandidate[];
  categoryCounts: CleanupCategoryCounts;
  config: CleanupConfig;
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

export interface CleanupReportOpts {
  config?: CleanupConfig;
  phraseConfig?: CleanupPhraseConfig;
}

export const DEFAULT_DEAD_AIR_MIN_SEC = 0.7;
export const DEFAULT_DEAD_AIR_KEEP_PAD_SEC = 0.15;
export const DEFAULT_CLEANUP_CATEGORIES: Record<
  (typeof CLEANUP_FILLER_CATEGORIES)[number],
  boolean
> = {
  hesitation: true,
  hedging: false,
  repeat: false,
};

const MAX_REPEAT_GAP_SEC = 0.6;
// Raised to 6 so long false starts ("I want to show you, I want to show you …")
// surface as one repeat candidate; nested-preference still picks the longest n.
const MAX_NGRAM = 6;
const MIN_NGRAM = 1;
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
  /** Multi-word phrases flagged safe (auto-apply) instead of review. */
  safePhrases?: string[];
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

function clampCleanupMinSec(value: number): number {
  return Math.min(5, Math.max(0.2, value));
}

function clampCleanupKeepPadSec(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function resolveCleanupConfig(project: Project): CleanupConfig {
  const stored = project.cuts?.cleanup;
  const categories = Object.fromEntries(
    CLEANUP_FILLER_CATEGORIES.map((key) => [
      key,
      stored?.categories?.[key] ?? DEFAULT_CLEANUP_CATEGORIES[key],
    ])
  ) as CleanupConfig["categories"];
  return {
    minSec: clampCleanupMinSec(stored?.minSec ?? DEFAULT_DEAD_AIR_MIN_SEC),
    keepPadSec: clampCleanupKeepPadSec(
      stored?.keepPadSec ?? DEFAULT_DEAD_AIR_KEEP_PAD_SEC
    ),
    categories,
  };
}

function countCategories(
  candidates: CleanupCandidate[]
): CleanupCategoryCounts {
  const counts: CleanupCategoryCounts = {
    hesitation: 0,
    hedging: 0,
    repeat: 0,
    "dead-air": 0,
  };
  for (const c of candidates) {
    counts[c.category]++;
  }
  return counts;
}

function fillerCandidateFromWords(
  words: Word[],
  risk: "safe" | "review",
  reason: string,
  category: CleanupCandidateCategory
): CleanupCandidate {
  const first = words[0];
  const last = words[words.length - 1];
  const startSec = samplesToSec(first.startSample);
  const endSec = samplesToSec(last.endSample);
  return {
    id: `f-${first.id}`,
    kind: "filler",
    category,
    wordIds: words.map((w) => w.id),
    startSec,
    endSec,
    text: words.map((w) => w.text).join(" "),
    reason,
    risk,
    estSavedSec: Math.max(0, endSec - startSec),
  };
}

function wordsEstSavedSec(words: Word[]): number {
  let total = 0;
  for (const w of words) {
    total += Math.max(
      0,
      samplesToSec(w.endSample) - samplesToSec(w.startSample)
    );
  }
  return total;
}

function ngramTokens(words: Word[], start: number, size: number): string[] {
  return words
    .slice(start, start + size)
    .map((w) => normalizeText(w.text))
    .filter(Boolean);
}

function ngramsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((token, idx) => token === b[idx]);
}

// Immediate n-gram repeats (n=1..MAX_NGRAM) among kept words: same normalized sequence
// appears >=2 times consecutively (gap <= MAX_REPEAT_GAP_SEC), cut all but the
// last take. Prefer the longest n-gram when matches nest; skip word ids
// already covered by core-filler or like/so candidates.
export function repeatedSequenceCandidates(
  keptWords: Word[],
  blockedWordIds: Set<string>
): CleanupCandidate[] {
  const candidates: CleanupCandidate[] = [];
  const covered = new Set<string>();

  for (let i = 0; i < keptWords.length; ) {
    const w = keptWords[i];
    if (blockedWordIds.has(w.id) || covered.has(w.id)) {
      i++;
      continue;
    }

    let matched = false;
    for (let n = MAX_NGRAM; n >= MIN_NGRAM; n--) {
      if (i + n > keptWords.length) {
        continue;
      }
      const gram = ngramTokens(keptWords, i, n);
      if (gram.length < n) {
        continue;
      }

      const occurrences: number[] = [];
      let pos = i;
      while (pos + n <= keptWords.length) {
        const current = ngramTokens(keptWords, pos, n);
        if (!ngramsEqual(gram, current)) {
          break;
        }
        occurrences.push(pos);
        const nextPos = pos + n;
        if (nextPos + n > keptWords.length) {
          break;
        }
        const gap =
          samplesToSec(keptWords[nextPos].startSample) -
          samplesToSec(keptWords[pos + n - 1].endSample);
        if (gap > MAX_REPEAT_GAP_SEC) {
          break;
        }
        pos = nextPos;
      }

      if (occurrences.length < 2) {
        continue;
      }

      const cutWords: Word[] = [];
      for (let o = 0; o < occurrences.length - 1; o++) {
        const start = occurrences[o];
        for (let j = 0; j < n; j++) {
          cutWords.push(keptWords[start + j]);
        }
      }
      if (cutWords.some((word) => blockedWordIds.has(word.id))) {
        continue;
      }

      const phrase = gram.join(" ");
      const first = cutWords[0];
      const last = cutWords[cutWords.length - 1];
      candidates.push({
        id: `f-${first.id}`,
        kind: "filler",
        category: "repeat",
        wordIds: cutWords.map((word) => word.id),
        startSec: samplesToSec(first.startSample),
        endSec: samplesToSec(last.endSample),
        text: cutWords.map((word) => word.text).join(" "),
        reason: `repeated "${phrase}"`,
        risk: "review",
        estSavedSec: wordsEstSavedSec(cutWords),
      });
      for (const word of cutWords) {
        covered.add(word.id);
      }
      i = occurrences[occurrences.length - 1] + n;
      matched = true;
      break;
    }

    if (!matched) {
      i++;
    }
  }

  return candidates;
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
  const safePhraseSet = new Set(
    (opts.safePhrases ?? []).map((phrase) => normalizeText(phrase))
  );
  const keptWords = project.words.filter((w) => !w.deleted);

  const candidates: CleanupCandidate[] = [];

  for (const run of coreFillerRuns(keptWords, coreTokens)) {
    const reason =
      run.length > 1
        ? "repeated filler"
        : `isolated '${normalizeText(run[0].text)}'`;
    candidates.push(
      fillerCandidateFromWords(run, "safe", reason, "hesitation")
    );
  }

  for (const run of repeatedTokenRuns(keptWords, REVIEW_REPEAT_TOKENS)) {
    candidates.push(
      fillerCandidateFromWords(
        run,
        "review",
        `repeated "${normalizeText(run[0].text)}"`,
        "repeat"
      )
    );
  }

  const blockedWordIds = new Set(candidates.flatMap((c) => c.wordIds));
  // Intentional iterative refinement: a later cleanup-apply pass can surface
  // new repeat adjacency after earlier cuts (post-cut adjacency is real in the
  // rendered output). See cleanup-apply summary and the convergence test.
  for (const repeat of repeatedSequenceCandidates(keptWords, blockedWordIds)) {
    candidates.push(repeat);
    for (const id of repeat.wordIds) {
      blockedWordIds.add(id);
    }
  }

  for (const phrase of phrases) {
    const risk = safePhraseSet.has(normalizeText(phrase)) ? "safe" : "review";
    for (const r of findPhraseRuns(project, phrase, { all: true })) {
      if (r.ids.every((id) => blockedWordIds.has(id))) {
        continue;
      }
      candidates.push({
        id: `f-${r.ids[0]}`,
        kind: "filler",
        category: "hedging",
        wordIds: r.ids,
        startSec: r.fromSec,
        endSec: r.toSec,
        text: r.text,
        reason: `filler phrase "${phrase}"`,
        risk,
        estSavedSec: Math.max(0, r.toSec - r.fromSec),
      });
      for (const id of r.ids) {
        blockedWordIds.add(id);
      }
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
        category: "dead-air",
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

function fillerOptsFromPhraseConfig(
  phraseConfig?: CleanupPhraseConfig
): FillerCandidatesOpts | undefined {
  if (!phraseConfig || phraseConfig.alwaysCut.length === 0) {
    return;
  }
  const mapped = fillerPhraseOptsFromConfig(phraseConfig);
  const tokens =
    mapped.extraTokens.length > 0
      ? [...CORE_FILLER_TOKENS, ...mapped.extraTokens]
      : undefined;
  return {
    phrases: [...DEFAULT_FILLER_PHRASES, ...mapped.extraPhrases],
    safePhrases: mapped.safePhrases,
    tokens,
  };
}

function finalizeCleanupReport(
  candidates: CleanupCandidate[],
  config: CleanupConfig,
  warnings: string[]
): CleanupReport {
  const fillerCount = candidates.filter((c) => c.kind === "filler").length;
  const deadAirCount = candidates.filter((c) => c.kind === "dead-air").length;
  return {
    candidates,
    categoryCounts: countCategories(candidates),
    config,
    fillerCount,
    deadAirCount,
    estSavedSec: candidates.reduce((sum, c) => sum + c.estSavedSec, 0),
    warnings,
  };
}

function applyPhraseConfigToReport(
  project: Project,
  report: CleanupReport,
  phraseConfig?: CleanupPhraseConfig
): CleanupReport {
  if (!phraseConfig || phraseConfig.neverCut.length === 0) {
    return report;
  }
  const blocked = neverCutWordIds(project, phraseConfig.neverCut);
  const candidates = filterNeverCutCandidates(report.candidates, blocked);
  return finalizeCleanupReport(candidates, report.config, report.warnings);
}

// Full cleanup report: filler + dead-air candidates, merged and sorted, with
// any candidate within OVERLAY_PROXIMITY_SEC of a broll/title/zoom/still/
// graphic span forced to "review" and called out in warnings (an automatic
// cut there risks visibly shifting that overlay's timing).
export function cleanupReport(
  project: Project,
  silences: SilenceSpan[],
  opts: CleanupReportOpts = {}
): CleanupReport {
  const config = opts.config ?? resolveCleanupConfig(project);
  const fillerOpts = fillerOptsFromPhraseConfig(opts.phraseConfig);
  const filler = fillerCandidates(project, fillerOpts ?? {});
  const deadAir = deadAirCandidates(project, silences, {
    minSec: config.minSec,
    keepPadSec: config.keepPadSec,
  });
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

  return applyPhraseConfigToReport(
    project,
    finalizeCleanupReport(candidates, config, warnings),
    opts.phraseConfig
  );
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

export function fillerOnlyCleanupReport(
  project: Project,
  opts: CleanupReportOpts = {}
): CleanupReport {
  const config = opts.config ?? resolveCleanupConfig(project);
  const fillerOpts = fillerOptsFromPhraseConfig(opts.phraseConfig);
  const candidates = fillerCandidates(project, fillerOpts ?? {});
  return applyPhraseConfigToReport(
    project,
    finalizeCleanupReport(candidates, config, [CLEANUP_DEGRADED_WARNING]),
    opts.phraseConfig
  );
}

export function buildCleanupReport(input: {
  briefText?: string;
  project: Project;
  silences: SilenceSpan[] | null | undefined;
}): CleanupReport {
  const config = resolveCleanupConfig(input.project);
  const phraseConfig = resolveCleanupPhrases({
    project: input.project,
    briefText: input.briefText,
  });
  const opts = { phraseConfig, config };
  return input.silences
    ? cleanupReport(input.project, input.silences, opts)
    : fillerOnlyCleanupReport(input.project, opts);
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

function categoryEnabled(
  category: CleanupCandidateCategory,
  config: CleanupConfig
): boolean {
  if (category === "dead-air") {
    return true;
  }
  return config.categories[category];
}

export function partitionApplyCandidates(
  candidates: CleanupCandidate[],
  mode: "safe" | "enabled",
  config: CleanupConfig
): {
  deadAirSpans: { fromSec: number; toSec: number }[];
  fillerIds: string[];
} {
  if (mode === "safe") {
    return partitionSafeCandidates(candidates);
  }
  const fillerIds = [
    ...new Set(
      candidates
        .filter(
          (c) =>
            c.kind === "filler" &&
            c.category !== "dead-air" &&
            categoryEnabled(c.category, config)
        )
        .flatMap((c) => c.wordIds)
    ),
  ];
  const deadAirSpans = candidates
    .filter((c) => c.kind === "dead-air")
    .map((c) => ({ fromSec: c.startSec, toSec: c.endSec }));
  return { fillerIds, deadAirSpans };
}

// AI-pass classifier buckets for suggestCleanupCuts. Same labels as
// CleanupCandidateCategory but different semantics by design: lone "like"/"so"
// map to hedging (product choice), and "repeat" is a false-start/content
// catch-all, not the engine's immediate n-gram detector.
export interface AgentCutCategories {
  hedging: string[];
  hesitation: string[];
  repeat: string[];
}

function hedgingPhraseList(project: Project): string[] {
  const phraseConfig = resolveCleanupPhrases({ project });
  const seen = new Set(
    DEFAULT_FILLER_PHRASES.map((phrase) => normalizeText(phrase))
  );
  const phrases = [...DEFAULT_FILLER_PHRASES];
  for (const raw of phraseConfig.alwaysCut) {
    const norm = normalizeText(raw);
    if (!norm || seen.has(norm)) {
      continue;
    }
    seen.add(norm);
    phrases.push(raw);
  }
  return phrases;
}

function hedgingPhraseWordIds(project: Project): Set<string> {
  const ids = new Set<string>();
  for (const phrase of hedgingPhraseList(project)) {
    for (const run of findPhraseRuns(project, phrase, { all: true })) {
      for (const id of run.ids) {
        ids.add(id);
      }
    }
  }
  return ids;
}

// Classify agent-suggested cut ids into hesitation / hedging / repeat buckets
// for the Cleanup tab AI pass. Unknown ids are dropped; ids are deduped while
// preserving first-seen order within each bucket.
export function categorizeAgentCutIds(
  project: Project,
  ids: string[]
): AgentCutCategories {
  const wordById = new Map(project.words.map((w) => [w.id, w]));
  const hedgingIds = hedgingPhraseWordIds(project);
  const hesitation: string[] = [];
  const hedging: string[] = [];
  const repeat: string[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    const w = wordById.get(id);
    if (!w) {
      continue;
    }
    seen.add(id);
    const norm = normalizeText(w.text);
    if (CORE_FILLER_TOKENS.has(norm)) {
      hesitation.push(id);
    } else if (norm === "like" || norm === "so" || hedgingIds.has(id)) {
      hedging.push(id);
    } else {
      repeat.push(id);
    }
  }

  return { hesitation, hedging, repeat };
}

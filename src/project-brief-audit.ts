import type { SilenceSpan } from "./audio-analysis-core.ts";
import { parseCleanupPhraseLists } from "./cleanup-phrases.ts";
import {
  effectiveRanges,
  type Project,
  type Range,
  samplesToSec,
} from "./edl.ts";
import { summarize } from "./summary.ts";

export interface BriefTargets {
  alwaysCutPhrases: string[];
  avoidPhrases: string[];
  maxMusicGain: number;
  minBroll: number;
  minStill: number;
  neverCutPhrases: string[];
  targetLengthSec: number;
  targetLengthToleranceSec: number;
}

export interface BriefAuditResult {
  issues: string[];
  ok: boolean;
  warnings: string[];
}

const DEFAULT_TARGETS: BriefTargets = {
  targetLengthSec: 90,
  targetLengthToleranceSec: 15,
  minBroll: 2,
  minStill: 1,
  maxMusicGain: 0.35,
  avoidPhrases: [],
  alwaysCutPhrases: [],
  neverCutPhrases: [],
};

export function parseBriefTargets(briefText: string): BriefTargets {
  const targets: BriefTargets = {
    ...DEFAULT_TARGETS,
    avoidPhrases: [],
    alwaysCutPhrases: [],
    neverCutPhrases: [],
  };
  const cleanupLists = parseCleanupPhraseLists(briefText);
  targets.alwaysCutPhrases = cleanupLists.alwaysCut;
  targets.neverCutPhrases = cleanupLists.neverCut;

  const lengthMatch = briefText.match(
    /target length:\s*about\s*(\d+)\s*seconds?/i
  );
  if (lengthMatch) {
    targets.targetLengthSec = Number(lengthMatch[1]);
  }

  const brollMatch = briefText.match(/at least\s+(\d+)\s+aerial\s+b-roll/i);
  if (brollMatch) {
    targets.minBroll = Number(brollMatch[1]);
  }

  const stillMatch = briefText.match(/(?:and\s+)?(\d+)\s+still\s+image/i);
  if (stillMatch) {
    targets.minStill = Number(stillMatch[1]);
  }

  const avoidMatch = briefText.match(/avoid:\s*([^.]+)\./i);
  if (avoidMatch) {
    const clause = avoidMatch[1].trim().toLowerCase();
    const aboutMatch = clause.match(/about\s+(.+)$/);
    const phrase = (aboutMatch?.[1] ?? clause).trim();
    if (phrase) {
      targets.avoidPhrases.push(phrase);
    }
  }

  return targets;
}

export function spanOverlapsKeptRanges(
  fromSec: number,
  toSec: number,
  ranges: Range[]
): boolean {
  if (toSec <= fromSec) {
    return false;
  }
  for (const range of ranges) {
    if (fromSec < range.endSec && toSec > range.startSec) {
      return true;
    }
  }
  return false;
}

function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseWordsKept(project: Project, phrase: string): boolean {
  const needle = normalizePhrase(phrase);
  if (!needle) {
    return true;
  }
  const kept = project.words.filter((w) => !w.deleted);
  for (let i = 0; i < kept.length; i++) {
    let built = "";
    for (let j = i; j < kept.length; j++) {
      built = built ? `${built} ${kept[j].text}` : kept[j].text;
      if (normalizePhrase(built) === needle) {
        return true;
      }
      if (!needle.startsWith(normalizePhrase(built))) {
        break;
      }
    }
  }
  return false;
}

function protectedPhraseKept(project: Project, phrase: string): boolean {
  const keptText = normalizePhrase(
    project.words
      .filter((w) => !w.deleted)
      .map((w) => w.text)
      .join(" ")
  );
  const needle = normalizePhrase(phrase);
  if (!needle) {
    return true;
  }
  if (keptText.includes(needle)) {
    return true;
  }
  if (needle.includes("own world")) {
    return keptText.includes("own world");
  }
  return phraseWordsKept(project, phrase);
}

function overlaySpans(
  project: Project
): { id: string; kind: string; fromSec: number; toSec: number }[] {
  const spans: { id: string; kind: string; fromSec: number; toSec: number }[] =
    [];
  for (const clip of project.broll) {
    spans.push({
      id: clip.id,
      kind: "broll",
      fromSec: samplesToSec(clip.startSample),
      toSec: samplesToSec(clip.endSample),
    });
  }
  for (const clip of project.stills ?? []) {
    spans.push({
      id: clip.id,
      kind: "still",
      fromSec: samplesToSec(clip.startSample),
      toSec: samplesToSec(clip.endSample),
    });
  }
  for (const clip of project.titles ?? []) {
    spans.push({
      id: clip.id,
      kind: "title",
      fromSec: samplesToSec(clip.startSample),
      toSec: samplesToSec(clip.endSample),
    });
  }
  return spans;
}

export function auditProjectForShip(input: {
  briefText: string;
  project: Project;
  silences?: SilenceSpan[];
}): BriefAuditResult {
  const targets = parseBriefTargets(input.briefText);
  const summary = summarize(input.project, input.silences);
  const ranges = effectiveRanges(input.project, input.silences);
  const issues: string[] = [];
  const warnings: string[] = [];

  const minSec = targets.targetLengthSec - targets.targetLengthToleranceSec;
  const maxSec = targets.targetLengthSec + targets.targetLengthToleranceSec;
  if (summary.keptDurationSec < minSec) {
    issues.push(
      `kept runtime ${summary.keptDurationSec.toFixed(1)}s is below brief target (${minSec}-${maxSec}s)`
    );
  } else if (summary.keptDurationSec > maxSec) {
    warnings.push(
      `kept runtime ${summary.keptDurationSec.toFixed(1)}s exceeds brief target (${minSec}-${maxSec}s)`
    );
  }

  if (summary.brollCount < targets.minBroll) {
    issues.push(
      `need at least ${targets.minBroll} b-roll overlays (have ${summary.brollCount})`
    );
  }

  const stillCount = input.project.stills?.length ?? 0;
  if (stillCount < targets.minStill) {
    issues.push(
      `need at least ${targets.minStill} still overlay(s) (have ${stillCount})`
    );
  }

  const music = input.project.music ?? [];
  if (music.length === 0) {
    issues.push("brief expects a music bed but none is placed");
  } else {
    for (const placement of music) {
      const gain = placement.gain ?? 1;
      if (gain > targets.maxMusicGain) {
        issues.push(
          `music placement ${placement.id} gain ${gain} exceeds subtle max ${targets.maxMusicGain}`
        );
      }
    }
  }

  for (const phrase of [...targets.avoidPhrases, ...targets.neverCutPhrases]) {
    if (!protectedPhraseKept(input.project, phrase)) {
      issues.push(`protected phrase was cut: "${phrase}"`);
    }
  }

  for (const phrase of targets.alwaysCutPhrases) {
    if (phraseWordsKept(input.project, phrase)) {
      warnings.push(`always-cut phrase still kept: "${phrase}"`);
    }
  }

  for (const span of overlaySpans(input.project)) {
    if (!spanOverlapsKeptRanges(span.fromSec, span.toSec, ranges)) {
      issues.push(
        `${span.kind} ${span.id} (${span.fromSec.toFixed(1)}-${span.toSec.toFixed(1)}s) does not overlap kept ranges`
      );
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
  };
}

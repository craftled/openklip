// The verify loop: ffmpeg executes the EDL, then we re-transcribe the rendered
// cut and check it against what project.json intended. The deck's "Claude
// re-transcribes its own cut: zero ums" applied to OpenKlip: re-running the same
// local Whisper path on output/out.mp4 catches what no pre-export check can : a
// boundary cut that clipped a word, filler that survived a slightly-off span,
// deleted content that leaked back into the render.
//
// The diff + verdict are pure and unit tested; only the audio extract and the
// transcribe spawn touch the world.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { FFMPEG, run } from "./ffmpeg.ts";
import { isBlankCanvasProject } from "./blank-ingest.ts";
import { projectPaths } from "./paths.ts";
import { loadProject } from "./projectStore.ts";
import { transcribeScriptPath } from "./script-paths.ts";

// Conservative disfluency set: tokens that are almost never real content, so a
// survivor is a real defect. "like" is deliberately excluded (a real word).
const FILLER_TOKENS = new Set([
  "um",
  "umm",
  "ummm",
  "uh",
  "uhh",
  "uhm",
  "er",
  "erm",
  "ah",
  "hmm",
  "mm",
  "mhm",
]);

// Below this fraction of kept words found in the render, we assume words were
// clipped or lost and flag the cut for review.
const COVERAGE_THRESHOLD = 0.9;

// Cap sampled token lists in the report so a pathological diff stays readable.
const SAMPLE_LIMIT = 12;

// Normalize free text into comparable word tokens: lowercase, split on anything
// that is not a letter/digit/apostrophe, strip edge apostrophes, drop empties.
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .split(" ")
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length > 0);
}

export interface VerifyReport {
  /** Filler tokens that survived into the render (should have been cut). */
  fillerSurvivors: string[];
  /** Fraction of kept (surviving) words found in the rendered transcript. */
  keptCoverage: number;
  /** Words unique to the deleted set that reappeared in the render. */
  leakedDeleted: string[];
  /** Kept words not found in the render (possibly clipped). */
  missingKept: string[];
  /** True when no filler survived, nothing leaked, and coverage is high. */
  ok: boolean;
  /** Total word count of the rendered transcript. */
  renderedWordCount: number;
}

// Compare the rendered transcript against the EDL's intent. Pure: the heart of
// the verify loop, tested without rendering anything.
export function diffCut(input: {
  deletedWords: string[];
  keptWords: string[];
  renderedWords: string[];
}): VerifyReport {
  const kept = input.keptWords.flatMap(tokenize);
  const deleted = input.deletedWords.flatMap(tokenize);
  const rendered = input.renderedWords.flatMap(tokenize);
  const renderedSet = new Set(rendered);

  const fillerSurvivors = [
    ...new Set(rendered.filter((t) => FILLER_TOKENS.has(t))),
  ];

  // Only tokens UNIQUE to the deleted set count as leaks: a word that is also
  // kept elsewhere would match the render legitimately (avoids false positives).
  const keptSet = new Set(kept);
  const uniqueDeleted = new Set(deleted.filter((t) => !keptSet.has(t)));
  const leakedDeleted = [...uniqueDeleted].filter((t) => renderedSet.has(t));

  // Kept-word coverage as a multiset: each rendered token can satisfy one kept
  // token, so repeated words must repeat in the render too.
  const renderedCounts = new Map<string, number>();
  for (const t of rendered) {
    renderedCounts.set(t, (renderedCounts.get(t) ?? 0) + 1);
  }
  const missingKept: string[] = [];
  let covered = 0;
  for (const t of kept) {
    const c = renderedCounts.get(t) ?? 0;
    if (c > 0) {
      renderedCounts.set(t, c - 1);
      covered += 1;
    } else {
      missingKept.push(t);
    }
  }
  const keptCoverage = kept.length === 0 ? 1 : covered / kept.length;

  const ok =
    fillerSurvivors.length === 0 &&
    leakedDeleted.length === 0 &&
    keptCoverage >= COVERAGE_THRESHOLD;

  return {
    ok,
    fillerSurvivors: fillerSurvivors.slice(0, SAMPLE_LIMIT),
    leakedDeleted: leakedDeleted.slice(0, SAMPLE_LIMIT),
    missingKept: missingKept.slice(0, SAMPLE_LIMIT),
    keptCoverage,
    renderedWordCount: rendered.length,
  };
}

// One-line human verdict for the CLI / toast.
export function verifyVerdict(report: VerifyReport): string {
  const pct = Math.round(report.keptCoverage * 100);
  if (report.ok) {
    return `verified: zero filler, no leaked cuts, ${pct}% kept-word coverage`;
  }
  const parts: string[] = [];
  if (report.fillerSurvivors.length > 0) {
    parts.push(`filler survived: ${report.fillerSurvivors.join(", ")}`);
  }
  if (report.leakedDeleted.length > 0) {
    parts.push(`cut words leaked: ${report.leakedDeleted.join(", ")}`);
  }
  if (report.keptCoverage < COVERAGE_THRESHOLD) {
    parts.push(`only ${pct}% kept-word coverage (words may be clipped)`);
  }
  return `drift: ${parts.join("; ")}`;
}

// Re-transcribe an f32 audio file through the same Whisper runner used at ingest.
async function transcribeToWords(
  audioAbs: string,
  outJsonAbs: string
): Promise<string[]> {
  const proc = Bun.spawn(
    ["node", transcribeScriptPath(), audioAbs, outJsonAbs],
    { stdout: "pipe", stderr: "pipe" }
  );
  if ((await proc.exited) !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`transcription failed: ${err.trim().slice(-300)}`);
  }
  const parsed = JSON.parse(await Bun.file(outJsonAbs).text()) as {
    chunks: Array<{ text: string }>;
  };
  return parsed.chunks.map((c) => c.text);
}

// Render-verify: extract audio from the exported MP4, re-transcribe it, and diff
// against the EDL. Throws if there is no export yet.
export async function verifyCut(slug: string): Promise<VerifyReport> {
  const p = projectPaths(slug);
  if (!existsSync(p.out)) {
    throw new Error(`no export found. Run: openklip export ${slug}`);
  }
  const audioAbs = join(p.working, "verify.audio16k.f32");
  const outJson = join(p.working, "verify.transcript.raw.json");
  await run(
    FFMPEG,
    [
      "-y",
      "-i",
      p.out,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "f32le",
      audioAbs,
    ],
    "ffmpeg(verify-audio)"
  );
  const renderedWords = await transcribeToWords(audioAbs, outJson);
  const project = await loadProject(slug);
  if (isBlankCanvasProject(project)) {
    return {
      ok: true,
      fillerSurvivors: [],
      leakedDeleted: [],
      missingKept: [],
      keptCoverage: 1,
      renderedWordCount: 0,
    };
  }
  return diffCut({
    keptWords: project.words.filter((w) => !w.deleted).map((w) => w.text),
    deletedWords: project.words.filter((w) => w.deleted).map((w) => w.text),
    renderedWords,
  });
}

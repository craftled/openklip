// LLM highlight detection: find short-form clip candidates in a long edit.
// Prompt-building and reply-parsing are pure and unit tested; only the agent
// spawn touches the world.

import { runAgentText } from "./agent-driver.ts";
import {
  type HighlightClip,
  type Highlights,
  type Project,
  SAMPLE_RATE,
  samplesToSec,
} from "./edl.ts";

const TRANSCRIPT_MAX_CHARS = 12_000;
const MIN_CLIP_SEC = 10;
const MAX_CLIP_SEC = 90;

export interface HighlightsPromptOptions {
  maxClips?: number;
  targetClipSec?: number;
}

export interface DetectHighlightsOptions extends HighlightsPromptOptions {
  agent: string;
  timeoutMs?: number;
}

function transcriptTimedLines(project: Project): string {
  const kept = project.words.filter((w) => !w.deleted);
  const lines: string[] = [];
  let buf: string[] = [];
  let lineStart = 0;
  for (const w of kept) {
    const start = samplesToSec(w.startSample);
    if (buf.length === 0) {
      lineStart = start;
    }
    buf.push(w.text);
    const joined = buf.join(" ");
    const endsSentence = /[.!?]$/.test(w.text);
    if (joined.length >= 180 || endsSentence) {
      const end = samplesToSec(w.endSample);
      lines.push(`[${lineStart.toFixed(1)}-${end.toFixed(1)}s] ${joined}`);
      buf = [];
    }
  }
  if (buf.length > 0) {
    const last = kept.at(-1);
    const end = last ? samplesToSec(last.endSample) : lineStart;
    lines.push(`[${lineStart.toFixed(1)}-${end.toFixed(1)}s] ${buf.join(" ")}`);
  }
  const full = lines.join("\n");
  return full.length > TRANSCRIPT_MAX_CHARS
    ? `${full.slice(0, TRANSCRIPT_MAX_CHARS)}… [truncated]`
    : full || "[no transcript]";
}

export function buildHighlightsPrompt(
  project: Project,
  opts: HighlightsPromptOptions = {}
): string {
  const totalSec = project.durationSamples / SAMPLE_RATE;
  const maxClips = opts.maxClips ?? 5;
  const targetClipSec = opts.targetClipSec ?? 45;
  const transcript = transcriptTimedLines(project);
  return `You are finding ${maxClips} standalone short-form clip candidates in a ~${totalSec.toFixed(0)}s talking-head video. Each clip should be roughly ${targetClipSec}s (between ${MIN_CLIP_SEC}s and ${MAX_CLIP_SEC}s), start on a strong hook, and end on a natural beat. Use ONLY the timed transcript below. Return ONLY JSON:
{"clips":[{"fromSec":12.5,"toSec":52.0,"title":"short label","reason":"why this works alone","score":0.9}]}
Rules: clips must not overlap heavily; prefer punchy insights, demos, and emotional peaks; skip filler and repeated intros. Respond with JSON only: no prose, no code fence.

Timed transcript:
"""
${transcript}
"""`;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export function parseHighlights(
  text: string
): Omit<HighlightClip, "id">[] | null {
  const tryParse = (raw: string): Omit<HighlightClip, "id">[] | null => {
    try {
      const obj = JSON.parse(raw) as { clips?: unknown };
      if (!Array.isArray(obj.clips)) {
        return null;
      }
      const out: Omit<HighlightClip, "id">[] = [];
      for (const item of obj.clips) {
        if (!item || typeof item !== "object") {
          continue;
        }
        const row = item as Record<string, unknown>;
        const fromSec = num(row.fromSec);
        const toSec = num(row.toSec);
        const title = str(row.title);
        if (
          fromSec === null ||
          toSec === null ||
          title === null ||
          fromSec < 0 ||
          toSec <= fromSec ||
          toSec - fromSec < MIN_CLIP_SEC ||
          toSec - fromSec > MAX_CLIP_SEC
        ) {
          continue;
        }
        const scoreRaw = num(row.score);
        out.push({
          fromSec,
          toSec,
          title,
          ...(str(row.reason) ? { reason: str(row.reason)! } : {}),
          ...(scoreRaw === null
            ? {}
            : { score: Math.min(1, Math.max(0, scoreRaw)) }),
        });
      }
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(text.trim());
  if (direct) {
    return direct;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }
  return tryParse(text.slice(start, end + 1));
}

export function assignHighlightIds(
  clips: Omit<HighlightClip, "id">[]
): HighlightClip[] {
  return clips.map((clip, i) => ({ ...clip, id: `h${i + 1}` }));
}

export function highlightClipLines(highlights: Highlights): string {
  if (!highlights.clips.length) {
    return "";
  }
  return highlights.clips
    .map((c) => {
      const score =
        c.score === undefined ? "" : ` score ${(c.score * 100).toFixed(0)}%`;
      const reason = c.reason ? ` - ${c.reason}` : "";
      return `- ${c.id}  ${c.fromSec.toFixed(1)}-${c.toSec.toFixed(1)}s${score}: ${c.title}${reason}`;
    })
    .join("\n");
}

export async function detectHighlights(
  project: Project,
  opts: DetectHighlightsOptions
): Promise<Highlights | null> {
  const prompt = buildHighlightsPrompt(project, opts);
  const { text, agent } = await runAgentText(prompt, {
    agent: opts.agent,
    timeoutMs: opts.timeoutMs,
  });
  const parsed = parseHighlights(text);
  if (!parsed) {
    return null;
  }
  return {
    clips: assignHighlightIds(parsed),
    analyzedAt: new Date().toISOString(),
    agent,
  };
}

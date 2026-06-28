// Main-video subagent: a "visual scene log" of the talking-head footage itself.
// The deck's "subagents read the scenes" applied to the source clip. One agent
// run reads the sample frames extracted at ingest (working/frames/%04d.jpg, one
// per few seconds) alongside the transcript and reports what is on screen across
// spans of source time : speaker, slide, screen-share. The editing agent then
// knows where the footage is already visually interesting versus where it wants
// b-roll cover, instead of treating every second as the same talking head.
//
// Prompt-building, reply-parsing, and line rendering are pure and unit tested;
// only frame listing (fs) and the agent spawn touch the world.
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { runAgentText } from "./agent-driver.ts";
import {
  type Project,
  SAMPLE_RATE,
  type SceneLog,
  type SceneSegment,
} from "./edl.ts";
import { projectPaths } from "./paths.ts";

// Frame cadence at ingest: ffmpeg "fps=1/3" → one frame every 3 seconds, named
// 0001.jpg (≈0s), 0002.jpg (≈3s), … Frame i (1-based) covers (i-1)*step seconds.
const FRAME_STEP_SEC = 3;

// Cap frames handed to one agent run so the prompt (and the vision read) stays
// bounded on a long video; sample evenly across the whole clip.
const MAX_FRAMES = 16;

const TRANSCRIPT_MAX_CHARS = 6000;

const ON_SCREEN = new Set(["speaker", "slide", "screen", "other"]);

export function frameTimeSec(
  index1Based: number,
  step = FRAME_STEP_SEC
): number {
  return Math.max(0, (index1Based - 1) * step);
}

export interface FrameSample {
  atSec: number;
  path: string;
}

// Read the ingest frame dir and return evenly-sampled frames (at most MAX_FRAMES)
// with their source-time stamps. Empty when frames were never extracted.
export function listFrameSamples(
  slug: string,
  maxFrames = MAX_FRAMES
): FrameSample[] {
  const dir = projectPaths(slug).frames;
  if (!existsSync(dir)) {
    return [];
  }
  const files = readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith(".jpg"))
    .sort();
  if (files.length === 0) {
    return [];
  }
  const stepwise = (file: string): FrameSample => {
    const index = Number.parseInt(file.replace(/\D/g, ""), 10) || 1;
    return { atSec: frameTimeSec(index), path: resolve(dir, file) };
  };
  if (files.length <= maxFrames) {
    return files.map(stepwise);
  }
  const stride = files.length / maxFrames;
  const picked: FrameSample[] = [];
  for (let i = 0; i < maxFrames; i += 1) {
    picked.push(stepwise(files[Math.floor(i * stride)]));
  }
  return picked;
}

function transcriptExcerpt(project: Project): string {
  const full = project.words
    .filter((w) => !w.deleted)
    .map((w) => w.text)
    .join(" ")
    .trim();
  return full.length > TRANSCRIPT_MAX_CHARS
    ? `${full.slice(0, TRANSCRIPT_MAX_CHARS)}… [truncated]`
    : full || "[no transcript]";
}

// Self-contained prompt: frames labelled with their timestamp, plus transcript
// for grounding. The model is told to describe ONLY what it can see and to
// return empty segments if it cannot read the frames, so a blind run degrades to
// "skipped" rather than a hallucinated log. JSON only.
export function buildSceneLogPrompt(
  frames: FrameSample[],
  transcript: string,
  totalSec: number
): string {
  const frameList = frames
    .map((f) => `- t=${f.atSec.toFixed(1)}s : ${f.path}`)
    .join("\n");
  return `You are logging what is visually on screen in a ~${totalSec.toFixed(0)}s talking-head video, to help an editor decide where it needs b-roll. Read the sample frames (each labelled with its timestamp) and return ONLY a JSON object:
{"segments":[{"fromSec":0,"toSec":12,"summary":"one concise sentence of what is on screen","onScreen":"speaker|slide|screen|other","brollOpportunity":true|false}]}
Cover the timeline in order with a handful of spans (merge adjacent frames that look the same). Set "brollOpportunity" true when the span is a static talking head that would benefit from b-roll, false when the footage is already showing something (a slide, a demo, a screen-share). Base it ONLY on what you can see; if you cannot read the frames, reply {"segments":[]}. Respond with JSON only: no prose, no code fence.

Frames:
${frameList}

Transcript (for grounding only):
"""
${transcript}
"""`;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Parse the model's {"segments":[…]} reply into validated segments, or null when
// none survive. Mirrors parseAssetCard: direct parse, then a brace-match
// fallback for fenced/prose-wrapped replies.
export function parseSceneLog(text: string): SceneSegment[] | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s) as unknown;
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const braceMatch = text.match(/\{[\s\S]*\}/);
  const obj =
    tryParse(text.trim()) ?? (braceMatch ? tryParse(braceMatch[0]) : null);
  if (!(obj && Array.isArray(obj.segments))) {
    return null;
  }
  const segments: SceneSegment[] = [];
  for (const raw of obj.segments) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const r = raw as Record<string, unknown>;
    const fromSec = num(r.fromSec);
    const toSec = num(r.toSec);
    const summary = typeof r.summary === "string" ? r.summary.trim() : "";
    if (fromSec === null || toSec === null || toSec <= fromSec || !summary) {
      continue;
    }
    const seg: SceneSegment = { fromSec, toSec, summary };
    if (typeof r.onScreen === "string" && ON_SCREEN.has(r.onScreen)) {
      seg.onScreen = r.onScreen as SceneSegment["onScreen"];
    }
    if (typeof r.brollOpportunity === "boolean") {
      seg.brollOpportunity = r.brollOpportunity;
    }
    segments.push(seg);
  }
  return segments.length > 0 ? segments : null;
}

// Render the scene log for an editing prompt: one line per span, flagging the
// b-roll opportunities so the agent can target them.
export function sceneLogLines(sceneLog: SceneLog | undefined): string {
  if (!sceneLog?.segments.length) {
    return "";
  }
  return sceneLog.segments
    .map((s) => {
      const on = s.onScreen ? ` [${s.onScreen}]` : "";
      const flag = s.brollOpportunity ? " (b-roll opportunity)" : "";
      return `- ${s.fromSec.toFixed(1)}-${s.toSec.toFixed(1)}s${on}: ${s.summary}${flag}`;
    })
    .join("\n");
}

export interface SceneLogOptions {
  agent: string;
  timeoutMs?: number;
}

// Analyze the main video into a scene log (or null if frames are missing or the
// agent could not read them). Read-only on project.json: the caller persists it.
export async function analyzeSceneLog(
  slug: string,
  project: Project,
  opts: SceneLogOptions
): Promise<SceneLog | null> {
  const frames = listFrameSamples(slug);
  if (frames.length === 0) {
    return null;
  }
  const totalSec = project.durationSamples / SAMPLE_RATE;
  const prompt = buildSceneLogPrompt(
    frames,
    transcriptExcerpt(project),
    totalSec
  );
  const { text, agent } = await runAgentText(prompt, {
    agent: opts.agent,
    timeoutMs: opts.timeoutMs,
  });
  const segments = parseSceneLog(text);
  if (!segments) {
    return null;
  }
  return { segments, analyzedAt: new Date().toISOString(), agent };
}

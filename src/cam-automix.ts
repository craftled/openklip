// LLM auto scene mix: contextual multicam switching from diarized transcript +
// speaking-span timeline. Prompt-building and reply-parsing are pure and unit
// tested; only the agent spawn touches the world. Degrades to ruleBasedAutoPlan
// when no agent is configured or the model reply is unusable.
import { runAgentText } from "./agent-driver.ts";
import {
  type CamSwitchSettings,
  DEFAULT_CAM_SWITCH_SETTINGS,
  type PlanCam,
  type PlanSpan,
  type SpeakingSpan,
  ruleBasedAutoPlan,
  validatePlan,
} from "./cam-plan.ts";
import { type Word, SAMPLE_RATE } from "./edl.ts";

const TRANSCRIPT_MAX_CHARS = 6000;

export interface AutoMixContext {
  attributions: Array<{ wordId: string; camId: string | null }>;
  cams: Array<{ id: string; name: string; role: "speaker" | "wide" }>;
  durationSamples: number;
  settings?: Partial<CamSwitchSettings>;
  silences?: Array<{ startSec: number; endSec: number }>;
  spans: SpeakingSpan[];
  words: Array<Pick<Word, "id" | "text" | "startSample" | "endSample">>;
}

export interface AutoMixResult {
  fallback: boolean;
  plan: PlanSpan[];
  plannedBy: string;
  raw?: string;
}

function samplesToSec(samples: number): number {
  return samples / SAMPLE_RATE;
}

function secToSamples(sec: number): number {
  return Math.round(sec * SAMPLE_RATE);
}

function resolveSettings(
  partial?: Partial<CamSwitchSettings>
): CamSwitchSettings {
  return { ...DEFAULT_CAM_SWITCH_SETTINGS, ...partial };
}

function camNameById(
  cams: AutoMixContext["cams"]
): Map<string, string> {
  return new Map(cams.map((c) => [c.id, c.name]));
}

function attributionByWordId(
  attributions: AutoMixContext["attributions"]
): Map<string, string | null> {
  return new Map(attributions.map((a) => [a.wordId, a.camId]));
}

function speakerLabel(
  wordId: string,
  cams: AutoMixContext["cams"],
  attrMap: Map<string, string | null>,
  nameMap: Map<string, string>
): string {
  const camId = attrMap.get(wordId);
  if (camId) {
    return nameMap.get(camId) ?? camId;
  }
  const firstSpeaker = cams.find((c) => c.role === "speaker");
  return firstSpeaker?.name ?? "Unknown";
}

function buildSpeakerTranscript(ctx: AutoMixContext): string {
  const nameMap = camNameById(ctx.cams);
  const attrMap = attributionByWordId(ctx.attributions);
  const lines: string[] = [];
  let buf: string[] = [];
  let lineStart = 0;
  let lineSpeaker = "";

  for (const w of ctx.words) {
    const start = samplesToSec(w.startSample);
    const speaker = speakerLabel(w.id, ctx.cams, attrMap, nameMap);
    if (buf.length === 0) {
      lineStart = start;
      lineSpeaker = speaker;
    }
    buf.push(w.text);
    const joined = buf.join(" ");
    const endsSentence = /[.!?]$/.test(w.text);
    if (joined.length >= 180 || endsSentence) {
      const end = samplesToSec(w.endSample);
      lines.push(
        `[${lineStart.toFixed(1)}-${end.toFixed(1)}s] ${lineSpeaker}: ${joined}`
      );
      buf = [];
    }
  }

  if (buf.length > 0) {
    const last = ctx.words.at(-1);
    const end = last ? samplesToSec(last.endSample) : lineStart;
    lines.push(
      `[${lineStart.toFixed(1)}-${end.toFixed(1)}s] ${lineSpeaker}: ${buf.join(" ")}`
    );
  }

  const full = lines.join("\n");
  return full.length > TRANSCRIPT_MAX_CHARS
    ? `${full.slice(0, TRANSCRIPT_MAX_CHARS)}… [truncated]`
    : full || "[no transcript]";
}

function buildSpeakingTimeline(ctx: AutoMixContext): string {
  const nameMap = camNameById(ctx.cams);
  return ctx.spans
    .map((s) => {
      const name = nameMap.get(s.camId) ?? s.camId;
      const from = samplesToSec(s.fromSample).toFixed(1);
      const to = samplesToSec(s.toSample).toFixed(1);
      return `- ${s.camId} (${name}): ${from}-${to}s`;
    })
    .join("\n");
}

function buildCastList(ctx: AutoMixContext): string {
  const hasWideCam = ctx.cams.some((c) => c.role === "wide");
  const castLines = ctx.cams.map(
    (c) => `- ${c.id}: ${c.name} (${c.role})`
  );
  const wideNote = hasWideCam
    ? "A dedicated wide camera is registered; synthetic \"wide\" is also always available as a valid shot."
    : "No dedicated wide camera is registered, but synthetic \"wide\" is always available as a valid shot.";
  return `${castLines.join("\n")}\n${wideNote}`;
}

export function buildAutoMixPrompt(ctx: AutoMixContext): string {
  const settings = resolveSettings(ctx.settings);
  const totalSec = samplesToSec(ctx.durationSamples);
  const transcript = buildSpeakerTranscript(ctx);
  const timeline = buildSpeakingTimeline(ctx);
  const cast = buildCastList(ctx);

  return `You are planning a multicam "auto scene mix" for a ~${totalSec.toFixed(0)}s conversation. Choose camera shots that follow the speakers, cut to reactions, and use wide shots for crosstalk or variety. Read the cast, speaker-labeled transcript, and speaking-span timeline below. Return ONLY JSON:
{"spans":[{"fromSec":0,"toSec":12.5,"shot":"cam1","reason":"..."}]}
Rules: cover the full ${totalSec.toFixed(1)}s timeline in order with contiguous spans; each "shot" is a camera id from the cast or the synthetic "wide" shot; vary angles for reactions and group moments; respect minimum shot length (~${settings.minShotMs}ms), maximum shot length (~${settings.maxShotMs}ms), and ignore backchannels shorter than ~${settings.interjectionMs}ms. If you cannot plan the mix, reply {"spans":[]}. Respond with JSON only: no prose, no code fence.

Constraints:
- minShotMs: ${settings.minShotMs}
- maxShotMs: ${settings.maxShotMs}
- interjectionMs: ${settings.interjectionMs}

Cast:
${cast}

Speaking-span timeline (who was talking, in seconds):
${timeline || "[no speaking spans]"}

Speaker-labeled transcript:
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

export function parseAutoMixReply(
  text: string,
  _opts: { durationSamples: number }
): PlanSpan[] {
  const tryParse = (raw: string): PlanSpan[] => {
    try {
      const obj = JSON.parse(raw) as { spans?: unknown };
      if (!Array.isArray(obj.spans)) {
        return [];
      }
      const out: PlanSpan[] = [];
      for (const item of obj.spans) {
        if (!item || typeof item !== "object") {
          continue;
        }
        const row = item as Record<string, unknown>;
        const fromSec = num(row.fromSec);
        const toSec = num(row.toSec);
        const shot = str(row.shot);
        if (
          fromSec === null ||
          toSec === null ||
          shot === null ||
          fromSec < 0 ||
          toSec <= fromSec
        ) {
          continue;
        }
        const reason = str(row.reason);
        out.push({
          fromSample: secToSamples(fromSec),
          toSample: secToSamples(toSec),
          shot,
          ...(reason ? { reason } : {}),
        });
      }
      return out;
    } catch {
      return [];
    }
  };

  const direct = tryParse(text.trim());
  if (direct.length > 0) {
    return direct;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return [];
  }
  return tryParse(text.slice(start, end + 1));
}

function toPlanCams(cams: AutoMixContext["cams"]): PlanCam[] {
  return cams.map(({ id, role }) => ({ id, role }));
}

async function defaultRunText(
  prompt: string,
  opts: { agent?: string; timeoutMs?: number }
): Promise<string> {
  if (!opts.agent) {
    throw new Error("no agent configured");
  }
  const result = await runAgentText(prompt, {
    agent: opts.agent,
    timeoutMs: opts.timeoutMs,
  });
  return result.text;
}

function rulesFallback(ctx: AutoMixContext, planCams: PlanCam[]): PlanSpan[] {
  const rules = ruleBasedAutoPlan(ctx.spans, {
    cams: planCams,
    durationSamples: ctx.durationSamples,
    settings: ctx.settings,
  });
  return validatePlan(rules, {
    cams: planCams,
    durationSamples: ctx.durationSamples,
    settings: ctx.settings,
    silences: ctx.silences,
    fallback: rules,
  });
}

export async function autoMixPlan(
  ctx: AutoMixContext,
  opts?: {
    agent?: string;
    runText?: (
      prompt: string,
      opts: { agent?: string; timeoutMs?: number }
    ) => Promise<string>;
    timeoutMs?: number;
  }
): Promise<AutoMixResult> {
  const planCams = toPlanCams(ctx.cams);
  const rulesPlan = rulesFallback(ctx, planCams);

  const hasInjectedRunText = opts?.runText !== undefined;
  const agent = opts?.agent;

  if (!hasInjectedRunText && !agent) {
    return {
      plan: rulesPlan,
      plannedBy: "rules",
      fallback: true,
    };
  }

  const runText = opts?.runText ?? defaultRunText;

  try {
    const reply = await runText(buildAutoMixPrompt(ctx), {
      agent,
      timeoutMs: opts?.timeoutMs,
    });
    const raw = parseAutoMixReply(reply, {
      durationSamples: ctx.durationSamples,
    });
    if (raw.length === 0) {
      return {
        plan: rulesPlan,
        plannedBy: "rules",
        fallback: true,
      };
    }
    const rules = ruleBasedAutoPlan(ctx.spans, {
      cams: planCams,
      durationSamples: ctx.durationSamples,
      settings: ctx.settings,
    });
    const plan = validatePlan(raw, {
      cams: planCams,
      durationSamples: ctx.durationSamples,
      settings: ctx.settings,
      silences: ctx.silences,
      fallback: rules,
    });
    return {
      plan,
      plannedBy: agent ?? "agent",
      raw: reply,
      fallback: false,
    };
  } catch {
    return {
      plan: rulesPlan,
      plannedBy: "rules",
      fallback: true,
    };
  }
}
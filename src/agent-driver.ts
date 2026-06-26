// Agent driver: borrow the user's existing coding-agent subscription to do
// transcript-level reasoning — no API keys, no bundled LLM. This is "Mode B" of
// the agent-native thesis: OpenKlip shells out to whichever agent CLI the user
// picked in the GUI (Claude Code, Codex, Cursor, Grok), hands it the transcript,
// and applies the structured answer through the normal EDL mutations.
//
// Each agent emits its answer differently, so we extract the model's final text
// from the cleanest channel that CLI offers, then parse the {cut:[…]} JSON:
//   - Claude / Cursor: `--output-format json` → an envelope whose `.result` is
//     the model's text.
//   - Codex: `--output-last-message <file>` → writes ONLY the final message.
//   - Grok: plain `-p` → clean JSON straight on stdout (its --output-format
//     prints nothing; the noise is all on stderr, which we discard).
// Prompt-building, agent resolution, extraction and parsing are pure and
// unit-tested against real captured fixtures; only the spawn touches the world.
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export interface PromptWord {
  id: string;
  text: string;
}

// How to recover the model's final text from an agent's output.
export type OutputMode = "envelope" | "file" | "raw";

// How to tell whether an installed agent is authenticated (cheaply, no model
// call): the host session is always connected; some CLIs expose a status
// subcommand; others just leave an auth credential file on disk.
export type AuthStrategy =
  | { kind: "host" }
  | { kind: "status"; args: string[] }
  | { kind: "file"; relPath: string };

export interface AgentSpec {
  auth: AuthStrategy;
  buildArgs: (
    prompt: string,
    ctx: { model?: string; lastMessageFile?: string }
  ) => string[];
  cli: string;
  id: "claude" | "codex" | "cursor" | "grok";
  label: string;
  match: string;
  outputMode: OutputMode;
  usesModelFlag: boolean;
}

export const AGENTS: AgentSpec[] = [
  {
    id: "claude",
    label: "Claude",
    cli: "claude",
    match: "claude",
    usesModelFlag: true,
    outputMode: "envelope",
    auth: { kind: "host" },
    buildArgs: (prompt, { model }) => [
      "-p",
      prompt,
      "--output-format",
      "json",
      ...(model ? ["--model", model] : []),
    ],
  },
  {
    id: "codex",
    label: "Codex",
    cli: "codex",
    match: "gpt",
    usesModelFlag: false,
    outputMode: "file",
    auth: { kind: "status", args: ["login", "status"] },
    // Read-only sandbox (no repo writes) + final message to a file (no noise).
    buildArgs: (prompt, { lastMessageFile }) => [
      "exec",
      "--sandbox",
      "read-only",
      ...(lastMessageFile ? ["--output-last-message", lastMessageFile] : []),
      prompt,
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    cli: "cursor-agent",
    match: "composer",
    usesModelFlag: false,
    outputMode: "envelope",
    auth: { kind: "status", args: ["status"] },
    buildArgs: (prompt) => ["-p", prompt, "--output-format", "json"],
  },
  {
    id: "grok",
    label: "Grok",
    cli: "grok",
    match: "grok",
    usesModelFlag: false,
    outputMode: "raw",
    auth: { kind: "file", relPath: ".grok/auth.json" },
    buildArgs: (prompt) => ["-p", prompt],
  },
];

export function resolveAgent(selectorValue: string): AgentSpec {
  const spec = AGENTS.find((a) => selectorValue.startsWith(a.match));
  if (!spec) {
    throw new Error(`no agent adapter for "${selectorValue}"`);
  }
  return spec;
}

export interface AuthSignals {
  fileExists?: boolean;
  statusExit?: number;
  statusText?: string;
}

// Decide whether an agent is authenticated from the gathered signals. Pure, so
// the badge logic is unit-tested independently of spawning anything.
export function isConnected(auth: AuthStrategy, signals: AuthSignals): boolean {
  switch (auth.kind) {
    case "host":
      return true;
    case "status":
      return (
        signals.statusExit === 0 && /logged in/i.test(signals.statusText ?? "")
      );
    case "file":
      return signals.fileExists === true;
    default:
      return false;
  }
}

// The exact command to sign this agent in, or null for the host (Claude Code is
// the running session — nothing to sign into).
export function signInCommand(spec: AgentSpec): string | null {
  return spec.auth.kind === "host" ? null : `${spec.cli} login`;
}

export interface AgentStatus {
  cli: string;
  connected: boolean;
  id: AgentSpec["id"];
  installed: boolean;
  label: string;
  // Command to run to connect (e.g. "codex login"); null for the host agent.
  signInCmd: string | null;
}

// Probe every agent: installed (on PATH) and connected (authenticated). Cheap —
// a PATH lookup plus, for status-based CLIs, one short `… status` spawn (no model
// call, browser disabled, 6s cap). Safe to call on GUI mount.
export async function detectAgents(): Promise<AgentStatus[]> {
  return await Promise.all(
    AGENTS.map(async (spec) => {
      const cli = Bun.which(spec.cli);
      const signInCmd = signInCommand(spec);
      if (!cli) {
        return {
          id: spec.id,
          label: spec.label,
          cli: spec.cli,
          installed: false,
          connected: false,
          signInCmd,
        };
      }
      let connected = false;
      if (spec.auth.kind === "host") {
        connected = true;
      } else if (spec.auth.kind === "file") {
        connected = existsSync(join(homedir(), spec.auth.relPath));
      } else {
        connected = await probeStatus(cli, spec.auth);
      }
      return {
        id: spec.id,
        label: spec.label,
        cli: spec.cli,
        installed: true,
        connected,
        signInCmd,
      };
    })
  );
}

async function probeStatus(
  cli: string,
  auth: Extract<AuthStrategy, { kind: "status" }>
): Promise<boolean> {
  try {
    const proc = Bun.spawn([cli, ...auth.args], {
      stdout: "pipe",
      stderr: "pipe",
      // Never let a not-logged-in `status` pop a browser / block.
      env: { ...sanitizedEnv(), NO_OPEN_BROWSER: "1" },
    });
    const timer = setTimeout(() => proc.kill(), 6000);
    try {
      const text =
        (await new Response(proc.stdout).text()) +
        (await new Response(proc.stderr).text());
      await proc.exited;
      return isConnected(auth, {
        statusText: text,
        statusExit: proc.exitCode ?? 1,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

// Self-contained filler-detection prompt. Everything the agent needs is in the
// text, so it never has to call a tool — it just reasons and replies JSON.
export function buildFillerPrompt(words: PromptWord[]): string {
  const tokens = words.map((w) => `${w.id}:${w.text}`).join(" ");
  return `You are editing a spoken-video transcript. Each token is "id:text". Return ONLY a JSON object {"cut":[ids]} listing the word ids that are filler words or false starts — "um", "uh", "er", "you know", "like", "sort of", "kind of", "I mean". Do NOT cut meaningful content words. Respond with JSON only, no prose.\n\n${tokens}`;
}

// Recover the model's final text from an agent's output channel.
export function extractModelText(
  mode: OutputMode,
  stdout: string,
  fileContent: string
): string {
  if (mode === "file") {
    return fileContent;
  }
  if (mode === "envelope") {
    try {
      const env = JSON.parse(stdout) as { result?: unknown };
      if (typeof env.result === "string") {
        return env.result;
      }
    } catch {
      // Not an envelope — fall through to the raw text.
    }
  }
  return stdout;
}

// Parse {"cut":[ids]} from the model's text. The text is clean by the time it
// reaches here, so a direct JSON.parse is the primary path; a tight regex is the
// fallback for the rare fenced/prose-wrapped reply.
export function parseCutIds(text: string): string[] {
  const fromJson = (s: string): string[] | null => {
    try {
      const obj = JSON.parse(s) as { cut?: unknown };
      if (Array.isArray(obj.cut)) {
        return obj.cut.filter((x): x is string => typeof x === "string");
      }
    } catch {
      // not parseable
    }
    return null;
  };
  const direct = fromJson(text.trim());
  if (direct) {
    return direct;
  }
  const match = text.match(/\{\s*"cut"\s*:\s*\[[^\]]*\]\s*\}/);
  if (match) {
    const fromRegex = fromJson(match[0]);
    if (fromRegex) {
      return fromRegex;
    }
  }
  return [];
}

// Extraction + parse, composed. Pure — tested against real captured fixtures.
export function parseAgentOutput(
  mode: OutputMode,
  stdout: string,
  fileContent = ""
): string[] {
  return parseCutIds(extractModelText(mode, stdout, fileContent));
}

// Drop `--bun` from NODE_OPTIONS so a spawned agent CLI (which bundles its own
// Node) doesn't inherit the parent bun runtime's injection and crash.
export function stripBunNodeOptions(
  env: Record<string, string | undefined>
): Record<string, string | undefined> {
  const opts = env.NODE_OPTIONS;
  if (!opts?.includes("--bun")) {
    return env;
  }
  const cleaned = opts.replace(/--bun/g, "").replace(/\s+/g, " ").trim();
  if (cleaned) {
    return { ...env, NODE_OPTIONS: cleaned };
  }
  // Omit NODE_OPTIONS entirely when nothing else was set.
  const { NODE_OPTIONS: _omit, ...rest } = env;
  return rest;
}

function sanitizedEnv(): Record<string, string | undefined> {
  return stripBunNodeOptions(process.env as Record<string, string | undefined>);
}

export interface FillerRun {
  agent: string;
  ids: string[];
  raw: string;
}

// Spawn the selected agent headless against the transcript and return suggested
// word ids. Uses the user's subscription for that agent (no API key).
export async function runFillerAgent(
  words: PromptWord[],
  opts: { agent: string; timeoutMs?: number }
): Promise<FillerRun> {
  const spec = resolveAgent(opts.agent);
  const cli = Bun.which(spec.cli);
  if (!cli) {
    throw new Error(
      `${spec.label} CLI ("${spec.cli}") not found on PATH — install it to use this agent`
    );
  }
  const model = spec.usesModelFlag ? opts.agent : undefined;
  const lastMessageFile =
    spec.outputMode === "file"
      ? join(tmpdir(), `openklip-agent-${process.pid}-${Date.now()}.txt`)
      : undefined;
  const args = spec.buildArgs(buildFillerPrompt(words), {
    model,
    lastMessageFile,
  });
  const proc = Bun.spawn([cli, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: sanitizedEnv(),
  });
  const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 180_000);
  try {
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(
        `${spec.label} failed (exit ${proc.exitCode}): ${err.trim().slice(-400) || "no output"}`
      );
    }
    let fileContent = "";
    if (lastMessageFile) {
      try {
        fileContent = await Bun.file(lastMessageFile).text();
      } catch {
        // file missing — extraction falls back to stdout
      }
    }
    const ids = parseAgentOutput(spec.outputMode, stdout, fileContent);
    return { ids, raw: stdout, agent: spec.label };
  } finally {
    clearTimeout(timer);
    if (lastMessageFile) {
      try {
        await Bun.file(lastMessageFile).delete();
      } catch {
        // best-effort cleanup
      }
    }
  }
}

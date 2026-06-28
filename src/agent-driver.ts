// Agent driver: borrow the user's existing coding-agent subscription to do
// transcript-level reasoning : no API keys, no bundled LLM. This is "Mode B" of
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
// the running session : nothing to sign into).
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

// Probe every agent: installed (on PATH) and connected (authenticated). Cheap :
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
// text, so it never has to call a tool : it just reasons and replies JSON.
export function buildFillerPrompt(words: PromptWord[]): string {
  const tokens = words.map((w) => `${w.id}:${w.text}`).join(" ");
  return `You are editing a spoken-video transcript. Each token is "id:text". Return ONLY a JSON object {"cut":[ids]} listing the word ids that are filler words or false starts : "um", "uh", "er", "you know", "like", "sort of", "kind of", "I mean". Do NOT cut meaningful content words. Respond with JSON only, no prose.\n\n${tokens}`;
}

// Chat prompt: ground the agent in the project transcript so a free-text
// question gets a real, project-aware answer (not a canned hint). Pure + bounded
// so latency and context stay sane on every agent CLI. The transcript is the
// kept words only (deleted = cut), joined as plain text.
export function buildChatPrompt(
  ctx: {
    assetCards?: string;
    sceneLog?: string;
    template?: string;
    words: Array<{ deleted?: boolean; text: string }>;
  },
  question: string,
  opts: { maxChars?: number } = {}
): string {
  const maxChars = opts.maxChars ?? 12_000;
  const full = ctx.words
    .filter((w) => !w.deleted)
    .map((w) => w.text)
    .join(" ")
    .trim();
  const transcript =
    full.length > maxChars
      ? `${full.slice(0, maxChars)}… [transcript truncated]`
      : full || "[no transcript yet]";
  const templateLine = ctx.template
    ? `\nThis project uses the "${ctx.template}" edit template.`
    : "";
  return `You are OpenKlip's editing assistant for a spoken-video project. Answer the user's question concisely and concretely, grounded in the transcript below. Never invent transcript content. Reply with the answer only: no preamble, no CLI commands, no step-by-step instructions, no narration of your reasoning.${templateLine}

Transcript:
"""
${transcript}
"""
${assetBlock(ctx.assetCards)}${sceneBlock(ctx.sceneLog)}
User: ${question}`;
}

// Render the analyzed-asset bin for a prompt, or "" when nothing is carded yet.
function assetBlock(assetCards?: string): string {
  const cards = assetCards?.trim();
  if (!cards) {
    return "";
  }
  return `
Available media assets (reference by id):
${cards}
`;
}

// Render the main-video scene log for a prompt, or "" when not analyzed yet.
function sceneBlock(sceneLog?: string): string {
  const log = sceneLog?.trim();
  if (!log) {
    return "";
  }
  return `
Visual scene log of the source video (source-time spans):
${log}
`;
}

// Edit prompt for the tool-calling path: the model has the openklip MCP tools
// and is expected to DO the edit (not describe it). Reply is a short past-tense
// confirmation of what changed, never CLI commands or how-to.
export function buildEditPrompt(
  ctx: {
    assetCards?: string;
    sceneLog?: string;
    template?: string;
    words: Array<{ deleted?: boolean; text: string }>;
  },
  slug: string,
  question: string,
  opts: { maxChars?: number } = {}
): string {
  const maxChars = opts.maxChars ?? 12_000;
  const full = ctx.words
    .filter((w) => !w.deleted)
    .map((w) => w.text)
    .join(" ")
    .trim();
  const transcript =
    full.length > maxChars
      ? `${full.slice(0, maxChars)}… [transcript truncated]`
      : full || "[no transcript yet]";
  const templateLine = ctx.template
    ? `\nCurrent template: "${ctx.template}".`
    : "";
  return `You are OpenKlip's video editor working on the project with slug "${slug}". You have openklip tools that DIRECTLY edit this project: cut filler, cut words by text, add push-in zooms, titles, and b-roll on spoken phrases, set the edit template, and export. Pass slug "${slug}" to every tool.

When the user asks for a change, DO it by calling the tools. Never print CLI commands and never explain how to do it yourself. After editing, reply with ONE short past-tense sentence naming exactly what you changed (e.g. "Cut 3 filler words." or "Added a push-in zoom on 'hello world'."). If you could not do it, say why in one line. If the user only asks a question, answer briefly from the transcript and make no edits.${templateLine}

Transcript:
"""
${transcript}
"""
${assetBlock(ctx.assetCards)}${sceneBlock(ctx.sceneLog)}
User: ${question}`;
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
      // Not an envelope : fall through to the raw text.
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

// Extraction + parse, composed. Pure : tested against real captured fixtures.
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

export interface AgentTextRun {
  agent: string;
  raw: string;
  text: string;
}

// Spawn the selected agent headless with an arbitrary prompt and return the
// model's final text. Uses the user's subscription for that agent (no API key).
// This is the generic runner: filler-cutting and free-text chat both go through
// it; only the prompt and how the reply is parsed differ.
export async function runAgentText(
  prompt: string,
  opts: { agent: string; timeoutMs?: number }
): Promise<AgentTextRun> {
  const spec = resolveAgent(opts.agent);
  const cli = Bun.which(spec.cli);
  if (!cli) {
    throw new Error(
      `${spec.label} CLI ("${spec.cli}") not found on PATH : install it to use this agent`
    );
  }
  const model = spec.usesModelFlag ? opts.agent : undefined;
  const lastMessageFile =
    spec.outputMode === "file"
      ? join(tmpdir(), `openklip-agent-${process.pid}-${Date.now()}.txt`)
      : undefined;
  const args = spec.buildArgs(prompt, { model, lastMessageFile });
  const proc = Bun.spawn([cli, ...args], {
    // Close stdin so a headless CLI never blocks waiting for piped input.
    stdin: "ignore",
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
        // file missing : extraction falls back to stdout
      }
    }
    const text = extractModelText(spec.outputMode, stdout, fileContent);
    return { text, raw: stdout, agent: spec.label };
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

// Agents whose CLI can load an MCP server and call its tools headlessly. Only
// these can run the tool-editing chat path; others fall back to a text answer.
export function supportsToolEditing(agent: string): boolean {
  try {
    return resolveAgent(agent).id === "claude";
  } catch {
    return false;
  }
}

export interface AgentEditRun {
  agent: string;
  raw: string;
  text: string;
}

// Tool-editing chat path (Claude): run headless with the openklip MCP server
// loaded so the model actually CALLS the edit tools against the project instead
// of describing CLI commands. Reuses the same stdio server the CLI and Cursor
// use; OPENKLIP_PROJECTS_ROOT + OPENKLIP_SLUG scope it to the active project.
export async function runClaudeEdit(
  prompt: string,
  opts: {
    agent: string;
    mcpServerPath: string;
    projectsRoot: string;
    slug: string;
    timeoutMs?: number;
  }
): Promise<AgentEditRun> {
  const spec = resolveAgent(opts.agent);
  const cli = Bun.which(spec.cli);
  if (!cli) {
    throw new Error(
      `${spec.label} CLI ("${spec.cli}") not found on PATH : install it to use this agent`
    );
  }
  const cfgPath = join(
    tmpdir(),
    `openklip-mcp-${process.pid}-${Date.now()}.json`
  );
  await Bun.write(
    cfgPath,
    JSON.stringify({
      mcpServers: {
        openklip: {
          command: "bun",
          args: ["run", opts.mcpServerPath],
          env: {
            OPENKLIP_PROJECTS_ROOT: opts.projectsRoot,
            OPENKLIP_SLUG: opts.slug,
          },
        },
      },
    })
  );
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--mcp-config",
    cfgPath,
    "--strict-mcp-config",
    "--allowedTools",
    "mcp__openklip",
    "--permission-mode",
    "acceptEdits",
    ...(spec.usesModelFlag ? ["--model", opts.agent] : []),
  ];
  const proc = Bun.spawn([cli, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: sanitizedEnv(),
  });
  // Tool-calling is multi-turn, so allow more wall-clock than a single answer.
  const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 240_000);
  try {
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(
        `${spec.label} failed (exit ${proc.exitCode}): ${err.trim().slice(-400) || "no output"}`
      );
    }
    const text = extractModelText("envelope", stdout, "");
    return { text, raw: stdout, agent: spec.label };
  } finally {
    clearTimeout(timer);
    try {
      await Bun.file(cfgPath).delete();
    } catch {
      // best-effort cleanup
    }
  }
}

export interface FillerRun {
  agent: string;
  ids: string[];
  raw: string;
}

// Filler-detection pass: run the transcript through the agent and parse the
// {"cut":[ids]} reply into word ids.
export async function runFillerAgent(
  words: PromptWord[],
  opts: { agent: string; timeoutMs?: number }
): Promise<FillerRun> {
  const { text, raw, agent } = await runAgentText(
    buildFillerPrompt(words),
    opts
  );
  return { ids: parseCutIds(text), raw, agent };
}

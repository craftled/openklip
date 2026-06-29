// `openklip call`: invoke any agent tool with JSON in/out for bash/Pi/Codex
// harnesses that prefer a single subprocess over MCP or 50+ CLI verbs.
import { callAgentTool, getAgentTool } from "./agent-tools.ts";

export function parseCallJson(
  raw: string,
  label: string
): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`invalid JSON for ${label}: ${(e as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

/** Build the tool input from CLI flags and optional stdin JSON. */
export function buildCallInput(opts: {
  json?: string;
  slug?: string;
  stdinJson?: string;
}): Record<string, unknown> {
  const fromStdin = opts.stdinJson?.trim();
  const base = fromStdin
    ? parseCallJson(fromStdin, "--stdin")
    : parseCallJson(opts.json ?? "{}", "--json");
  if (opts.slug) {
    return { ...base, slug: opts.slug };
  }
  return base;
}

export async function runCallTool(
  tool: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const name = tool.trim();
  if (!name) {
    throw new Error(
      "usage: openklip call <tool> [--slug <slug>] [--json '{}'] [--stdin]"
    );
  }
  if (!getAgentTool(name)) {
    throw new Error(`unknown agent tool "${name}"`);
  }
  return await callAgentTool(name, input);
}

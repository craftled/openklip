// Append-only per-project action history (working/actions.jsonl). Every logged
// registry mutation, from any surface (GUI, CLI, MCP, agent), appends one JSON
// line here so "what happened to this edit" is answerable after the fact.
// Pure Node fs (no Bun globals) so it runs under Next on Bun or Node.
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import {
  type ActionLogEntry,
  type Actor,
  isActionLogEntry,
} from "./action-log-entry.ts";
import { projectPaths } from "./paths.ts";

export type { ActionLogEntry, Actor } from "./action-log-entry.ts";

const ACTORS: readonly Actor[] = ["human", "agent", "cli", "mcp"];

/** OPENKLIP_ACTOR, when set to a known actor; undefined otherwise. */
export function actorFromEnv(): Actor | undefined {
  const raw = process.env.OPENKLIP_ACTOR;
  return ACTORS.includes(raw as Actor) ? (raw as Actor) : undefined;
}

const SUMMARY_MAX = 200;

// One-line, bounded description of an arbitrary value for the log. Never
// throws: circular structures fall back to String(value), and undefined stays
// undefined so the field is omitted from the entry.
export function summarizeForLog(value: unknown): string | undefined {
  if (value === undefined) {
    return;
  }
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX)}...` : text;
}

/** Append one entry as a single JSON line, creating working/ if needed. */
export async function appendActionLog(
  slug: string,
  entry: ActionLogEntry
): Promise<void> {
  const p = projectPaths(slug);
  await mkdir(p.working, { recursive: true });
  await appendFile(p.actionsLog, `${JSON.stringify(entry)}\n`);
}

function parseLogLine(line: string): ActionLogEntry | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }
  return isActionLogEntry(parsed) ? parsed : undefined;
}

// Read the log newest first. A missing file is an empty history; corrupt lines
// (crash mid-append, hand edits) are skipped rather than failing the read.
export async function readActionLog(
  slug: string,
  opts: { limit?: number } = {}
): Promise<ActionLogEntry[]> {
  const fp = projectPaths(slug).actionsLog;
  if (!existsSync(fp)) {
    return [];
  }
  let raw: string;
  try {
    raw = await readFile(fp, "utf8");
  } catch {
    return [];
  }
  const entries: ActionLogEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const entry = parseLogLine(line);
    if (entry) {
      entries.push(entry);
    }
  }
  entries.reverse();
  return opts.limit === undefined ? entries : entries.slice(0, opts.limit);
}

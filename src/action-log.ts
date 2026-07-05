import { existsSync, statSync } from "node:fs";
import { appendFile, mkdir, open, readFile } from "node:fs/promises";
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
const TAIL_CHUNK_BYTES = 64 * 1024;

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

// True when the file's last byte is a newline. Used to detect a torn tail
// left by a crash mid-append (mutateProject saves project.json BEFORE the
// log append, so a crash between them leaves a bumped revision and a
// partial, unterminated line). Reads a single byte, not the whole file, so
// this stays cheap on a large log.
async function endsWithNewline(path: string): Promise<boolean> {
  const size = statSync(path).size;
  if (size === 0) {
    return true;
  }
  const handle = await open(path, "r");
  try {
    const buf = Buffer.alloc(1);
    await handle.read(buf, 0, 1, size - 1);
    return buf[0] === 0x0a;
  } finally {
    await handle.close();
  }
}

/** Append one entry as a single JSON line, creating working/ if needed.
 *
 * Heals a torn tail first: if the log already exists and its last byte is
 * NOT a newline (a previous append crashed mid-write), this prepends a
 * newline so the new entry starts its own line instead of gluing onto the
 * partial one. The torn line stays unparseable and is skipped by
 * readActionLog either way, but without this the glued line becomes
 * unparseable TOO, silently swallowing the entry being appended right now
 * (see the "torn actions.jsonl tail" hazard). */
export async function appendActionLog(
  slug: string,
  entry: ActionLogEntry
): Promise<void> {
  const p = projectPaths(slug);
  await mkdir(p.working, { recursive: true });
  const needsHealing =
    existsSync(p.actionsLog) && !(await endsWithNewline(p.actionsLog));
  const prefix = needsHealing ? "\n" : "";
  await appendFile(p.actionsLog, `${prefix}${JSON.stringify(entry)}\n`);
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

async function readActionLogTail(
  path: string,
  limit: number
): Promise<ActionLogEntry[]> {
  const size = statSync(path).size;
  if (size === 0) {
    return [];
  }

  const entries: ActionLogEntry[] = [];
  let position = size;
  let partial = "";

  while (position > 0 && entries.length < limit) {
    const readSize = Math.min(TAIL_CHUNK_BYTES, position);
    position -= readSize;
    const handle = await open(path, "r");
    let chunk = "";
    try {
      const buf = Buffer.alloc(readSize);
      await handle.read(buf, 0, readSize, position);
      chunk = buf.toString("utf8");
    } finally {
      await handle.close();
    }

    const combined = chunk + partial;
    const lines = combined.split("\n");
    partial = lines.shift() ?? "";

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]?.trim();
      if (!line) {
        continue;
      }
      const entry = parseLogLine(line);
      if (entry) {
        entries.push(entry);
        if (entries.length >= limit) {
          break;
        }
      }
    }
  }

  if (entries.length < limit && partial.trim()) {
    const entry = parseLogLine(partial.trim());
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
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
  if (opts.limit !== undefined) {
    return readActionLogTail(fp, opts.limit);
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
  return entries;
}

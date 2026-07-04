// The action-history entry shape and its validator, kept free of node imports
// so client components (the History panel) can share the exact same shape
// check as the server-side log reader without dragging node:fs into the
// browser bundle. Import the guard from HERE; src/action-log.ts re-exports
// only the types.

/** Which surface performed a mutation. "system" is background maintenance
 * with no human or agent behind it (e.g. asset-scanner pruning a vanished
 * registration during a folder sync poll), never set via OPENKLIP_ACTOR. */
export type Actor = "human" | "agent" | "cli" | "mcp" | "system";

export interface ActionLogEntry {
  /** Action name (registry action or a stable pseudo-name like "edit-words"). */
  action: string;
  actor: Actor;
  /** Surface that performed the edit: gui, claude-code, codex, cursor, cli, mcp. */
  agentSurface?: string;
  /** Timestamp in epoch milliseconds. */
  at: number;
  /** Proof-style author identity, e.g. human:local or ai:claude:claude-sonnet-4-6. */
  authorId?: string;
  /** Truncated JSON summary of the action input. */
  input?: string;
  /** Raw agent model slug when an LLM drove the edit. */
  model?: string;
  /** Truncated JSON summary of the action result. */
  result?: string;
  revisionAfter: number;
  revisionBefore: number;
  /** Id of the spawned agent task this mutation ran under, when any. */
  taskId?: string;
}

// Shared shape check for one untrusted log entry: parseLogLine (disk) and the
// history panel (API payload) must accept exactly the same rows.
export function isActionLogEntry(value: unknown): value is ActionLogEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Partial<ActionLogEntry>;
  return (
    typeof entry.action === "string" &&
    typeof entry.actor === "string" &&
    typeof entry.at === "number" &&
    typeof entry.revisionBefore === "number" &&
    typeof entry.revisionAfter === "number" &&
    // input/result render as React children; a mangled row with an object
    // here would crash the History panel ("Objects are not valid as a child").
    (entry.input === undefined || typeof entry.input === "string") &&
    (entry.result === undefined || typeof entry.result === "string") &&
    (entry.taskId === undefined || typeof entry.taskId === "string") &&
    (entry.authorId === undefined || typeof entry.authorId === "string") &&
    (entry.agentSurface === undefined ||
      typeof entry.agentSurface === "string") &&
    (entry.model === undefined || typeof entry.model === "string")
  );
}

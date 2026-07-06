// The agent-task shape, kept free of node imports so client components (a
// future task-progress panel) can share the exact same shape as the server
// engine without dragging node:fs into the browser bundle. Import types from
// HERE; src/agent-tasks.ts re-exports only the types. Pattern: action-log-entry.ts.
import type { Actor } from "./action-log-entry.ts";

/** Overall lifecycle state of one agent run. */
export type AgentTaskStatus =
  // Reserved for future queued tasks: createAgentTask starts a task at
  // "running" directly, so nothing produces "pending" today.
  "pending" | "running" | "blocked" | "failed" | "completed" | "cancelled";

/** State of a single reported step within a task. */
export type AgentTaskStepStatus = "pending" | "running" | "done" | "failed";

export interface AgentTaskStep {
  id: string;
  note?: string;
  status: AgentTaskStepStatus;
  title: string;
}

export interface AgentTaskToolCall {
  at: number;
  id: string;
  input?: string;
  ok: boolean;
  output?: string;
  toolName: string;
}

export interface AgentTask {
  /** Who created this task: same Actor union as ActionLogEntry. Optional so
   * tasks created before this field existed still pass the shape guard;
   * absent on read means "unknown" (a pre-existing task, never filterable
   * by actor). Set once at creation, never mutated afterward. */
  actor?: Actor;
  /** Surface that spawned the task: gui, claude-code, etc. */
  agentSurface?: string;
  /** Proof-style author id for the agent that ran this task. */
  authorId?: string;
  /** Set when status === "blocked": the question the agent is waiting on. */
  blockedQuestion?: string;
  chatId?: string;
  completedAt?: number;
  id: string;
  /** Raw model slug when an LLM drove the task. */
  model?: string;
  /** Partial completion: what is left (status stays "completed"). */
  remaining?: string[];
  request: string;
  slug: string;
  startedAt: number;
  status: AgentTaskStatus;
  steps: AgentTaskStep[];
  /** The agent's own completion summary. */
  summary?: string;
  /** Best-effort tool call trace (collapsed in the UI). */
  toolCalls?: AgentTaskToolCall[];
  updatedAt: number;
}

/** On-disk shape of working/tasks.json: a full-file, mutate-in-place store. */
export interface AgentTasksFile {
  tasks: AgentTask[];
}

const TASK_STATUSES: readonly AgentTaskStatus[] = [
  "pending",
  "running",
  "blocked",
  "failed",
  "completed",
  "cancelled",
];

const STEP_STATUSES: readonly AgentTaskStepStatus[] = [
  "pending",
  "running",
  "done",
  "failed",
];

// Every Actor member (mirrors HISTORY_ACTORS in src/agent-tools.ts): a task's
// actor is "who created it", which could in principle be any surface.
const TASK_ACTORS: readonly Actor[] = [
  "human",
  "agent",
  "cli",
  "mcp",
  "system",
];

// Shape guards for untrusted input: both the panel (an untrusted HTTP
// response) and the store (an on-disk tasks.json a human or a bad write
// could have malformed) need the exact same validation, so it lives here
// once and both sides reuse it instead of drifting.

/** Shape guard for one reported step. */
export function isAgentTaskStep(value: unknown): value is AgentTaskStep {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.title !== "string") {
    return false;
  }
  if (!STEP_STATUSES.includes(row.status as AgentTaskStepStatus)) {
    return false;
  }
  if (row.note !== undefined && typeof row.note !== "string") {
    return false;
  }
  return true;
}

/** Shape guard for one task row. */
export function isAgentTask(value: unknown): value is AgentTask {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.slug !== "string") {
    return false;
  }
  if (typeof row.request !== "string") {
    return false;
  }
  if (row.chatId !== undefined && typeof row.chatId !== "string") {
    return false;
  }
  if (row.actor !== undefined && !TASK_ACTORS.includes(row.actor as Actor)) {
    return false;
  }
  if (!TASK_STATUSES.includes(row.status as AgentTaskStatus)) {
    return false;
  }
  if (!(Array.isArray(row.steps) && row.steps.every(isAgentTaskStep))) {
    return false;
  }
  if (
    row.blockedQuestion !== undefined &&
    typeof row.blockedQuestion !== "string"
  ) {
    return false;
  }
  if (row.summary !== undefined && typeof row.summary !== "string") {
    return false;
  }
  if (row.authorId !== undefined && typeof row.authorId !== "string") {
    return false;
  }
  if (row.agentSurface !== undefined && typeof row.agentSurface !== "string") {
    return false;
  }
  if (row.model !== undefined && typeof row.model !== "string") {
    return false;
  }
  if (
    row.remaining !== undefined &&
    !(
      Array.isArray(row.remaining) &&
      row.remaining.every((item) => typeof item === "string")
    )
  ) {
    return false;
  }
  if (typeof row.startedAt !== "number" || typeof row.updatedAt !== "number") {
    return false;
  }
  if (row.completedAt !== undefined && typeof row.completedAt !== "number") {
    return false;
  }
  if (
    row.toolCalls !== undefined &&
    !(
      Array.isArray(row.toolCalls) &&
      row.toolCalls.every((call) => {
        if (!call || typeof call !== "object") {
          return false;
        }
        const c = call as Record<string, unknown>;
        return (
          typeof c.id === "string" &&
          typeof c.at === "number" &&
          typeof c.toolName === "string" &&
          typeof c.ok === "boolean" &&
          (c.input === undefined || typeof c.input === "string") &&
          (c.output === undefined || typeof c.output === "string")
        );
      })
    )
  ) {
    return false;
  }
  return true;
}

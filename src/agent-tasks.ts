// Persistent per-project agent task store (working/tasks.json): visible
// progress for agent runs. Modeled on src/chats.ts (load with corrupt-file
// backup, atomic tmp+rename save, per-slug lock, minted ids) but the file
// MUTATES in place rather than being append-only: a task's steps and status
// update over its lifetime instead of growing a new record each time.
// Pure Node fs (no Bun globals) so it runs under Next on Bun or Node.
import { existsSync } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { actorFromEnv } from "./action-log.ts";
import {
  type AgentTask,
  type AgentTaskStatus,
  type AgentTaskStep,
  type AgentTaskStepStatus,
  type AgentTasksFile,
  type AgentTaskToolCall,
  isAgentTask,
} from "./agent-task-types.ts";
import { projectPaths } from "./paths.ts";
import { withTasksLock } from "./project-lock.ts";
import { resolveProvenance } from "./provenance.ts";

export type {
  AgentTask,
  AgentTaskStatus,
  AgentTaskStep,
  AgentTaskStepStatus,
  AgentTasksFile,
} from "./agent-task-types.ts";

/** The RUNNING agent's explicit completion signal (src/agent-tools.ts maps
 * task_complete's outcome enum onto this). */
export type AgentTaskOutcome =
  | { kind: "completed"; summary?: string; remaining?: string[] }
  | { kind: "blocked"; question: string }
  | { kind: "failed"; error: string };

const EMPTY: AgentTasksFile = { tasks: [] };

// A task/step is terminal once it is no longer actively "running": nothing
// mutates it further except a fresh read. This gates both the 100-task cap
// (only terminal tasks are droppable) and step reports (a terminal task
// rejects further task_step calls from a stale/finished agent process).
const TERMINAL_STATUSES: ReadonlySet<AgentTaskStatus> = new Set([
  "blocked",
  "failed",
  "completed",
  "cancelled",
]);

function isTerminal(status: AgentTaskStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// The zod schemas on the MCP tool boundary (src/agent-tools.ts) cap
// task_step/task_complete input, but that only guards ONE surface: any other
// caller of these store primitives (the CLI, a future non-MCP surface) has
// no cap at all. Clamp here too, silently (slice, never throw), so the store
// itself can never grow an unbounded task record regardless of caller.
const REQUEST_MAX_CHARS = 2000;
const STEP_TITLE_MAX_CHARS = 200;
const STEP_NOTE_MAX_CHARS = 500;
const SUMMARY_MAX_CHARS = 2000;
const QUESTION_MAX_CHARS = 1000;
const REMAINING_MAX_ITEMS = 20;
const REMAINING_ITEM_MAX_CHARS = 300;
const TOOL_CALL_SUMMARY_MAX_CHARS = 2000;

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function truncateList(
  items: string[],
  maxItems: number,
  maxChars: number
): string[] {
  return items.slice(0, maxItems).map((item) => truncate(item, maxChars));
}

// ── Cross-process store lock ────────────────────────────────────────────────
// tasks.json is read-modify-written from TWO processes: the Next server
// (create/cancel/complete) and the SPAWNED MCP server process
// (task_step/task_complete). withTasksLock only serializes within one
// process, so an MCP write built from a stale load could resurrect a task
// the user just cancelled (every save writes the whole file). An advisory
// lockfile (`<tasks.json>.lock`, created with the exclusive "wx" flag)
// wraps every load-mutate-save cycle: because the load happens INSIDE the
// lock, a cancel that landed first is seen fresh and the terminal-status
// guards below hold across processes too. withTasksLock stays on top: the
// cheap in-process serialization keeps same-process callers from ever
// contending on the lockfile.
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 3000;
const LOCK_STALE_MS = 10_000;

async function acquireTasksLockFile(lockPath: string): Promise<void> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  // A crashed process leaves its lockfile behind; break a stale one (mtime
  // older than 10s: real holders finish in milliseconds) at most once so
  // two waiters can't ping-pong deleting each other's fresh locks.
  let brokeStale = false;
  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.write(String(process.pid));
      } finally {
        await handle.close();
      }
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
        throw e;
      }
    }
    if (!brokeStale) {
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
          brokeStale = true;
          try {
            await unlink(lockPath);
          } catch {
            // Another waiter broke it first; retry the open.
          }
          continue;
        }
      } catch {
        // The holder released between open and stat; retry immediately.
        continue;
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for the tasks.json lock: ${lockPath}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }
}

/** In-process serialization (withTasksLock) plus a cross-process advisory
 * lockfile around one whole load-mutate-save cycle. */
function withTasksStoreLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  return withTasksLock(slug, async () => {
    const p = projectPaths(slug);
    // The lockfile lives next to tasks.json under working/, which may not
    // exist yet on the very first task create.
    await mkdir(p.working, { recursive: true });
    const lockPath = `${p.tasks}.lock`;
    await acquireTasksLockFile(lockPath);
    try {
      return await fn();
    } finally {
      try {
        await unlink(lockPath);
      } catch {
        // Best-effort: a stale-break by another process already removed it.
      }
    }
  });
}

let idSeq = 0;

export function nextTaskId(prefix: string): string {
  idSeq += 1;
  return `${prefix}${Date.now().toString(36)}-${idSeq.toString(36)}`;
}

export function resetAgentTaskIdSequenceForTests(): void {
  idSeq = 0;
}

const STARTUP_RECONCILED = new Set<string>();
const ORPHANED_TASK_MESSAGE = "Server restarted while task was running";

export function resetStartupTaskReconciliationForTests(): void {
  STARTUP_RECONCILED.clear();
}

async function readAgentTasksFromDisk(slug: string): Promise<AgentTasksFile> {
  const fp = projectPaths(slug).tasks;
  if (!existsSync(fp)) {
    return { ...EMPTY };
  }
  let raw: string;
  try {
    raw = await readFile(fp, "utf8");
  } catch {
    return { ...EMPTY };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // A corrupt tasks.json must NOT be silently treated as empty: the next
    // save would persist {tasks: []} and destroy every task. Move the bad
    // file aside (recoverable) and surface a real error so the caller stops.
    await backupCorruptTasks(fp);
    throw new Error(
      `tasks.json is corrupt and was backed up: ${(e as Error).message}`
    );
  }
  // JSON.parse("null") / JSON.parse("123") SUCCEED, so the non-object cases
  // must take the same backup-and-throw path as a parse failure: without the
  // null/typeof guard, reading `.tasks` off null would throw outside any
  // recovery and the store would wedge permanently (500 on every poll).
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as AgentTasksFile).tasks)
  ) {
    await backupCorruptTasks(fp);
    throw new Error("tasks.json is corrupt (tasks is not an array)");
  }
  // Filter malformed rows instead of trusting the file's shape wholesale: a
  // hand edit or a future format change could leave one bad row without
  // corrupting the whole file the way a non-array `tasks` does.
  return { tasks: (parsed as AgentTasksFile).tasks.filter(isAgentTask) };
}

async function reconcileOrphanedRunningTasksIfNeeded(
  slug: string
): Promise<void> {
  if (STARTUP_RECONCILED.has(slug)) {
    return;
  }
  STARTUP_RECONCILED.add(slug);

  let data: AgentTasksFile;
  try {
    data = await readAgentTasksFromDisk(slug);
  } catch {
    return;
  }
  let changed = false;
  const now = Date.now();
  const nextTasks = data.tasks.map((task) => {
    if (task.status !== "running" && task.status !== "pending") {
      return task;
    }
    changed = true;
    return {
      ...task,
      status: "failed" as const,
      updatedAt: now,
      completedAt: now,
      summary: truncate(ORPHANED_TASK_MESSAGE, SUMMARY_MAX_CHARS),
      steps: task.steps.map((step) =>
        step.status === "running" || step.status === "pending"
          ? {
              ...step,
              status: "failed" as const,
              note: ORPHANED_TASK_MESSAGE,
            }
          : step
      ),
    };
  });
  if (changed) {
    await saveAgentTasks(slug, { tasks: nextTasks });
  }
}

export async function loadAgentTasks(slug: string): Promise<AgentTasksFile> {
  await reconcileOrphanedRunningTasksIfNeeded(slug);
  return readAgentTasksFromDisk(slug);
}

async function backupCorruptTasks(fp: string): Promise<void> {
  try {
    await rename(fp, `${fp}.bad-${Date.now()}`);
  } catch {
    // A concurrent load may have already moved it; nothing to do.
  }
}

/** Cap stored tasks at 100 per project: drop the oldest terminal tasks past
 * the cap. `tasks` is newest-first, so the oldest entries sit at the end.
 * A task that is still running is never dropped, even past the cap: there is
 * no way to recover its live progress once its record is gone. */
const TASKS_CAP = 100;

function capTasks(tasks: AgentTask[]): AgentTask[] {
  if (tasks.length <= TASKS_CAP) {
    return tasks;
  }
  const kept = [...tasks];
  for (let i = kept.length - 1; i >= 0 && kept.length > TASKS_CAP; i -= 1) {
    const task = kept[i];
    if (task && isTerminal(task.status)) {
      kept.splice(i, 1);
    }
  }
  return kept;
}

export async function saveAgentTasks(
  slug: string,
  data: AgentTasksFile
): Promise<void> {
  const p = projectPaths(slug);
  await mkdir(p.working, { recursive: true });
  const capped = capTasks(data.tasks);
  // Atomic write: a crash mid-write leaves tasks.json intact (the old file)
  // rather than a truncated half-file that the next load would treat as
  // corrupt. rename is atomic on POSIX; the temp name is pid-suffixed so two
  // processes can't collide on the tmp file.
  const tmp = `${p.tasks}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify({ tasks: capped }, null, 2));
  await rename(tmp, p.tasks);
}

function markRunningStepAs(
  steps: AgentTaskStep[],
  status: AgentTaskStepStatus
): AgentTaskStep[] {
  return steps.map((step) =>
    step.status === "running" ? { ...step, status } : step
  );
}

/** Cap reported steps per task: a looping agent otherwise grows the record
 * unboundedly (O(n^2) file rewrites and giant poll payloads). Past the cap
 * the OLDEST non-running steps are dropped first, so the live step always
 * survives. */
const STEPS_CAP = 50;

function capSteps(steps: AgentTaskStep[]): AgentTaskStep[] {
  if (steps.length <= STEPS_CAP) {
    return steps;
  }
  const kept = [...steps];
  for (let i = 0; i < kept.length && kept.length > STEPS_CAP; ) {
    if (kept[i]?.status === "running") {
      i += 1;
    } else {
      kept.splice(i, 1);
    }
  }
  return kept;
}

const TOOL_CALLS_CAP = 50;

function capToolCalls(calls: AgentTaskToolCall[]): AgentTaskToolCall[] {
  return calls.length <= TOOL_CALLS_CAP ? calls : calls.slice(-TOOL_CALLS_CAP);
}

export function createAgentTask(
  slug: string,
  input: {
    request: string;
    chatId?: string;
    model?: string;
    authorId?: string;
    agentSurface?: string;
  }
): Promise<AgentTask> {
  return withTasksStoreLock(slug, async () => {
    const data = await loadAgentTasks(slug);
    const now = Date.now();
    const actor = input.model
      ? ("agent" as const)
      : (actorFromEnv() ?? "human");
    const provenance = resolveProvenance({
      actor,
      model: input.model,
      authorId: input.authorId,
      agentSurface: input.agentSurface ?? (input.model ? "gui" : undefined),
    });
    const task: AgentTask = {
      id: nextTaskId("t"),
      slug,
      request: truncate(input.request, REQUEST_MAX_CHARS),
      ...(input.chatId === undefined ? {} : { chatId: input.chatId }),
      actor,
      ...(provenance.authorId ? { authorId: provenance.authorId } : {}),
      ...(provenance.agentSurface
        ? { agentSurface: provenance.agentSurface }
        : {}),
      ...((provenance.model ?? input.model)
        ? { model: provenance.model ?? input.model }
        : {}),
      status: "running",
      steps: [],
      toolCalls: [],
      startedAt: now,
      updatedAt: now,
    };
    data.tasks = [task, ...data.tasks];
    await saveAgentTasks(slug, data);
    return task;
  });
}

export function appendAgentTaskToolCall(
  slug: string,
  taskId: string,
  input: {
    toolName: string;
    ok: boolean;
    input?: string;
    output?: string;
  }
): Promise<AgentTask | undefined> {
  return withTasksStoreLock(slug, async () => {
    const data = await loadAgentTasks(slug);
    const idx = data.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) {
      return;
    }
    const task = data.tasks[idx];
    if (!task || isTerminal(task.status)) {
      return;
    }
    const call: AgentTaskToolCall = {
      id: nextTaskId("tc"),
      at: Date.now(),
      toolName: truncate(input.toolName, STEP_TITLE_MAX_CHARS),
      ok: input.ok,
      ...(input.input === undefined
        ? {}
        : { input: truncate(input.input, TOOL_CALL_SUMMARY_MAX_CHARS) }),
      ...(input.output === undefined
        ? {}
        : { output: truncate(input.output, TOOL_CALL_SUMMARY_MAX_CHARS) }),
    };
    const next: AgentTask = {
      ...task,
      toolCalls: capToolCalls([...(task.toolCalls ?? []), call]),
      updatedAt: call.at,
    };
    data.tasks[idx] = next;
    await saveAgentTasks(slug, data);
    return next;
  });
}

export function setAgentTaskStep(
  slug: string,
  taskId: string,
  input: { title: string; note?: string }
): Promise<AgentTask | undefined> {
  return withTasksStoreLock(slug, async () => {
    const data = await loadAgentTasks(slug);
    const idx = data.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) {
      return;
    }
    const task = data.tasks[idx];
    if (!task || isTerminal(task.status)) {
      return;
    }
    const newStep: AgentTaskStep = {
      id: nextTaskId("st"),
      title: truncate(input.title, STEP_TITLE_MAX_CHARS),
      status: "running",
      ...(input.note === undefined
        ? {}
        : { note: truncate(input.note, STEP_NOTE_MAX_CHARS) }),
    };
    const next: AgentTask = {
      ...task,
      steps: capSteps([...markRunningStepAs(task.steps, "done"), newStep]),
      updatedAt: Date.now(),
    };
    data.tasks[idx] = next;
    await saveAgentTasks(slug, data);
    return next;
  });
}

export function completeAgentTask(
  slug: string,
  taskId: string,
  outcome: AgentTaskOutcome
): Promise<AgentTask | undefined> {
  return withTasksStoreLock(slug, async () => {
    const data = await loadAgentTasks(slug);
    const idx = data.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) {
      return;
    }
    const task = data.tasks[idx];
    if (!task) {
      return;
    }
    if (isTerminal(task.status)) {
      // Idempotent-safe: completing (or re-completing) an already-terminal
      // task is a no-op that returns its current state unchanged.
      return task;
    }

    const now = Date.now();
    let status: AgentTaskStatus;
    let steps = task.steps;
    let patch: Partial<AgentTask> = {};

    if (outcome.kind === "completed") {
      status = "completed";
      steps = markRunningStepAs(steps, "done");
      patch = {
        ...(outcome.summary === undefined
          ? {}
          : { summary: truncate(outcome.summary, SUMMARY_MAX_CHARS) }),
        ...(outcome.remaining === undefined
          ? {}
          : {
              remaining: truncateList(
                outcome.remaining,
                REMAINING_MAX_ITEMS,
                REMAINING_ITEM_MAX_CHARS
              ),
            }),
      };
    } else if (outcome.kind === "blocked") {
      // The running step stays "running": the agent hasn't failed or
      // finished the step, it is waiting on a human answer to continue it.
      status = "blocked";
      patch = {
        blockedQuestion: truncate(outcome.question, QUESTION_MAX_CHARS),
      };
    } else {
      status = "failed";
      steps = markRunningStepAs(steps, "failed");
      patch = { summary: truncate(outcome.error, SUMMARY_MAX_CHARS) };
    }

    const next: AgentTask = {
      ...task,
      ...patch,
      status,
      steps,
      updatedAt: now,
      completedAt: now,
    };
    data.tasks[idx] = next;
    await saveAgentTasks(slug, data);
    return next;
  });
}

export function cancelAgentTask(
  slug: string,
  taskId: string
): Promise<AgentTask | undefined> {
  return withTasksStoreLock(slug, async () => {
    const data = await loadAgentTasks(slug);
    const idx = data.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) {
      return;
    }
    const task = data.tasks[idx];
    if (!task) {
      return;
    }
    if (isTerminal(task.status)) {
      // Terminal-safe: cancelling an already-finished task (completed,
      // failed, previously cancelled, or blocked) never overwrites its
      // outcome, and calling cancel twice is a no-op the second time.
      return task;
    }
    const now = Date.now();
    const next: AgentTask = {
      ...task,
      status: "cancelled",
      updatedAt: now,
      completedAt: now,
    };
    data.tasks[idx] = next;
    await saveAgentTasks(slug, data);
    return next;
  });
}

export async function listAgentTasks(
  slug: string,
  opts: { limit?: number } = {}
): Promise<AgentTask[]> {
  const { tasks } = await loadAgentTasks(slug);
  const limit = opts.limit ?? 20;
  return [...tasks].sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
}

export async function getAgentTask(
  slug: string,
  taskId: string
): Promise<AgentTask | undefined> {
  const { tasks } = await loadAgentTasks(slug);
  return tasks.find((t) => t.id === taskId);
}

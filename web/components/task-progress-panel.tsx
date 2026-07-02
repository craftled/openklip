"use client";

// Shapes AND shape guards come from the pure engine module (safe for client
// bundles: no node imports); re-exported so tests and callers can keep
// importing from here.
import {
  type AgentTask,
  type AgentTaskStatus,
  type AgentTaskStep,
  isAgentTask,
} from "@engine/agent-task-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, IconLoader, X } from "@/lib/icon";
import { relativeTimeAgo } from "@/lib/relative-time";

export type {
  AgentTask,
  AgentTaskStatus,
  AgentTaskStep,
  AgentTaskStepStatus,
} from "@engine/agent-task-types";

const BADGE_BASE =
  "inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide";

const TASK_STATUS_BADGES: Record<AgentTaskStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-primary/10 text-primary",
  blocked: "bg-accent text-accent-foreground",
  failed: "bg-destructive/10 text-destructive",
  completed: "bg-secondary text-secondary-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

/** Badge classes for a task status. */
export function taskStatusBadgeClass(status: AgentTaskStatus): string {
  return `${BADGE_BASE} ${TASK_STATUS_BADGES[status]}`;
}

/** Newest task first by updatedAt. */
export function sortTasksNewestFirst(tasks: AgentTask[]): AgentTask[] {
  return [...tasks].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Cap visible rows and count overflow for the muted footer line. */
export function selectVisibleTasks(
  tasks: AgentTask[],
  maxVisible = 5
): { visible: AgentTask[]; olderCount: number } {
  const sorted = sortTasksNewestFirst(tasks);
  return {
    visible: sorted.slice(0, maxVisible),
    olderCount: Math.max(0, sorted.length - maxVisible),
  };
}

/** Relative label for when the task was last updated. */
export function formatTaskRelativeTime(
  task: Pick<AgentTask, "updatedAt">,
  now = Date.now()
): string {
  return relativeTimeAgo(task.updatedAt, now);
}

/** Keep only well-formed rows from an untrusted API payload. */
export function parseTasks(value: unknown): AgentTask[] {
  let rows: unknown;
  if (Array.isArray(value)) {
    rows = value;
  } else if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { tasks?: unknown }).tasks)
  ) {
    rows = (value as { tasks: unknown[] }).tasks;
  } else {
    return [];
  }
  return (rows as unknown[]).filter(isAgentTask);
}

function hasRunningTask(tasks: AgentTask[]): boolean {
  return tasks.some((task) => task.status === "running");
}

function TaskStepRow({ step }: { step: AgentTaskStep }) {
  const failed = step.status === "failed";
  const running = step.status === "running";
  const done = step.status === "done";

  return (
    <li
      className={
        failed
          ? "flex flex-col gap-0.5 text-destructive"
          : "flex flex-col gap-0.5 text-muted-foreground"
      }
      data-task-step={step.id}
    >
      <div className="flex items-center gap-1.5 text-xs">
        {done ? (
          <Check aria-hidden className="size-3 shrink-0 text-foreground" />
        ) : null}
        {running ? (
          <IconLoader
            aria-hidden
            className="size-3 shrink-0 animate-spin text-primary"
          />
        ) : null}
        {step.status === "pending" ? (
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full border border-border"
          />
        ) : null}
        {failed ? <X aria-hidden className="size-3 shrink-0" /> : null}
        <span
          className={
            running
              ? "min-w-0 flex-1 animate-pulse text-foreground"
              : "min-w-0 flex-1"
          }
        >
          {step.title}
        </span>
      </div>
      {step.note ? (
        <p className="pl-[18px] text-[11px] text-muted-foreground">
          {step.note}
        </p>
      ) : null}
    </li>
  );
}

// Render at most the last N steps per task: the store caps steps at 50, but
// even a few dozen rows would crowd the composer. Older steps collapse into
// one muted count line above the visible tail.
const MAX_VISIBLE_STEPS = 12;

function TaskRow({
  task,
  now,
  onCancel,
}: {
  task: AgentTask;
  now?: number;
  onCancel?: (taskId: string) => void;
}) {
  const earlierSteps = Math.max(0, task.steps.length - MAX_VISIBLE_STEPS);
  const visibleSteps = task.steps.slice(-MAX_VISIBLE_STEPS);
  return (
    <li
      className="flex flex-col gap-1.5 border-border/60 border-b pb-2 last:border-b-0 last:pb-0"
      data-task-row={task.id}
    >
      <div className="flex items-start gap-1.5">
        <p className="line-clamp-2 min-w-0 flex-1 text-foreground text-xs">
          {task.request}
        </p>
        <span className={taskStatusBadgeClass(task.status)}>{task.status}</span>
      </div>
      <div className="text-[11px] text-muted-foreground tabular-nums">
        {formatTaskRelativeTime(task, now)}
      </div>
      {visibleSteps.length > 0 ? (
        <>
          {earlierSteps > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {earlierSteps} earlier step{earlierSteps === 1 ? "" : "s"}
            </p>
          ) : null}
          <ul className="flex list-none flex-col gap-1 p-0">
            {visibleSteps.map((step) => (
              <TaskStepRow key={step.id} step={step} />
            ))}
          </ul>
        </>
      ) : null}
      {task.blockedQuestion ? (
        <p className="font-medium text-foreground text-xs">
          {task.blockedQuestion}
        </p>
      ) : null}
      {task.summary ? (
        <p className="text-muted-foreground text-xs">{task.summary}</p>
      ) : null}
      {task.remaining && task.remaining.length > 0 ? (
        <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
          {task.remaining.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {task.status === "running" && onCancel ? (
        <Button
          className="h-7 w-fit px-2 text-xs"
          data-task-cancel={task.id}
          onClick={() => onCancel(task.id)}
          size="xs"
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      ) : null}
    </li>
  );
}

/** Presentational list, newest task first (capped at five visible rows). */
export function TaskList({
  tasks,
  now,
  onCancel,
}: {
  tasks: AgentTask[];
  now?: number;
  onCancel?: (taskId: string) => void;
}) {
  const { visible, olderCount } = selectVisibleTasks(tasks);

  if (visible.length === 0) {
    return <p className="text-muted-foreground text-xs">No agent tasks yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex list-none flex-col gap-2 p-0">
        {visible.map((task) => (
          <TaskRow key={task.id} now={now} onCancel={onCancel} task={task} />
        ))}
      </ul>
      {olderCount > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {olderCount} older task{olderCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}

/** Whether the polling effect should keep its interval alive. Pure so the
 * decision is unit-tested without mounting the component. */
export function shouldPoll(running: boolean, anyRunning: boolean): boolean {
  return running || anyRunning;
}

export function TaskProgressPanel({
  slug,
  pollMs = 2000,
  running = false,
}: {
  slug: string;
  pollMs?: number;
  /** True while the chat has an agent run in flight: the run's task appears
   * in the store shortly after dispatch, so polling must not wait for a
   * previous fetch to have already seen a running task. */
  running?: boolean;
}) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [anyRunning, setAnyRunning] = useState(false);
  // Mirrors anyRunning without triggering a render: available to callbacks
  // that need the latest running state without depending on (and thus
  // re-creating on) a state change.
  const runningRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(slug)}/tasks`
      );
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as unknown;
      const parsed = parseTasks(data);
      setTasks(parsed);
      const nowRunning = hasRunningTask(parsed);
      runningRef.current = nowRunning;
      // setState bails out of a re-render when the value is unchanged
      // (Object.is), so flipping this only on an actual change keeps it
      // safe as a poll-effect dependency below, unlike `tasks`: refresh()
      // always produces a NEW array reference, so a `tasks` dependency would
      // tear the poll effect down and immediately re-run it (which calls
      // refresh() again) on every single tick, a tight request loop for as
      // long as a task keeps running.
      setAnyRunning(nowRunning);
    } catch {
      // Network hiccup: keep the last list rather than erroring the panel.
    }
  }, [slug]);

  const cancelTask = useCallback(
    async (taskId: string) => {
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(slug)}/tasks`,
          {
            body: JSON.stringify({ action: "cancel", taskId }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
        if (!res.ok) {
          return;
        }
        await refresh();
      } catch {
        // Ignore cancel failures; user can retry.
      }
    },
    [refresh, slug]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // `tasks` must NOT be a dependency of this effect: see the comment in
  // refresh() above. `anyRunning` is the safe substitute, a boolean that
  // only changes (and only then re-triggers this effect) when the actual
  // running state flips.
  useEffect(() => {
    if (!shouldPoll(running, anyRunning)) {
      return;
    }
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, pollMs);
    return () => {
      window.clearInterval(id);
    };
  }, [pollMs, refresh, running, anyRunning]);

  if (tasks.length === 0 && !running) {
    return null;
  }

  return (
    <div
      className="flex max-h-48 flex-col gap-2 overflow-y-auto"
      data-task-panel
    >
      <TaskList onCancel={(taskId) => void cancelTask(taskId)} tasks={tasks} />
    </div>
  );
}

"use client";

import type { ActionLogEntry } from "@engine/action-log-entry";
import type { AgentTask } from "@engine/agent-task-types";
import type { AgentThread, ThreadMessage } from "@/lib/agent-threads";

export type ChatTimelineEvent =
  | {
      kind: "message";
      id: string;
      at: number;
      message: ThreadMessage;
    }
  | {
      kind: "task";
      id: string;
      at: number;
      task: AgentTask;
      actions: ActionLogEntry[];
    };

export interface BuildThreadTimelineInput {
  actions?: ActionLogEntry[];
  tasks: AgentTask[];
  thread: AgentThread | undefined;
}

function stableEventOrder(kind: ChatTimelineEvent["kind"]): number {
  // Message first, then the task spawned from it.
  return kind === "message" ? 0 : 1;
}

export function tasksForThread(
  tasks: AgentTask[],
  threadId: string
): AgentTask[] {
  return tasks.filter((task) => task.chatId === threadId);
}

export function actionsForTasks(
  actions: ActionLogEntry[],
  taskIds: ReadonlySet<string>
): Map<string, ActionLogEntry[]> {
  const map = new Map<string, ActionLogEntry[]>();
  for (const entry of actions) {
    if (!(entry.taskId && taskIds.has(entry.taskId))) {
      continue;
    }
    const list = map.get(entry.taskId);
    if (list) {
      list.push(entry);
    } else {
      map.set(entry.taskId, [entry]);
    }
  }
  // History API returns newest-first. Timeline wants oldest-first within a task.
  for (const [taskId, list] of map.entries()) {
    map.set(
      taskId,
      [...list].sort((a, b) => a.at - b.at)
    );
  }
  return map;
}

export function buildThreadTimeline({
  thread,
  tasks,
  actions = [],
}: BuildThreadTimelineInput): ChatTimelineEvent[] {
  if (!thread) {
    return [];
  }

  const threadTasks = tasksForThread(tasks, thread.id);
  const taskIds = new Set(threadTasks.map((task) => task.id));
  const actionsByTask = actionsForTasks(actions, taskIds);

  const messageEvents: ChatTimelineEvent[] = thread.messages.map((message) => ({
    kind: "message",
    id: message.id,
    at: message.createdAt,
    message,
  }));

  const taskEvents: ChatTimelineEvent[] = threadTasks.map((task) => ({
    kind: "task",
    id: task.id,
    at: task.startedAt,
    task,
    actions: actionsByTask.get(task.id) ?? [],
  }));

  return [...messageEvents, ...taskEvents].sort((a, b) => {
    if (a.at !== b.at) {
      return a.at - b.at;
    }
    const kind = stableEventOrder(a.kind) - stableEventOrder(b.kind);
    if (kind !== 0) {
      return kind;
    }
    return a.id.localeCompare(b.id);
  });
}

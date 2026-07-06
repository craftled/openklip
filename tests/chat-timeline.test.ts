import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActionLogEntry } from "../src/action-log-entry.ts";
import type { AgentTask } from "../src/agent-task-types.ts";
import type { AgentThread } from "../src/chats.ts";
import { buildThreadTimeline } from "../web/lib/chat-timeline.ts";

test("buildThreadTimeline merges messages with thread-linked tasks only", () => {
  const thread: AgentThread = {
    id: "th1",
    slug: "demo",
    title: "New chat",
    updatedAt: 5000,
    messages: [
      { id: "m1", role: "user", content: "Hello", createdAt: 1000 },
      { id: "m2", role: "assistant", content: "Hi", createdAt: 2000 },
    ],
  };

  const linked: AgentTask = {
    id: "t1",
    slug: "demo",
    chatId: "th1",
    request: "Do work",
    status: "running",
    steps: [],
    startedAt: 3000,
    updatedAt: 3000,
    toolCalls: [],
  };

  const unlinked: AgentTask = {
    id: "t2",
    slug: "demo",
    request: "Other work",
    status: "running",
    steps: [],
    startedAt: 3500,
    updatedAt: 3500,
  };

  const events = buildThreadTimeline({
    thread,
    tasks: [unlinked, linked],
  });

  assert.deepEqual(
    events.map((e) => e.kind),
    ["message", "message", "task"]
  );
  assert.equal(events.at(-1)?.kind, "task");
  assert.equal(events.at(-1)?.id, "t1");
});

test("buildThreadTimeline attaches actions to tasks by taskId", () => {
  const thread: AgentThread = {
    id: "th1",
    slug: "demo",
    title: "New chat",
    updatedAt: 5000,
    messages: [],
  };

  const task: AgentTask = {
    id: "t1",
    slug: "demo",
    chatId: "th1",
    request: "Do work",
    status: "running",
    steps: [],
    startedAt: 3000,
    updatedAt: 3000,
  };

  const entries: ActionLogEntry[] = [
    {
      action: "cut",
      actor: "agent",
      at: 4500,
      revisionBefore: 1,
      revisionAfter: 2,
      taskId: "t1",
      input: '{"ids":["w1"]}',
    },
    {
      action: "title-add",
      actor: "agent",
      at: 4000,
      revisionBefore: 2,
      revisionAfter: 3,
      taskId: "t1",
    },
  ];

  const events = buildThreadTimeline({
    thread,
    tasks: [task],
    actions: entries,
  });

  const taskEvent = events.find((e) => e.kind === "task");
  assert.ok(taskEvent && taskEvent.kind === "task");
  assert.equal(taskEvent.actions.length, 2);
  assert.equal(taskEvent.actions[0]?.action, "title-add");
  assert.equal(taskEvent.actions[1]?.action, "cut");
});

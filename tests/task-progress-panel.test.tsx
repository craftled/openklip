import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentTask } from "../web/components/task-progress-panel.tsx";
import {
  formatTaskRelativeTime,
  parseTasks,
  selectVisibleTasks,
  shouldPoll,
  sortTasksNewestFirst,
  TaskList,
  taskStatusBadgeClass,
} from "../web/components/task-progress-panel.tsx";

test("parseTasks returns empty array for non-arrays", () => {
  assert.deepEqual(parseTasks(null), []);
  assert.deepEqual(parseTasks(undefined), []);
  assert.deepEqual(parseTasks("string"), []);
  assert.deepEqual(parseTasks(42), []);
  assert.deepEqual(parseTasks({ notTasks: true }), []);
});

test("parseTasks drops rows with missing or invalid id, status, or steps", () => {
  const valid: AgentTask = {
    id: "t1",
    slug: "test",
    request: "do something",
    status: "pending",
    steps: [],
    startedAt: 1000,
    updatedAt: 1000,
  };

  const parsed = parseTasks([
    valid,
    { id: "t2", slug: "test", request: "thing", status: "pending" },
    { slug: "test", request: "thing", status: "pending", steps: [] },
    { id: "t3", request: "thing", status: "pending", steps: [] },
    { id: "t4", slug: "test", request: "thing", status: "invalid", steps: [] },
    {
      id: "t5",
      slug: "test",
      request: "thing",
      status: "running",
      steps: [{}],
    },
  ]);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, "t1");
});

test("parseTasks drops rows with non-string chatId", () => {
  const parsed = parseTasks([
    {
      id: "t1",
      slug: "test",
      request: "thing",
      status: "pending",
      steps: [],
      startedAt: 1000,
      updatedAt: 1000,
      chatId: 123,
    },
  ]);
  assert.equal(parsed.length, 0);
});

test("parseTasks drops steps with malformed shape and the parent row", () => {
  const parsed = parseTasks([
    {
      id: "t1",
      slug: "test",
      request: "thing",
      status: "pending",
      steps: [
        { id: "s1", title: "step", status: "pending" },
        { id: "s2", title: "step", status: "pending", note: 123 },
      ],
      startedAt: 1000,
      updatedAt: 1000,
    },
  ]);
  assert.equal(parsed.length, 0);
});

test("taskStatusBadgeClass returns distinct strings for each status", () => {
  const running = taskStatusBadgeClass("running");
  const completed = taskStatusBadgeClass("completed");
  const failed = taskStatusBadgeClass("failed");
  const blocked = taskStatusBadgeClass("blocked");

  assert.notEqual(running, completed);
  assert.notEqual(running, failed);
  assert.notEqual(running, blocked);
  assert.notEqual(completed, failed);
  assert.notEqual(completed, blocked);
  assert.notEqual(failed, blocked);
  assert.ok(running.length > 0);
  assert.ok(completed.length > 0);
  assert.ok(failed.length > 0);
  assert.ok(blocked.length > 0);
});

test("sortTasksNewestFirst sorts by updatedAt descending", () => {
  const tasks: AgentTask[] = [
    {
      id: "t1",
      slug: "s1",
      request: "first",
      status: "pending",
      steps: [],
      startedAt: 1000,
      updatedAt: 1000,
    },
    {
      id: "t2",
      slug: "s2",
      request: "second",
      status: "pending",
      steps: [],
      startedAt: 2000,
      updatedAt: 3000,
    },
    {
      id: "t3",
      slug: "s3",
      request: "third",
      status: "pending",
      steps: [],
      startedAt: 3000,
      updatedAt: 2000,
    },
  ];

  const sorted = sortTasksNewestFirst(tasks);
  assert.equal(sorted[0].id, "t2");
  assert.equal(sorted[1].id, "t3");
  assert.equal(sorted[2].id, "t1");
});

test("selectVisibleTasks caps at 5 and returns overflow count", () => {
  const tasks: AgentTask[] = Array.from({ length: 7 }, (_, i) => ({
    id: `t${i}`,
    slug: "s",
    request: "task",
    status: "pending" as const,
    steps: [],
    startedAt: i * 1000,
    updatedAt: i * 1000,
  }));

  const { visible, olderCount } = selectVisibleTasks(tasks);
  assert.equal(visible.length, 5);
  assert.equal(olderCount, 2);
});

test("selectVisibleTasks returns no overflow when under cap", () => {
  const tasks: AgentTask[] = Array.from({ length: 3 }, (_, i) => ({
    id: `t${i}`,
    slug: "s",
    request: "task",
    status: "pending" as const,
    steps: [],
    startedAt: i * 1000,
    updatedAt: i * 1000,
  }));

  const { visible, olderCount } = selectVisibleTasks(tasks);
  assert.equal(visible.length, 3);
  assert.equal(olderCount, 0);
});

test("formatTaskRelativeTime produces stable output with fixed now", () => {
  const task = { updatedAt: 100_000 };
  const now = 100_000;
  const time1 = formatTaskRelativeTime(task, now);
  const time2 = formatTaskRelativeTime(task, now);
  assert.equal(time1, time2);
  assert.ok(time1.length > 0);
});

test("TaskList renders no tasks message when empty", () => {
  const html = renderToStaticMarkup(<TaskList tasks={[]} />);
  assert.match(html, /No agent tasks yet/);
});

test("TaskList renders tasks in newest-first order with correct attributes", () => {
  const tasks: AgentTask[] = [
    {
      id: "t1",
      slug: "s1",
      request: "first task",
      status: "running",
      steps: [
        { id: "step1", title: "do step 1", status: "done" },
        {
          id: "step2",
          title: "do step 2",
          status: "running",
          note: "in progress",
        },
      ],
      startedAt: 1000,
      updatedAt: 1000,
    },
    {
      id: "t2",
      slug: "s2",
      request: "blocked task",
      status: "blocked",
      steps: [],
      blockedQuestion: "Need the logo asset",
      startedAt: 2000,
      updatedAt: 2000,
    },
    {
      id: "t3",
      slug: "s3",
      request: "completed task",
      status: "completed",
      steps: [],
      summary: "Task completed successfully",
      remaining: ["color pass"],
      startedAt: 3000,
      updatedAt: 3000,
    },
  ];

  const html = renderToStaticMarkup(<TaskList tasks={tasks} />);

  const blockedAt = html.indexOf("blocked task");
  const runningAt = html.indexOf("first task");
  const completedAt = html.indexOf("completed task");

  assert.ok(blockedAt !== -1, "blocked task rendered");
  assert.ok(runningAt !== -1, "running task rendered");
  assert.ok(completedAt !== -1, "completed task rendered");

  assert.ok(
    completedAt < blockedAt,
    "completed (t3, updatedAt 3000) should render before blocked (t2, updatedAt 2000)"
  );
  assert.ok(
    blockedAt < runningAt,
    "blocked (t2, updatedAt 2000) should render before running (t1, updatedAt 1000)"
  );
});

test("TaskList renders blocked question text", () => {
  const tasks: AgentTask[] = [
    {
      id: "t1",
      slug: "s1",
      request: "need info",
      status: "blocked",
      steps: [],
      blockedQuestion: "Need the logo asset",
      startedAt: 1000,
      updatedAt: 1000,
    },
  ];

  const html = renderToStaticMarkup(<TaskList tasks={tasks} />);
  assert.match(html, /Need the logo asset/);
});

test("TaskList renders cancel button only for running tasks", () => {
  const onCancel = () => {
    /* no-op callback for test */
  };
  const tasks: AgentTask[] = [
    {
      id: "t1",
      slug: "s1",
      request: "running",
      status: "running",
      steps: [],
      startedAt: 1000,
      updatedAt: 1000,
    },
    {
      id: "t2",
      slug: "s2",
      request: "completed",
      status: "completed",
      steps: [],
      startedAt: 2000,
      updatedAt: 2000,
    },
  ];

  const html = renderToStaticMarkup(
    <TaskList onCancel={onCancel} tasks={tasks} />
  );

  assert.match(html, /data-task-cancel="t1"/);
  assert.doesNotMatch(html, /data-task-cancel="t2"/);
});

test("TaskList renders step note text", () => {
  const tasks: AgentTask[] = [
    {
      id: "t1",
      slug: "s1",
      request: "task",
      status: "running",
      steps: [
        {
          id: "s1",
          title: "step one",
          status: "running",
          note: "step in progress",
        },
      ],
      startedAt: 1000,
      updatedAt: 1000,
    },
  ];

  const html = renderToStaticMarkup(<TaskList tasks={tasks} />);
  assert.match(html, /step in progress/);
});

test("TaskList renders at most the last 12 steps plus an earlier-steps line", () => {
  const steps = Array.from({ length: 20 }, (_, i) => ({
    id: `s${i}`,
    title: `step ${i}`,
    status: i === 19 ? ("running" as const) : ("done" as const),
  }));
  const tasks: AgentTask[] = [
    {
      id: "t1",
      slug: "s1",
      request: "many steps",
      status: "running",
      steps,
      startedAt: 1000,
      updatedAt: 1000,
    },
  ];

  const html = renderToStaticMarkup(<TaskList tasks={tasks} />);
  const rendered = (html.match(/data-task-step=/g) ?? []).length;
  assert.equal(rendered, 12);
  assert.match(html, /8 earlier steps/);
  // The visible tail is steps 8..19: the newest survives, the oldest do not.
  assert.ok(html.includes("step 19"), "newest step rendered");
  assert.ok(html.includes("step 8"), "first visible step rendered");
  assert.equal(
    html.includes('data-task-step="s7"'),
    false,
    "steps before the tail are collapsed"
  );
});

test("shouldPoll is true when running is true (anyRunning false)", () => {
  assert.equal(shouldPoll(true, false), true);
});

test("shouldPoll is true when anyRunning is true (running false)", () => {
  assert.equal(shouldPoll(false, true), true);
});

test("shouldPoll is false when both running and anyRunning are false", () => {
  assert.equal(shouldPoll(false, false), false);
});

test("TaskList includes data-task-row attributes", () => {
  const tasks: AgentTask[] = [
    {
      id: "t1",
      slug: "s1",
      request: "task",
      status: "pending",
      steps: [],
      startedAt: 1000,
      updatedAt: 1000,
    },
  ];

  const html = renderToStaticMarkup(<TaskList tasks={tasks} />);
  assert.match(html, /data-task-row="t1"/);
});

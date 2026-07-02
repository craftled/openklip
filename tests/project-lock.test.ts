import assert from "node:assert/strict";
import { test } from "node:test";
import {
  withBriefLock,
  withChatsLock,
  withProjectLock,
  withTasksLock,
} from "../src/project-lock.ts";

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

test("withProjectLock serializes overlapping calls for the same slug", async () => {
  const log: string[] = [];
  const slow = (id: string) =>
    withProjectLock("proj", async () => {
      log.push(`start${id}`);
      await delay(10);
      log.push(`end${id}`);
    });
  await Promise.all([slow("A"), slow("B")]);
  // Serialized: each start is immediately followed by its own end (no
  // interleaving like startA, startB, endA, endB). Either order is fine.
  assert.ok(
    log.join(",") === "startA,endA,startB,endB" ||
      log.join(",") === "startB,endB,startA,endA",
    `expected serialized order, got ${log.join(",")}`
  );
});

test("withProjectLock does not block a different slug", async () => {
  const log: string[] = [];
  const slow = (slug: string) =>
    withProjectLock(slug, async () => {
      log.push(`start-${slug}`);
      await delay(10);
      log.push(`end-${slug}`);
    });
  await Promise.all([slow("a"), slow("b")]);
  // Different slugs run concurrently: both starts land before either end.
  assert.ok(log[0]?.startsWith("start"), `first entry: ${log[0]}`);
  assert.ok(log[1]?.startsWith("start"), `second entry: ${log[1]}`);
});

test("withProjectLock and withChatsLock are independent (chats stay responsive during a project mutation)", async () => {
  const log: string[] = [];
  const project = withProjectLock("proj", async () => {
    log.push("p-start");
    await delay(15);
    log.push("p-end");
  });
  const chats = withChatsLock("proj", async () => {
    log.push("c-start");
    await delay(5);
    log.push("c-end");
  });
  await Promise.all([project, chats]);
  // The chats call must not wait for the project call: both starts appear
  // before either end.
  assert.ok(log[0]?.endsWith("start"));
  assert.ok(log[1]?.endsWith("start"));
});

test("withBriefLock serializes overlapping calls for the same slug", async () => {
  const log: string[] = [];
  const slow = (id: string) =>
    withBriefLock("proj", async () => {
      log.push(`start${id}`);
      await delay(10);
      log.push(`end${id}`);
    });
  await Promise.all([slow("A"), slow("B")]);
  assert.ok(
    log.join(",") === "startA,endA,startB,endB" ||
      log.join(",") === "startB,endB,startA,endA",
    `expected serialized order, got ${log.join(",")}`
  );
});

test("withTasksLock serializes overlapping calls for the same slug", async () => {
  const log: string[] = [];
  const slow = (id: string) =>
    withTasksLock("proj", async () => {
      log.push(`start${id}`);
      await delay(10);
      log.push(`end${id}`);
    });
  await Promise.all([slow("A"), slow("B")]);
  assert.ok(
    log.join(",") === "startA,endA,startB,endB" ||
      log.join(",") === "startB,endB,startA,endA",
    `expected serialized order, got ${log.join(",")}`
  );
});

test("withProjectLock and withBriefLock are independent (brief edits stay responsive during a project mutation)", async () => {
  const log: string[] = [];
  const project = withProjectLock("proj", async () => {
    log.push("p-start");
    await delay(15);
    log.push("p-end");
  });
  const brief = withBriefLock("proj", async () => {
    log.push("b-start");
    await delay(5);
    log.push("b-end");
  });
  await Promise.all([project, brief]);
  // The brief call must not wait for the project call: both starts appear
  // before either end.
  assert.ok(log[0]?.endsWith("start"));
  assert.ok(log[1]?.endsWith("start"));
});

test("withProjectLock and withTasksLock are independent (task writes stay responsive during a project mutation)", async () => {
  const log: string[] = [];
  const project = withProjectLock("proj", async () => {
    log.push("p-start");
    await delay(15);
    log.push("p-end");
  });
  const tasks = withTasksLock("proj", async () => {
    log.push("t-start");
    await delay(5);
    log.push("t-end");
  });
  await Promise.all([project, tasks]);
  // The tasks call must not wait for the project call: both starts appear
  // before either end.
  assert.ok(log[0]?.endsWith("start"));
  assert.ok(log[1]?.endsWith("start"));
});

test("a failing withProjectLock call does not block subsequent ones", async () => {
  let ranAfter = false;
  await assert.rejects(
    withProjectLock("proj", () => {
      throw new Error("boom");
    })
  );
  await withProjectLock("proj", () => {
    ranAfter = true;
  });
  assert.equal(ranAfter, true);
});

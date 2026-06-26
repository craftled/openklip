import assert from "node:assert/strict";
import { test } from "node:test";
import { nextId } from "../web/lib/agent-threads.ts";

test("nextId is unique even across same-millisecond calls", () => {
  // onFindFiller appends two messages back-to-back (same Date.now()); ids must
  // still differ so React keys don't collide.
  const ids = Array.from({ length: 2000 }, () => nextId("m"));
  assert.equal(new Set(ids).size, 2000);
});

test("nextId keeps the prefix", () => {
  assert.ok(nextId("th").startsWith("th"));
  assert.ok(nextId("m").startsWith("m"));
});

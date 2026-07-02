import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearAgentRun,
  killAgentRun,
  registerAgentRun,
} from "../src/agent-run-registry.ts";

function fakeProc() {
  let killed = false;
  return {
    kill: () => {
      killed = true;
    },
    get killed() {
      return killed;
    },
  };
}

test("registerAgentRun + killAgentRun kills the registered process and clears it", () => {
  const proc = fakeProc();
  registerAgentRun("task-1", proc);
  const result = killAgentRun("task-1");
  assert.equal(result, true);
  assert.equal(proc.killed, true);
  // A second kill finds nothing: the entry was cleared by the first call.
  assert.equal(killAgentRun("task-1"), false);
});

test("killAgentRun on an unknown task id returns false", () => {
  assert.equal(killAgentRun("no-such-task"), false);
});

test("clearAgentRun removes a process without killing it", () => {
  const proc = fakeProc();
  registerAgentRun("task-2", proc);
  clearAgentRun("task-2");
  assert.equal(proc.killed, false);
  assert.equal(killAgentRun("task-2"), false);
});

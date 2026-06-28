import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  AGENT_MODEL_GROUPS,
  DEFAULT_AGENT_MODEL,
  getAgentModelLabel,
  getDefaultAgentModel,
  resetDefaultAgentForTests,
  setDefaultAgentModel,
  subscribeDefaultAgent,
} from "../web/lib/agent-preferences.ts";
import {
  installLocalStorageMock,
  uninstallLocalStorageMock,
} from "./helpers/localStorageMock.ts";

beforeEach(() => {
  installLocalStorageMock();
  resetDefaultAgentForTests();
});

afterEach(() => {
  resetDefaultAgentForTests();
  uninstallLocalStorageMock();
});

test("getDefaultAgentModel returns Opus when storage is empty", () => {
  assert.equal(getDefaultAgentModel(), DEFAULT_AGENT_MODEL);
  assert.equal(getDefaultAgentModel(), "claude-opus-4-8");
});

test("setDefaultAgentModel persists the chosen model", () => {
  setDefaultAgentModel("composer-2-5");
  assert.equal(localStorage.getItem("openklip-default-agent"), "composer-2-5");
  assert.equal(getDefaultAgentModel(), "composer-2-5");
});

test("getDefaultAgentModel ignores invalid stored values", () => {
  localStorage.setItem("openklip-default-agent", "not-a-real-model");
  assert.equal(getDefaultAgentModel(), DEFAULT_AGENT_MODEL);
});

test("getAgentModelLabel maps catalog ids to human labels", () => {
  assert.equal(getAgentModelLabel("claude-opus-4-8"), "Opus 4.8");
  assert.equal(getAgentModelLabel("composer-2-5"), "Composer 2.5");
  assert.equal(getAgentModelLabel("unknown-model"), "unknown-model");
});

test("subscribeDefaultAgent fires when the default changes", () => {
  const seen: string[] = [];
  const unsub = subscribeDefaultAgent((model) => {
    seen.push(model);
  });

  setDefaultAgentModel("gpt-5-5");
  setDefaultAgentModel("grok-build");

  assert.deepEqual(seen, ["gpt-5-5", "grok-build"]);
  unsub();
});

test("subscribeDefaultAgent stops after unsubscribe", () => {
  const seen: string[] = [];
  const unsub = subscribeDefaultAgent((model) => {
    seen.push(model);
  });

  setDefaultAgentModel("claude-sonnet-4-6");
  unsub();
  setDefaultAgentModel("claude-haiku-4-5");

  assert.deepEqual(seen, ["claude-sonnet-4-6"]);
});

test("AGENT_MODEL_GROUPS lists every supported default agent id once", () => {
  const ids = AGENT_MODEL_GROUPS.flatMap((group) =>
    group.models.map((model) => model.value)
  );
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("claude-opus-4-8"));
  assert.ok(ids.includes("composer-2-5"));
  assert.ok(ids.includes("grok-build"));
});

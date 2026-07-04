import assert from "node:assert/strict";
import { test } from "node:test";
import {
  helloLoadingLabel,
  type HelloLoadingContext,
} from "../web/lib/hello-loading-labels.ts";

const CONTEXTS: HelloLoadingContext[] = ["project", "chats"];

test("helloLoadingLabel returns tailored copy per context", () => {
  assert.equal(helloLoadingLabel("project"), "Loading project…");
  assert.equal(helloLoadingLabel("chats"), "Loading chats…");
});

test("helloLoadingLabel covers every declared context", () => {
  for (const context of CONTEXTS) {
    const label = helloLoadingLabel(context);
    assert.match(label, /^Loading .+…$/);
    assert.ok(label.length > "Loading …".length);
  }
});

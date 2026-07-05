import assert from "node:assert/strict";
import { test } from "node:test";
import {
  browserIntegrationSkipReason,
  chromeAvailable,
} from "./helpers/integration-gate.ts";

test("browserIntegrationSkipReason requires OPENKLIP_INTEGRATION", async () => {
  const prev = process.env.OPENKLIP_INTEGRATION;
  delete process.env.OPENKLIP_INTEGRATION;
  try {
    const reason = await browserIntegrationSkipReason({
      serverUrl: "http://localhost:4399/edgaras-raw",
    });
    assert.equal(typeof reason, "string");
    assert.match(reason as string, /OPENKLIP_INTEGRATION/);
  } finally {
    if (prev === undefined) {
      delete process.env.OPENKLIP_INTEGRATION;
    } else {
      process.env.OPENKLIP_INTEGRATION = prev;
    }
  }
});

test("chromeAvailable is false for a missing path", () => {
  assert.equal(chromeAvailable("/nonexistent/chrome"), false);
});

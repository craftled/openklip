import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../app/api/health/route.ts";

test("GET /api/health returns 200 with status ok", async () => {
  const res = GET();
  assert.equal(res.status, 200);
  const json = (await res.json()) as {
    status: string;
    timestamp: string;
    version: string;
  };
  assert.equal(json.status, "ok");
  assert.ok(json.timestamp, "timestamp should be present");
  assert.ok(
    typeof json.timestamp === "string",
    "timestamp should be an ISO string"
  );
  assert.ok(json.version, "version should be present");
});

test("GET /api/health returns valid ISO timestamp", async () => {
  const res = GET();
  const json = (await res.json()) as { timestamp: string };
  const parsed = new Date(json.timestamp);
  assert.ok(!Number.isNaN(parsed.getTime()), "timestamp is valid ISO date");
});

test("GET /api/health sets cache-control no-store", () => {
  const res = GET();
  const cacheControl = res.headers.get("cache-control");
  assert.ok(cacheControl, "cache-control header should be set");
  assert.ok(
    cacheControl?.includes("no-store"),
    "cache-control should include no-store"
  );
});

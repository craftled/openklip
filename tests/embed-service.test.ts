import assert from "node:assert/strict";
import { test } from "node:test";
import {
  embedText,
  encodeEmbedServeRequest,
  parseEmbedServeResponse,
  shutdownEmbedService,
  splitLines,
} from "../src/embed-service.ts";
import { MOMENT_MODEL } from "../src/moment-search.ts";

// ── splitLines (line-buffering a chunked stdout stream) ───────────────────

test("splitLines returns no complete lines and buffers a partial chunk", () => {
  const { complete, rest } = splitLines('{"id":"1"');
  assert.deepEqual(complete, []);
  assert.equal(rest, '{"id":"1"');
});

test("splitLines extracts multiple complete lines delivered in one chunk", () => {
  const { complete, rest } = splitLines('{"id":"1"}\n{"id":"2"}\n{"id":"3"}\n');
  assert.deepEqual(complete, ['{"id":"1"}', '{"id":"2"}', '{"id":"3"}']);
  assert.equal(rest, "");
});

test("splitLines keeps a trailing partial line as rest", () => {
  const { complete, rest } = splitLines('{"id":"1"}\n{"id":"2"');
  assert.deepEqual(complete, ['{"id":"1"}']);
  assert.equal(rest, '{"id":"2"');
});

test("splitLines drops blank lines from the complete list", () => {
  const { complete, rest } = splitLines('{"id":"1"}\n\n{"id":"2"}\n');
  assert.deepEqual(complete, ['{"id":"1"}', '{"id":"2"}']);
  assert.equal(rest, "");
});

test("splitLines treats a chunk with no newline as a pure partial", () => {
  const { complete, rest } = splitLines("no newline yet");
  assert.deepEqual(complete, []);
  assert.equal(rest, "no newline yet");
});

test("splitLines handles an empty chunk", () => {
  const { complete, rest } = splitLines("");
  assert.deepEqual(complete, []);
  assert.equal(rest, "");
});

// ── parseEmbedServeResponse (defensive line-protocol parsing) ─────────────

test("parseEmbedServeResponse parses a well-formed success line", () => {
  const line = JSON.stringify({
    id: "7",
    model: "m",
    dim: 2,
    vector: [0.1, 0.2],
  });
  assert.deepEqual(parseEmbedServeResponse(line), {
    id: "7",
    model: "m",
    dim: 2,
    vector: [0.1, 0.2],
  });
});

test("parseEmbedServeResponse tolerates surrounding whitespace", () => {
  const line = `  ${JSON.stringify({ id: "1", model: "m", dim: 1, vector: [1] })}  `;
  assert.deepEqual(parseEmbedServeResponse(line), {
    id: "1",
    model: "m",
    dim: 1,
    vector: [1],
  });
});

test("parseEmbedServeResponse parses an error response keyed by id", () => {
  const line = JSON.stringify({ id: "9", error: "boom" });
  assert.deepEqual(parseEmbedServeResponse(line), {
    id: "9",
    dim: 0,
    error: "boom",
  });
});

test("parseEmbedServeResponse rejects invalid JSON", () => {
  assert.equal(parseEmbedServeResponse("{not valid json"), null);
});

test("parseEmbedServeResponse rejects a JSON value that is not an object", () => {
  assert.equal(parseEmbedServeResponse("42"), null);
  assert.equal(parseEmbedServeResponse('"just a string"'), null);
  assert.equal(parseEmbedServeResponse("null"), null);
  assert.equal(parseEmbedServeResponse("[1,2,3]"), null);
});

test("parseEmbedServeResponse rejects an object missing a string id", () => {
  assert.equal(
    parseEmbedServeResponse(
      JSON.stringify({ model: "m", dim: 1, vector: [1] })
    ),
    null
  );
  assert.equal(
    parseEmbedServeResponse(
      JSON.stringify({ id: 7, model: "m", dim: 1, vector: [1] })
    ),
    null
  );
});

test("parseEmbedServeResponse rejects a success object with a malformed vector", () => {
  assert.equal(
    parseEmbedServeResponse(JSON.stringify({ id: "1", model: "m", dim: 1 })),
    null
  );
  assert.equal(
    parseEmbedServeResponse(
      JSON.stringify({ id: "1", model: "m", dim: 1, vector: "nope" })
    ),
    null
  );
  assert.equal(
    parseEmbedServeResponse(
      JSON.stringify({ id: "1", model: "m", dim: 1, vector: [1, "x"] })
    ),
    null
  );
});

test("parseEmbedServeResponse rejects a success object missing the model", () => {
  assert.equal(
    parseEmbedServeResponse(JSON.stringify({ id: "1", dim: 1, vector: [1] })),
    null
  );
});

test("parseEmbedServeResponse ignores blank lines", () => {
  assert.equal(parseEmbedServeResponse("   "), null);
  assert.equal(parseEmbedServeResponse(""), null);
});

// ── encodeEmbedServeRequest (writer side of the same protocol) ────────────

test("encodeEmbedServeRequest writes one newline-terminated JSON line with a stable key order", () => {
  const line = encodeEmbedServeRequest({ id: "5", text: "a dog" });
  assert.equal(line, '{"id":"5","text":"a dog"}\n');
});

test("encodeEmbedServeRequest round-trips through splitLines and JSON.parse", () => {
  const line = encodeEmbedServeRequest({ id: "1", text: "hello\nworld" });
  // A newline embedded in the request text is JSON-escaped inside the
  // string, not a raw line break, so this is still exactly one protocol
  // line on the wire.
  const { complete, rest } = splitLines(line);
  assert.equal(complete.length, 1);
  assert.equal(rest, "");
  assert.deepEqual(JSON.parse(complete[0]), { id: "1", text: "hello\nworld" });
});

// ── Integration: real `node embed.mjs serve` warm worker ──────────────────
// Opt-in like the rest of the repo's networked/real-model smokes (see the
// embed.mjs index/query test in tests/moment-search.test.ts): needs a live
// download of the CLIP text encoder on a cold cache. Verifies the actual
// spawn/queue/respawn plumbing this file's pure parsers only test in
// isolation.

const RUN_INTEGRATION = process.env.OPENKLIP_INTEGRATION === "1";

test("embedText spawns the warm worker once and reuses it for a fast second query", {
  skip: RUN_INTEGRATION
    ? false
    : "set OPENKLIP_INTEGRATION=1 to run this test (loads the real CLIP text encoder)",
  // Generous: a cold cache also downloads the CLIP weights first.
  timeout: 300_000,
}, async () => {
  try {
    const first = await embedText("a red image");
    assert.equal(first.model, MOMENT_MODEL);
    assert.ok(first.vector.length > 0);

    const start = Date.now();
    const second = await embedText("a blue image");
    const elapsedMs = Date.now() - start;
    assert.equal(second.model, MOMENT_MODEL);
    assert.equal(second.vector.length, first.vector.length);
    // The worker is already warm for this second call: well under a cold
    // model load, generous to stay non-flaky under CI load.
    assert.ok(
      elapsedMs < 10_000,
      `expected the warm second call to be fast, took ${elapsedMs}ms`
    );
  } finally {
    await shutdownEmbedService();
  }
});

test("embedText respawns after shutdownEmbedService", {
  skip: RUN_INTEGRATION
    ? false
    : "set OPENKLIP_INTEGRATION=1 to run this test (loads the real CLIP text encoder)",
  timeout: 300_000,
}, async () => {
  try {
    const before = await embedText("a green field");
    await shutdownEmbedService();
    const after = await embedText("a green field");
    assert.equal(after.vector.length, before.vector.length);
  } finally {
    await shutdownEmbedService();
  }
});

import assert from "node:assert/strict";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { createLogger, logger } from "../src/logger.ts";

async function logToStream(
  logFn: (log: ReturnType<typeof createLogger>) => void
): Promise<string> {
  const stream = new PassThrough();
  const log = createLogger(stream);
  const dataPromise = once(stream, "data");
  logFn(log);
  const [chunk] = await dataPromise;
  return typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
}

test("logger is an object with standard log levels", () => {
  assert.ok(logger, "logger should be defined");
  assert.equal(typeof logger.info, "function", "info should be a function");
  assert.equal(typeof logger.warn, "function", "warn should be a function");
  assert.equal(typeof logger.error, "function", "error should be a function");
  assert.equal(typeof logger.debug, "function", "debug should be a function");
});

test("logger.info produces structured JSON with level and msg", async () => {
  const output = await logToStream((log) => {
    log.info("test message");
  });
  assert.ok(output, "logger should produce output");
  const parsed = JSON.parse(output) as Record<string, unknown>;
  assert.equal(parsed.level, 30, "info level should be 30");
  assert.equal(parsed.msg, "test message", "msg should match");
});

test("logger.error produces structured JSON with error level", async () => {
  const output = await logToStream((log) => {
    log.error("something went wrong");
  });
  const parsed = JSON.parse(output) as Record<string, unknown>;
  assert.equal(parsed.level, 50, "error level should be 50");
  assert.equal(parsed.msg, "something went wrong", "msg should match");
});

test("logger supports context object as first argument (pino API)", async () => {
  const output = await logToStream((log) => {
    log.info({ slug: "demo", action: "cut" }, "with context");
  });
  const parsed = JSON.parse(output) as Record<string, unknown>;
  assert.equal(parsed.msg, "with context");
  assert.equal(parsed.slug, "demo", "slug should be in output");
  assert.equal(parsed.action, "cut", "action should be in output");
});

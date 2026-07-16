// CRAFT-6185: `openklip serve` launches a production runtime (next start)
// instead of next dev, and resolves the next binary / build artifacts via
// the distribution-relative app base (src/repo-paths.ts appRoot), not a
// hardcoded cwd-relative path. These are pure helpers so the spawn argv and
// preflight decisions are testable without booting a real Next process.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildServeSpawnPlan,
  hasProductionBuild,
  isAddrInUseError,
  isPortAvailable,
  nextBinaryPath,
} from "../src/serve-runtime.ts";

test("nextBinaryPath resolves the next CLI under the given app base", () => {
  const path = nextBinaryPath("/opt/openklip");
  assert.equal(
    path,
    join("/opt/openklip", "node_modules", "next", "dist", "bin", "next")
  );
});

test("hasProductionBuild is false when .next/BUILD_ID is absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "openklip-no-build-"));
  try {
    assert.equal(hasProductionBuild(dir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hasProductionBuild is true once .next/BUILD_ID exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "openklip-has-build-"));
  try {
    mkdirSync(join(dir, ".next"), { recursive: true });
    writeFileSync(join(dir, ".next", "BUILD_ID"), "abc123\n");
    assert.equal(hasProductionBuild(dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildServeSpawnPlan uses next start for serve mode", () => {
  const plan = buildServeSpawnPlan({
    mode: "serve",
    port: "4399",
    host: "127.0.0.1",
    slug: "demo",
    base: "/opt/openklip",
    execPath: "/usr/bin/bun",
  });
  assert.deepEqual(plan.args, [
    "/usr/bin/bun",
    "--bun",
    join("/opt/openklip", "node_modules", "next", "dist", "bin", "next"),
    "start",
    "-p",
    "4399",
    "-H",
    "127.0.0.1",
  ]);
});

test("buildServeSpawnPlan uses next dev for dev mode", () => {
  const plan = buildServeSpawnPlan({
    mode: "dev",
    port: "4399",
    host: "127.0.0.1",
    slug: "demo",
    base: "/opt/openklip",
    execPath: "/usr/bin/bun",
  });
  assert.deepEqual(plan.args, [
    "/usr/bin/bun",
    "--bun",
    join("/opt/openklip", "node_modules", "next", "dist", "bin", "next"),
    "dev",
    "-p",
    "4399",
    "-H",
    "127.0.0.1",
  ]);
});

test("buildServeSpawnPlan pins cwd, OPENKLIP_SLUG, and OPENKLIP_APP_ROOT", () => {
  const plan = buildServeSpawnPlan({
    mode: "serve",
    port: "4399",
    host: "127.0.0.1",
    slug: "my-project",
    base: "/opt/openklip",
  });
  assert.equal(plan.cwd, "/opt/openklip");
  assert.equal(plan.env.OPENKLIP_SLUG, "my-project");
  assert.equal(plan.env.OPENKLIP_APP_ROOT, "/opt/openklip");
});

test("buildServeSpawnPlan defaults base to appRoot() when omitted", () => {
  const plan = buildServeSpawnPlan({
    mode: "dev",
    port: "4399",
    host: "127.0.0.1",
    slug: "demo",
  });
  assert.equal(typeof plan.cwd, "string");
  assert.ok(plan.cwd.length > 0);
});

test("isAddrInUseError recognizes EADDRINUSE and rejects unrelated errors", () => {
  assert.equal(isAddrInUseError({ code: "EADDRINUSE" }), true);
  assert.equal(isAddrInUseError({ code: "ENOENT" }), false);
  assert.equal(isAddrInUseError(null), false);
  assert.equal(isAddrInUseError("EADDRINUSE"), false);
});

test("isPortAvailable detects a bound port as unavailable, then free again after release", async () => {
  const listener = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response("ok"),
  });
  const port = listener.port;
  try {
    assert.ok(port);
    const availableWhileBound = await isPortAvailable(port, "127.0.0.1");
    assert.equal(availableWhileBound, false);
  } finally {
    await listener.stop(true);
  }
  const availableAfterRelease = await isPortAvailable(port, "127.0.0.1");
  assert.equal(availableAfterRelease, true);
});

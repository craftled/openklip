import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPackageArgv,
  checkPackagePreflight,
  listPackagePasses,
  resolvePackagePass,
} from "../src/package-pass.ts";

test("listPackagePasses exposes the real HyperFrames passes", () => {
  const ids = listPackagePasses().map((p) => p.id);
  assert.ok(ids.includes("remove-background"));
  assert.ok(ids.includes("transcribe"));
});

test("resolvePackagePass throws for an unknown pass", () => {
  assert.throws(() => resolvePackagePass("nope"), /unknown package pass/i);
});

test("each pass declares an output extension", () => {
  for (const p of listPackagePasses()) {
    assert.match(p.outExt, /^[a-z0-9]+$/);
  }
});

test("buildPackageArgv substitutes input/output into the real argv", () => {
  const argv = buildPackageArgv(
    resolvePackagePass("remove-background"),
    "/p/output/out.mp4",
    "/p/output/out-remove-background.webm",
    "hyperframes"
  );
  assert.deepEqual(argv, [
    "hyperframes",
    "remove-background",
    "/p/output/out.mp4",
    "-o",
    "/p/output/out-remove-background.webm",
  ]);
});

test("preflight fails clearly when the export is missing", () => {
  const r = checkPackagePreflight({ outExists: false, cli: "hyperframes" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /export/i.test(e)));
});

test("preflight fails clearly when the HyperFrames CLI is absent", () => {
  const r = checkPackagePreflight({ outExists: true, cli: null });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /hyperframes/i.test(e)));
});

test("preflight passes when export and CLI are both present", () => {
  assert.deepEqual(
    checkPackagePreflight({ outExists: true, cli: "/abs/hyperframes" }),
    { ok: true, errors: [] }
  );
});

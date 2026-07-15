import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dir, "..");

test("package.json no longer depends on multi-platform ffprobe-static", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.dependencies["ffprobe-static"], undefined);
  assert.ok(pkg.dependencies["@ffprobe-installer/ffprobe"]);
});

test("onnxruntime-web is the install-size stub (Node uses onnxruntime-node)", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.match(String(pkg.dependencies["onnxruntime-web"] ?? ""), /stub/);
  const ortWeb = JSON.parse(
    readFileSync(
      join(root, "node_modules/onnxruntime-web/package.json"),
      "utf8"
    )
  );
  assert.equal(ortWeb.version, "0.0.0-openklip-stub");
});

test("ffmpeg module resolves @ffprobe-installer/ffprobe", () => {
  const src = readFileSync(join(root, "src/ffmpeg.ts"), "utf8");
  assert.match(src, /"@ffprobe-installer\/ffprobe"/);
  assert.doesNotMatch(src, /optionalRequire[^\n]*ffprobe-static/);
  assert.doesNotMatch(src, /localBinary\(\s*"ffprobe-static"/);
});

test("platform ffprobe binary can be made executable (CI often drops +x on unpack)", async () => {
  const platformPkg = join(
    root,
    "node_modules",
    "@ffprobe-installer",
    `${process.platform}-${process.arch}`,
    "ffprobe"
  );
  if (!existsSync(platformPkg)) {
    return;
  }
  const { ensureExecutableBinary } = await import("../src/ffmpeg.ts");
  ensureExecutableBinary(platformPkg);
  const mode = statSync(platformPkg).mode;
  assert.ok(
    mode & 0o111,
    `ffprobe should be executable after ensureExecutableBinary, mode=${mode.toString(8)}`
  );
});

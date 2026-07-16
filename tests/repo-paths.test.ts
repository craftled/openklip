import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { test } from "node:test";
import {
  appRoot,
  cwdPath,
  repoPath,
  resolveAppRootFrom,
} from "../src/repo-paths.ts";
import { templatesRoot } from "../src/templates.ts";

test("repoPath resolves cwd-relative repo folders to absolute paths", () => {
  const templates = repoPath("templates");
  assert.equal(isAbsolute(templates), true);
  assert.equal(basename(templates), "templates");
});

test("cwdPath preserves nested cwd-relative segments", () => {
  const nested = cwdPath("src", "mcp-server.ts");
  assert.equal(isAbsolute(nested), true);
  assert.equal(nested.endsWith("src/mcp-server.ts"), true);
});

test("template root is expressed through repoPath", () => {
  assert.equal(templatesRoot(), repoPath("templates"));
});

// ── App-base resolver (CRAFT-6185) ──
// Order: explicit OPENKLIP_APP_ROOT override > module-derived openklip root >
// process.cwd() fallback. This is what lets runtime assets (templates, luts,
// the next binary, the transcribe script) resolve correctly when OpenKlip is
// launched from an installed/relocated distribution, not just a repo checkout.

test("appRoot honors an explicit OPENKLIP_APP_ROOT override", () => {
  const dir = mkdtempSync(join(tmpdir(), "openklip-app-root-override-"));
  const prev = process.env.OPENKLIP_APP_ROOT;
  try {
    process.env.OPENKLIP_APP_ROOT = dir;
    assert.equal(appRoot(), resolve(dir));
  } finally {
    if (prev === undefined) {
      delete process.env.OPENKLIP_APP_ROOT;
    } else {
      process.env.OPENKLIP_APP_ROOT = prev;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appRoot falls back to the module-derived openklip root when no override is set", () => {
  const prev = process.env.OPENKLIP_APP_ROOT;
  try {
    delete process.env.OPENKLIP_APP_ROOT;
    const base = appRoot();
    assert.equal(existsSync(join(base, "package.json")), true);
    const pkg = JSON.parse(readFileSync(join(base, "package.json"), "utf-8"));
    assert.equal(pkg.name, "openklip");
  } finally {
    if (prev === undefined) {
      delete process.env.OPENKLIP_APP_ROOT;
    } else {
      process.env.OPENKLIP_APP_ROOT = prev;
    }
  }
});

test("repoPath resolves against an overridden appRoot, not raw cwd", () => {
  const dir = mkdtempSync(join(tmpdir(), "openklip-app-root-repopath-"));
  const prev = process.env.OPENKLIP_APP_ROOT;
  try {
    process.env.OPENKLIP_APP_ROOT = dir;
    assert.equal(repoPath("templates"), join(resolve(dir), "templates"));
  } finally {
    if (prev === undefined) {
      delete process.env.OPENKLIP_APP_ROOT;
    } else {
      process.env.OPENKLIP_APP_ROOT = prev;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveAppRootFrom walks up to the nearest ancestor package.json named openklip", () => {
  const root = mkdtempSync(join(tmpdir(), "openklip-resolve-root-"));
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "openklip" })
    );
    const nested = join(root, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    assert.equal(resolveAppRootFrom(nested), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveAppRootFrom returns null when no matching ancestor package.json exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "openklip-resolve-none-"));
  try {
    const nested = join(dir, "a", "b");
    mkdirSync(nested, { recursive: true });
    assert.equal(resolveAppRootFrom(nested), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveAppRootFrom ignores an ancestor package.json with a different name", () => {
  const root = mkdtempSync(join(tmpdir(), "openklip-resolve-mismatch-"));
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "some-other-project" })
    );
    const nested = join(root, "a");
    mkdirSync(nested, { recursive: true });
    assert.equal(resolveAppRootFrom(nested), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

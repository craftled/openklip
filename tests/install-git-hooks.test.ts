import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { installGitHooks } from "../scripts/install-git-hooks.ts";

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
  assert.equal(result.exitCode, 0, result.stderr.toString());
  return result.stdout.toString().trim();
}

test("installGitHooks configures a checkout idempotently", () => {
  const root = mkdtempSync(join(tmpdir(), "openklip-hooks-"));
  try {
    git(root, "init", "--quiet");
    mkdirSync(join(root, ".githooks"));

    assert.equal(installGitHooks(root), "installed");
    assert.equal(
      git(root, "config", "--local", "--get", "core.hooksPath"),
      ".githooks"
    );
    assert.equal(installGitHooks(root), "unchanged");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("installGitHooks safely skips directories outside a Git checkout", () => {
  const root = mkdtempSync(join(tmpdir(), "openklip-no-git-"));
  try {
    assert.equal(installGitHooks(root), "skipped");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("the pre-push hook is executable and propagates the CI exit status", () => {
  const hook = join(import.meta.dir, "..", ".githooks", "pre-push");
  assert.notEqual(statSync(hook).mode & 0o111, 0);

  const root = mkdtempSync(join(tmpdir(), "openklip-pre-push-"));
  try {
    git(root, "init", "--quiet");
    const binDir = join(root, "bin");
    mkdirSync(binDir);
    const fakeBun = join(binDir, "bun");
    writeFileSync(
      fakeBun,
      '#!/bin/sh\n[ "$1 $2" = "run ci" ] || exit 98\nexit 37\n'
    );
    chmodSync(fakeBun, 0o755);

    const result = Bun.spawnSync([hook], {
      cwd: root,
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
      stderr: "pipe",
      stdout: "pipe",
    });
    assert.equal(result.exitCode, 37);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

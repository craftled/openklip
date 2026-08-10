import { existsSync } from "node:fs";
import { join } from "node:path";

export type HookInstallResult = "installed" | "skipped" | "unchanged";

function git(cwd: string, args: string[]): Bun.SpawnSyncReturns<Uint8Array> {
  return Bun.spawnSync(["git", "-C", cwd, ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
}

export function installGitHooks(cwd = process.cwd()): HookInstallResult {
  const rootResult = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (rootResult.exitCode !== 0) {
    return "skipped";
  }

  const root = rootResult.stdout.toString().trim();
  if (!existsSync(join(root, ".githooks"))) {
    throw new Error(
      `Git hook directory is missing: ${join(root, ".githooks")}`
    );
  }

  const currentResult = git(root, [
    "config",
    "--local",
    "--get",
    "core.hooksPath",
  ]);
  if (
    currentResult.exitCode === 0 &&
    currentResult.stdout.toString().trim() === ".githooks"
  ) {
    return "unchanged";
  }

  const installResult = git(root, [
    "config",
    "--local",
    "core.hooksPath",
    ".githooks",
  ]);
  if (installResult.exitCode !== 0) {
    throw new Error(
      `Could not configure Git hooks: ${installResult.stderr.toString().trim()}`
    );
  }
  return "installed";
}

if (import.meta.main) {
  try {
    const result = installGitHooks();
    if (result === "installed") {
      console.error("Configured this checkout to use .githooks.");
    } else if (result === "unchanged") {
      console.error("Git hooks are already configured.");
    } else {
      console.error("Not a Git checkout; skipped hook installation.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

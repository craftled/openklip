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
import { join } from "node:path";
import { test } from "node:test";
import {
  buildCopyPlan,
  copyPlanItem,
  dirSizeBytes,
  formatBytes,
  OPTIONAL_ASSET_DIRS,
  PrerequisiteError,
  runPrepareBundle,
  stageProductionNodeModules,
  validatePrerequisites,
} from "../scripts/prepare-desktop-bundle.ts";

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Builds a minimal fake repo tree standing in for the real (multi-GB) one:
 * a handful of tiny placeholder files/dirs, not the real assets. */
function makeFakeRepo(root: string, opts: { assetDirs?: string[] } = {}) {
  mkdirSync(join(root, ".next"), { recursive: true });
  writeFileSync(join(root, ".next", "BUILD_ID"), "fake-build-id");
  mkdirSync(join(root, ".next", "server"), { recursive: true });
  writeFileSync(join(root, ".next", "server", "keep.txt"), "keep");
  // Stands in for `next dev`'s persistent cache, which `next start` never
  // reads and which the real repo's .next/dev can dwarf (observed 4.9GB
  // locally against a ~60MB real production build).
  mkdirSync(join(root, ".next", "dev"), { recursive: true });
  writeFileSync(join(root, ".next", "dev", "should-be-excluded.txt"), "x");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "openklip" })
  );
  writeFileSync(join(root, "VERSION"), "0.42.0.4\n");
  writeFileSync(join(root, "bun.lock"), "{}");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "cli.ts"), "// fake cli\n");
  writeFileSync(join(root, "src", "transcribe.mjs"), "// fake\n");
  mkdirSync(join(root, "node_modules", "next"), { recursive: true });
  writeFileSync(join(root, "node_modules", "next", "package.json"), "{}");

  for (const dir of opts.assetDirs ?? []) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "placeholder.txt"), "placeholder\n");
  }
}

// ── buildCopyPlan (pure) ─────────────────────────────────────────────────

test("buildCopyPlan includes the always-required top-level items", () => {
  const plan = buildCopyPlan({
    repoRoot: "/fake/repo",
    destRoot: "/fake/dest",
    nodeModulesSrc: "/fake/staged/node_modules",
    exists: () => false,
  });
  const names = plan.map((i) => i.name);
  assert.deepEqual(names, [
    ".next",
    "node_modules",
    "package.json",
    "VERSION",
    "src",
  ]);
  assert.ok(plan.every((i) => i.required));
});

test("buildCopyPlan excludes the next-dev-only cache from the .next copy", () => {
  const plan = buildCopyPlan({
    repoRoot: "/fake/repo",
    destRoot: "/fake/dest",
    nodeModulesSrc: "/fake/staged/node_modules",
    exists: () => false,
  });
  const next = plan.find((i) => i.name === ".next");
  assert.ok(next);
  assert.deepEqual(next?.excludeChildren, ["dev"]);
});

test("buildCopyPlan wires node_modules to the provided staged source, not repoRoot", () => {
  const plan = buildCopyPlan({
    repoRoot: "/fake/repo",
    destRoot: "/fake/dest",
    nodeModulesSrc: "/fake/staged/node_modules",
    exists: () => false,
  });
  const nm = plan.find((i) => i.name === "node_modules");
  assert.ok(nm);
  assert.equal(nm?.srcAbs, "/fake/staged/node_modules");
  assert.equal(nm?.destAbs, "/fake/dest/node_modules");
});

test("buildCopyPlan only includes optional asset dirs that exist at the repo root", () => {
  const present = new Set(["luts", "templates"]);
  const plan = buildCopyPlan({
    repoRoot: "/fake/repo",
    destRoot: "/fake/dest",
    nodeModulesSrc: "/fake/staged/node_modules",
    exists: (p) => present.has(p.split("/").pop() as string),
  });
  const assetNames = plan
    .map((i) => i.name)
    .filter((n) => (OPTIONAL_ASSET_DIRS as readonly string[]).includes(n));
  assert.deepEqual(assetNames.sort(), ["luts", "templates"]);
  for (const item of plan) {
    if (assetNames.includes(item.name)) {
      assert.equal(item.required, false);
    }
  }
});

test("buildCopyPlan includes no asset dirs when none exist", () => {
  const plan = buildCopyPlan({
    repoRoot: "/fake/repo",
    destRoot: "/fake/dest",
    nodeModulesSrc: "/fake/staged/node_modules",
    exists: () => false,
  });
  assert.equal(plan.length, 5);
});

test("buildCopyPlan destinations all live under destRoot", () => {
  const plan = buildCopyPlan({
    repoRoot: "/fake/repo",
    destRoot: "/fake/dest",
    nodeModulesSrc: "/fake/staged/node_modules",
    exists: () => true,
  });
  for (const item of plan) {
    assert.ok(item.destAbs.startsWith("/fake/dest"));
  }
});

// ── validatePrerequisites ────────────────────────────────────────────────

test("validatePrerequisites throws an actionable error when .next/BUILD_ID is missing", () => {
  assert.throws(
    () => validatePrerequisites("/fake/repo", () => false),
    (err: unknown) => {
      assert.ok(err instanceof PrerequisiteError);
      assert.match((err as Error).message, /bun run build/);
      return true;
    }
  );
});

test("validatePrerequisites throws when bun.lock is missing", () => {
  const present = new Set([
    "/fake/repo/.next/BUILD_ID",
    "/fake/repo/package.json",
  ]);
  assert.throws(
    () => validatePrerequisites("/fake/repo", (p) => present.has(p)),
    (err: unknown) => {
      assert.ok(err instanceof PrerequisiteError);
      assert.match((err as Error).message, /bun\.lock/);
      return true;
    }
  );
});

test("validatePrerequisites passes when everything is present", () => {
  const present = new Set([
    "/fake/repo/.next/BUILD_ID",
    "/fake/repo/bun.lock",
    "/fake/repo/package.json",
  ]);
  assert.doesNotThrow(() =>
    validatePrerequisites("/fake/repo", (p) => present.has(p))
  );
});

// ── formatBytes / dirSizeBytes (pure-ish, real tiny fs) ──────────────────

test("formatBytes formats across units", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
});

test("dirSizeBytes sums nested file sizes", () => {
  withTempDir("openklip-dirsize-", (dir) => {
    writeFileSync(join(dir, "a.txt"), "12345");
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "b.txt"), "1234567890");
    const total = dirSizeBytes(dir);
    assert.equal(total, 5 + 10);
  });
});

test("dirSizeBytes returns 0 for a missing path", () => {
  assert.equal(dirSizeBytes("/does/not/exist/at/all"), 0);
});

// ── copyPlanItem (real tiny fs smoke) ─────────────────────────────────────

test("copyPlanItem copies a file", () => {
  withTempDir("openklip-copyitem-file-", (dir) => {
    const src = join(dir, "src.txt");
    const dest = join(dir, "nested", "dest.txt");
    writeFileSync(src, "hello");
    copyPlanItem({
      name: "f",
      srcAbs: src,
      destAbs: dest,
      kind: "file",
      required: true,
    });
    assert.equal(readFileSync(dest, "utf-8"), "hello");
  });
});

test("copyPlanItem copies a directory recursively", () => {
  withTempDir("openklip-copyitem-dir-", (dir) => {
    const src = join(dir, "srcdir");
    mkdirSync(join(src, "inner"), { recursive: true });
    writeFileSync(join(src, "inner", "x.txt"), "x");
    const dest = join(dir, "destdir");
    copyPlanItem({
      name: "d",
      srcAbs: src,
      destAbs: dest,
      kind: "dir",
      required: true,
    });
    assert.equal(readFileSync(join(dest, "inner", "x.txt"), "utf-8"), "x");
  });
});

test("copyPlanItem honors excludeChildren, skipping just that top-level entry", () => {
  withTempDir("openklip-copyitem-exclude-", (dir) => {
    const src = join(dir, "srcdir");
    mkdirSync(join(src, "dev", "cache"), { recursive: true });
    writeFileSync(join(src, "dev", "cache", "big.bin"), "pretend-huge");
    mkdirSync(join(src, "server"), { recursive: true });
    writeFileSync(join(src, "server", "keep.txt"), "keep");
    const dest = join(dir, "destdir");

    copyPlanItem({
      name: "d",
      srcAbs: src,
      destAbs: dest,
      kind: "dir",
      required: true,
      excludeChildren: ["dev"],
    });

    assert.equal(existsSync(join(dest, "dev")), false);
    assert.equal(
      readFileSync(join(dest, "server", "keep.txt"), "utf-8"),
      "keep"
    );
  });
});

test("copyPlanItem throws for a missing required item", () => {
  assert.throws(() =>
    copyPlanItem({
      name: "missing",
      srcAbs: "/does/not/exist",
      destAbs: "/tmp/wherever",
      kind: "dir",
      required: true,
    })
  );
});

test("copyPlanItem silently no-ops for a missing optional item", () => {
  withTempDir("openklip-copyitem-optional-", (dir) => {
    const dest = join(dir, "dest");
    assert.doesNotThrow(() =>
      copyPlanItem({
        name: "optional",
        srcAbs: join(dir, "does-not-exist"),
        destAbs: dest,
        kind: "dir",
        required: false,
      })
    );
    assert.equal(existsSync(dest), false);
  });
});

// ── stageProductionNodeModules (real tiny fs, fake spawn) ─────────────────

test("stageProductionNodeModules returns the staged path and cleans up on success", () => {
  withTempDir("openklip-stage-repo-", (repoRoot) => {
    writeFileSync(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "openklip" })
    );
    writeFileSync(join(repoRoot, "bun.lock"), "{}");

    let capturedStagingDir: string | null = null;
    const result = stageProductionNodeModules({
      repoRoot,
      runInstall: (stagingDir) => {
        capturedStagingDir = stagingDir;
        mkdirSync(join(stagingDir, "node_modules", "next"), {
          recursive: true,
        });
        writeFileSync(
          join(stagingDir, "node_modules", "next", "package.json"),
          "{}"
        );
      },
    });

    assert.equal(result.usedFallback, false);
    assert.equal(result.stagingDir, capturedStagingDir);
    assert.equal(
      result.nodeModulesSrc,
      join(capturedStagingDir as unknown as string, "node_modules")
    );
    assert.ok(existsSync(result.nodeModulesSrc));
  });
});

test("stageProductionNodeModules strips the root postinstall script from the staged package.json", () => {
  withTempDir("openklip-stage-postinstall-", (repoRoot) => {
    writeFileSync(
      join(repoRoot, "package.json"),
      JSON.stringify({
        name: "openklip",
        scripts: { postinstall: "fumadocs-mdx", build: "next build" },
      })
    );
    writeFileSync(join(repoRoot, "bun.lock"), "{}");

    let stagedPkg: { scripts?: Record<string, string> } | null = null;
    stageProductionNodeModules({
      repoRoot,
      runInstall: (stagingDir) => {
        stagedPkg = JSON.parse(
          readFileSync(join(stagingDir, "package.json"), "utf-8")
        );
        mkdirSync(join(stagingDir, "node_modules"), { recursive: true });
      },
    });

    assert.ok(stagedPkg);
    assert.equal(
      (stagedPkg as { scripts?: Record<string, string> }).scripts?.postinstall,
      undefined
    );
    assert.equal(
      (stagedPkg as { scripts?: Record<string, string> }).scripts?.build,
      "next build"
    );
  });
});

test("stageProductionNodeModules copies vendor/ into staging when present at the repo root", () => {
  withTempDir("openklip-stage-vendor-", (repoRoot) => {
    writeFileSync(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "openklip" })
    );
    writeFileSync(join(repoRoot, "bun.lock"), "{}");
    mkdirSync(join(repoRoot, "vendor", "onnxruntime-web-stub"), {
      recursive: true,
    });
    writeFileSync(
      join(repoRoot, "vendor", "onnxruntime-web-stub", "package.json"),
      "{}"
    );

    let vendorExistsDuringInstall = false;
    stageProductionNodeModules({
      repoRoot,
      runInstall: (stagingDir) => {
        vendorExistsDuringInstall = existsSync(
          join(stagingDir, "vendor", "onnxruntime-web-stub", "package.json")
        );
        mkdirSync(join(stagingDir, "node_modules"), { recursive: true });
      },
    });

    assert.equal(vendorExistsDuringInstall, true);
  });
});

test("stageProductionNodeModules falls back to the live repo node_modules when the staged install throws", () => {
  withTempDir("openklip-stage-repo-fallback-", (repoRoot) => {
    writeFileSync(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "openklip" })
    );
    writeFileSync(join(repoRoot, "bun.lock"), "{}");
    mkdirSync(join(repoRoot, "node_modules"), { recursive: true });

    const result = stageProductionNodeModules({
      repoRoot,
      runInstall: () => {
        throw new Error("simulated bun install failure");
      },
    });

    assert.equal(result.usedFallback, true);
    assert.equal(result.stagingDir, null);
    assert.equal(result.nodeModulesSrc, join(repoRoot, "node_modules"));
    assert.match(result.fallbackReason ?? "", /simulated bun install failure/);
  });
});

// ── runPrepareBundle: end-to-end smoke against a fake small-scale repo ────

test("runPrepareBundle copies a full fake repo tree and reports items and size", () => {
  withTempDir("openklip-bundle-repo-", (repoRoot) => {
    withTempDir("openklip-bundle-dest-", (destParent) => {
      makeFakeRepo(repoRoot, { assetDirs: ["luts", "templates"] });
      const destRoot = join(destParent, "app");

      const logLines: string[] = [];
      const result = runPrepareBundle({
        repoRoot,
        destRoot,
        skipStaging: true,
        log: (line) => logLines.push(line),
      });

      assert.equal(result.destRoot, destRoot);
      assert.equal(result.usedNodeModulesFallback, true);
      assert.ok(result.totalBytes > 0);

      const names = result.items.map((i) => i.name).sort();
      assert.deepEqual(
        names,
        [
          ".next",
          "VERSION",
          "luts",
          "node_modules",
          "package.json",
          "src",
          "templates",
        ].sort()
      );

      assert.ok(existsSync(join(destRoot, ".next", "BUILD_ID")));
      assert.ok(existsSync(join(destRoot, ".next", "server", "keep.txt")));
      assert.equal(existsSync(join(destRoot, ".next", "dev")), false);
      assert.ok(
        existsSync(join(destRoot, "node_modules", "next", "package.json"))
      );
      assert.ok(existsSync(join(destRoot, "package.json")));
      assert.ok(existsSync(join(destRoot, "VERSION")));
      assert.ok(existsSync(join(destRoot, "src", "cli.ts")));
      assert.ok(existsSync(join(destRoot, "src", "transcribe.mjs")));
      assert.ok(existsSync(join(destRoot, "luts", "placeholder.txt")));
      assert.ok(existsSync(join(destRoot, "templates", "placeholder.txt")));

      assert.ok(logLines.some((l) => l.includes("bundle ready")));
    });
  });
});

test("runPrepareBundle is idempotent: a second run cleans and recopies successfully", () => {
  withTempDir("openklip-bundle-repo2-", (repoRoot) => {
    withTempDir("openklip-bundle-dest2-", (destParent) => {
      makeFakeRepo(repoRoot);
      const destRoot = join(destParent, "app");

      runPrepareBundle({
        repoRoot,
        destRoot,
        skipStaging: true,
        log: noopLog,
      });
      // Simulate stale leftover state from a previous run that should be
      // wiped by the clean-and-recopy strategy.
      writeFileSync(join(destRoot, "stale-leftover.txt"), "should be gone");

      runPrepareBundle({
        repoRoot,
        destRoot,
        skipStaging: true,
        log: noopLog,
      });

      assert.equal(existsSync(join(destRoot, "stale-leftover.txt")), false);
      assert.ok(existsSync(join(destRoot, "src", "cli.ts")));
    });
  });
});

test("runPrepareBundle throws PrerequisiteError when .next/BUILD_ID is absent", () => {
  withTempDir("openklip-bundle-repo-noBuild-", (repoRoot) => {
    withTempDir("openklip-bundle-dest-noBuild-", (destParent) => {
      makeFakeRepo(repoRoot);
      rmSync(join(repoRoot, ".next", "BUILD_ID"));
      const destRoot = join(destParent, "app");

      assert.throws(
        () =>
          runPrepareBundle({
            repoRoot,
            destRoot,
            skipStaging: true,
            log: noopLog,
          }),
        (err: unknown) => err instanceof PrerequisiteError
      );
    });
  });
});

// Named (not inline `() => {}`) so it reads as an intentional no-op, not an
// incomplete refactor.
function noopLog(_line: string): void {
  // Intentionally silent: these tests assert on return values, not logs.
}

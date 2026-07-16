#!/usr/bin/env bun
/**
 * CRAFT-6187 Stage B: package the full production runtime tree into
 * src-tauri/resources/app/ so the desktop shell can run with NO reference to
 * the live repo checkout.
 *
 * Mirrors the repo layout 1:1 (see src/repo-paths.ts's appRoot()/repoPath(),
 * CRAFT-6185): pointing OPENKLIP_APP_ROOT at the produced bundle works
 * identically to pointing it at the repo root, because every read-only asset
 * the runtime touches (src/*.mjs, src/*runtime-entry.ts, ingesters/, luts/,
 * brands/, templates/, graphics/, tools/, node_modules/ffmpeg-static, ...)
 * resolves through repoPath() against whatever base directory is handed to
 * it.
 *
 * Copy strategy: clean-and-recopy, not diff-and-sync. A full rm + copy is
 * simpler and more obviously correct than diffing a multi-hundred-MB
 * node_modules tree (stale files in an incrementally-synced bundle are a much
 * worse failure mode than a slower rebuild), and this script is meant to run
 * once per packaging pass, not on every save.
 *
 * node_modules strategy: `bun install --production --frozen-lockfile` into an
 * ISOLATED staging directory (a fresh copy of package.json + bun.lock, plus
 * vendor/ for the local onnxruntime-web-stub override, not the live repo's
 * own node_modules) to get a devDependencies-free tree, then copy that into
 * the bundle. The staged package.json has its own root-level "postinstall"
 * (fumadocs-mdx doc codegen, needs content/ + source.config.ts, irrelevant to
 * a runtime bundle) stripped, but individual dependencies' own lifecycle
 * scripts (ffmpeg-static's binary download, @ffprobe-installer, sharp,
 * onnxruntime-node) still run normally. This never mutates the developer's
 * real node_modules and keeps biome/typescript/knip/jscpd/ultracite out of
 * the shipped app. If the staged install still fails for some other reason,
 * this script falls back to copying the live repo's node_modules as-is
 * (larger, but correct) and says so loudly.
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const DEFAULT_DEST_ROOT = resolve(
  DEFAULT_REPO_ROOT,
  "src-tauri",
  "resources",
  "app"
);

// Asset directories read via repoPath() at runtime (CRAFT-6185). Copied only
// when present at the repo root, so an intentionally-missing optional dir
// (e.g. a fresh checkout without tools/vision-focus built) does not fail the
// bundle.
export const OPTIONAL_ASSET_DIRS = [
  "ingesters",
  "luts",
  "brands",
  "templates",
  "graphics",
  "tools",
] as const;

export type CopyKind = "file" | "dir";

export interface CopyPlanItem {
  destAbs: string;
  /** Direct children of srcAbs to skip when kind is "dir" (e.g. ".next/dev",
   * a next-dev-only persistent cache that `next start` never reads and that
   * can dwarf the actual production build output). Ignored for kind
   * "file". */
  excludeChildren?: string[];
  kind: CopyKind;
  /** Top-level name under the bundle root, also used for summary logging. */
  name: string;
  /** Missing required items abort the run; missing optional items are
   * silently skipped by the planner (never added to the plan). */
  required: boolean;
  srcAbs: string;
}

// `next dev` (not `next build`) persists an incremental cache at
// `.next/dev`. `next start` never reads it, so a wholesale `.next` copy would
// otherwise ship gigabytes of dev-only cache in a production bundle whenever
// the source repo has ever run `bun run dev` locally.
const NEXT_DEV_CACHE_DIR = "dev";

export interface BuildCopyPlanOptions {
  destRoot: string;
  /** Injectable for tests; defaults to node:fs existsSync. */
  exists?: (path: string) => boolean;
  /** Absolute path to the node_modules tree to copy from: either the staged
   * production-only install, or (fallback) the live repo's own
   * node_modules. */
  nodeModulesSrc: string;
  repoRoot: string;
}

/**
 * Pure planning: given a repo root and a destination, returns the list of
 * {src, dest} copy operations. Does not touch the filesystem beyond checking
 * existence of optional asset directories, and never actually copies
 * anything.
 */
export function buildCopyPlan(opts: BuildCopyPlanOptions): CopyPlanItem[] {
  const { repoRoot, destRoot, nodeModulesSrc } = opts;
  const exists = opts.exists ?? existsSync;

  const items: CopyPlanItem[] = [
    {
      name: ".next",
      srcAbs: join(repoRoot, ".next"),
      destAbs: join(destRoot, ".next"),
      kind: "dir",
      required: true,
      excludeChildren: [NEXT_DEV_CACHE_DIR],
    },
    {
      name: "node_modules",
      srcAbs: nodeModulesSrc,
      destAbs: join(destRoot, "node_modules"),
      kind: "dir",
      required: true,
    },
    {
      name: "package.json",
      srcAbs: join(repoRoot, "package.json"),
      destAbs: join(destRoot, "package.json"),
      kind: "file",
      required: true,
    },
    {
      name: "VERSION",
      srcAbs: join(repoRoot, "VERSION"),
      destAbs: join(destRoot, "VERSION"),
      kind: "file",
      required: true,
    },
    // Copied wholesale rather than enumerating src/*.mjs and the individual
    // runtime-entry .ts files by hand: src/cli.ts (Bun runs .ts directly, no
    // separate compile step) statically imports the majority of src/ anyway,
    // so enumerating a subset is both more fragile (a new repoPath("src", …)
    // call site silently falls outside an allowlist) and no smaller in
    // practice (src/ is not huge). See docstring above for the CRAFT-6185
    // repoPath() call sites this must keep resolvable: src/transcribe.mjs,
    // src/embed.mjs, src/graphic-runtime-entry.ts,
    // src/map-motion-runtime-entry.ts, and everything src/cli.ts imports.
    {
      name: "src",
      srcAbs: join(repoRoot, "src"),
      destAbs: join(destRoot, "src"),
      kind: "dir",
      required: true,
    },
  ];

  for (const dir of OPTIONAL_ASSET_DIRS) {
    const srcAbs = join(repoRoot, dir);
    if (exists(srcAbs)) {
      items.push({
        name: dir,
        srcAbs,
        destAbs: join(destRoot, dir),
        kind: "dir",
        required: false,
      });
    }
  }

  return items;
}

export class PrerequisiteError extends Error {}

/**
 * Throws an actionable error if a prerequisite the rest of this script
 * depends on is missing, instead of failing deep inside a copy or spawn.
 */
export function validatePrerequisites(
  repoRoot: string,
  exists: (path: string) => boolean = existsSync
): void {
  if (!exists(join(repoRoot, ".next", "BUILD_ID"))) {
    throw new PrerequisiteError(
      `prepare-desktop-bundle: ${join(repoRoot, ".next")} has no BUILD_ID. ` +
        "Run `bun run build` first, then re-run this script."
    );
  }
  if (!exists(join(repoRoot, "bun.lock"))) {
    throw new PrerequisiteError(
      `prepare-desktop-bundle: ${join(repoRoot, "bun.lock")} is missing. ` +
        "A frozen lockfile is required to stage a production-only node_modules install."
    );
  }
  if (!exists(join(repoRoot, "package.json"))) {
    throw new PrerequisiteError(
      `prepare-desktop-bundle: ${join(repoRoot, "package.json")} is missing.`
    );
  }
}

/** Executes one planned copy. Throws for a missing required item; silently
 * no-ops for a missing optional item (the planner already filters those out,
 * so this is just defense in depth). */
export function copyPlanItem(item: CopyPlanItem): void {
  if (!existsSync(item.srcAbs)) {
    if (item.required) {
      throw new Error(
        `prepare-desktop-bundle: required source "${item.name}" not found at ${item.srcAbs}`
      );
    }
    return;
  }
  mkdirSync(dirname(item.destAbs), { recursive: true });
  if (item.kind === "dir") {
    const excluded = new Set(item.excludeChildren ?? []);
    cpSync(item.srcAbs, item.destAbs, {
      recursive: true,
      dereference: true,
      filter:
        excluded.size > 0
          ? (source) => {
              const rel = relative(item.srcAbs, source);
              const topSegment = rel.split(sep)[0];
              return !excluded.has(topSegment);
            }
          : undefined,
    });
  } else {
    copyFileSync(item.srcAbs, item.destAbs);
  }
}

/** Recursively sums apparent file sizes under `path`. Used only for the
 * human-readable summary printed at the end of a run. */
export function dirSizeBytes(path: string): number {
  const st = statSync(path, { throwIfNoEntry: false });
  if (!st) {
    return 0;
  }
  if (st.isFile()) {
    return st.size;
  }
  if (!st.isDirectory()) {
    return 0;
  }
  let total = 0;
  for (const entry of readdirSync(path)) {
    total += dirSizeBytes(join(path, entry));
  }
  return total;
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export interface StageProductionNodeModulesOptions {
  repoRoot: string;
  /** Injectable for tests: runs the staged bun install. Defaults to a real
   * `bun install --production --frozen-lockfile` spawn. */
  runInstall?: (stagingDir: string) => void;
}

export interface StageProductionNodeModulesResult {
  fallbackReason?: string;
  nodeModulesSrc: string;
  stagingDir: string | null;
  usedFallback: boolean;
}

/**
 * Copies package.json into the staging dir with the root project's own
 * "postinstall" script stripped. The real postinstall (`fumadocs-mdx`, docs
 * MDX codegen) needs `content/`/`source.config.ts`, which this staging dir
 * intentionally does not have, and produces types that are irrelevant to a
 * runtime bundle anyway (the already-built `.next` output doesn't need them
 * regenerated). Individual dependencies' own lifecycle scripts (declared via
 * `trustedDependencies`: ffmpeg-static's binary download, @ffprobe-installer,
 * sharp, onnxruntime-node, protobufjs) are untouched by this and still run
 * normally, unlike a blanket `bun install --ignore-scripts`, which would
 * also skip those and leave the bundle missing runtime binaries.
 */
function writeStagedPackageJson(repoRoot: string, stagingDir: string): void {
  const pkg = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf-8")
  ) as { scripts?: Record<string, string> };
  if (pkg.scripts) {
    // JSON.stringify omits undefined-valued keys, so this has the same
    // effect as `delete` without triggering the delete-operator lint rule.
    pkg.scripts.postinstall = undefined as unknown as string;
  }
  writeFileSync(join(stagingDir, "package.json"), JSON.stringify(pkg, null, 2));
}

// package.json's "overrides" pins onnxruntime-web to a local
// file:./vendor/onnxruntime-web-stub dependency; that path must exist
// relative to the staged package.json for `bun install` to resolve it.
const VENDOR_DIR = "vendor";

function copyVendorDirIfPresent(repoRoot: string, stagingDir: string): void {
  const src = join(repoRoot, VENDOR_DIR);
  if (existsSync(src)) {
    cpSync(src, join(stagingDir, VENDOR_DIR), { recursive: true });
  }
}

function defaultRunInstall(stagingDir: string): void {
  const result = Bun.spawnSync(
    ["bun", "install", "--production", "--frozen-lockfile"],
    {
      cwd: stagingDir,
      stdout: "inherit",
      stderr: "inherit",
    }
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `bun install --production --frozen-lockfile exited with code ${result.exitCode}`
    );
  }
}

/**
 * Stages a devDependencies-free node_modules by running
 * `bun install --production --frozen-lockfile` against a fresh copy of
 * package.json (postinstall stripped) + bun.lock + vendor/ in an isolated
 * temp directory (never inside the live repo's own node_modules). Falls back
 * to the live repo's node_modules (as-is, larger) if the staged install
 * fails for any reason.
 */
export function stageProductionNodeModules(
  opts: StageProductionNodeModulesOptions
): StageProductionNodeModulesResult {
  const { repoRoot } = opts;
  const runInstall = opts.runInstall ?? defaultRunInstall;
  const stagingDir = mkdtempSync(
    join(tmpdir(), "openklip-desktop-bundle-staging-")
  );
  try {
    writeStagedPackageJson(repoRoot, stagingDir);
    copyFileSync(join(repoRoot, "bun.lock"), join(stagingDir, "bun.lock"));
    copyVendorDirIfPresent(repoRoot, stagingDir);
    runInstall(stagingDir);
    const staged = join(stagingDir, "node_modules");
    if (!existsSync(staged)) {
      throw new Error("staged install completed but node_modules is missing");
    }
    return { nodeModulesSrc: staged, stagingDir, usedFallback: false };
  } catch (err) {
    rmSync(stagingDir, { recursive: true, force: true });
    const reason = err instanceof Error ? err.message : String(err);
    return {
      nodeModulesSrc: join(repoRoot, "node_modules"),
      stagingDir: null,
      usedFallback: true,
      fallbackReason: reason,
    };
  }
}

export interface RunPrepareBundleOptions {
  destRoot?: string;
  log?: (line: string) => void;
  repoRoot?: string;
  /** Skip the staged install and copy the live repo's node_modules directly.
   * Used by the smoke test; also a manual escape hatch. */
  skipStaging?: boolean;
}

export interface RunPrepareBundleResult {
  destRoot: string;
  items: CopyPlanItem[];
  totalBytes: number;
  usedNodeModulesFallback: boolean;
}

export function runPrepareBundle(
  opts: RunPrepareBundleOptions = {}
): RunPrepareBundleResult {
  const repoRoot = opts.repoRoot ?? DEFAULT_REPO_ROOT;
  const destRoot = opts.destRoot ?? DEFAULT_DEST_ROOT;
  const log = opts.log ?? ((line: string) => console.log(line));

  validatePrerequisites(repoRoot);

  log(`prepare-desktop-bundle: cleaning ${destRoot}`);
  rmSync(destRoot, { recursive: true, force: true });
  mkdirSync(destRoot, { recursive: true });

  let nodeModulesSrc = join(repoRoot, "node_modules");
  let stagingDir: string | null = null;
  let usedNodeModulesFallback = false;

  if (opts.skipStaging) {
    log(
      "prepare-desktop-bundle: skipStaging set, copying live repo node_modules as-is"
    );
    usedNodeModulesFallback = true;
  } else {
    log(
      "prepare-desktop-bundle: staging production-only node_modules install..."
    );
    const staged = stageProductionNodeModules({ repoRoot });
    nodeModulesSrc = staged.nodeModulesSrc;
    stagingDir = staged.stagingDir;
    usedNodeModulesFallback = staged.usedFallback;
    if (staged.usedFallback) {
      log(
        `prepare-desktop-bundle: staged install failed (${staged.fallbackReason}), ` +
          "falling back to copying the live repo's node_modules as-is"
      );
    } else {
      log(
        `prepare-desktop-bundle: staged install ok -> ${staged.nodeModulesSrc}`
      );
    }
  }

  try {
    const plan = buildCopyPlan({ repoRoot, destRoot, nodeModulesSrc });
    for (const item of plan) {
      copyPlanItem(item);
      const size = formatBytes(dirSizeBytes(item.destAbs));
      log(`prepare-desktop-bundle: copied ${item.name} (${size})`);
    }

    const totalBytes = dirSizeBytes(destRoot);
    log("");
    log(`prepare-desktop-bundle: bundle ready at ${destRoot}`);
    log(`prepare-desktop-bundle: total size ${formatBytes(totalBytes)}`);
    log(
      `prepare-desktop-bundle: top-level items: ${plan.map((i) => i.name).join(", ")}`
    );

    return { destRoot, items: plan, totalBytes, usedNodeModulesFallback };
  } finally {
    if (stagingDir) {
      rmSync(stagingDir, { recursive: true, force: true });
    }
  }
}

if (import.meta.main) {
  try {
    runPrepareBundle();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`error: ${message}`);
    process.exit(1);
  }
}

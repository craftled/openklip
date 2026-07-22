#!/usr/bin/env bun
/**
 * Cut a signed, notarized, self-updating macOS release (CRAFT-6273).
 *
 * This is deliberately a local, interactive-Mac command: the Developer ID
 * certificate and notarytool profile stay in the release machine's keychain.
 * It creates a GitHub draft release, verifies every required asset on that
 * draft, and only then publishes it.
 */
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const DEFAULT_IDENTITY =
  "Developer ID Application: Craftled, MB (4RRUYWAP8F)";
export const DEFAULT_NOTARY_PROFILE = "openklip-notary";
export const PRODUCT_NAME = "OpenKlip";

export interface ReleaseVersionSources {
  cargo: string;
  packageJson: string;
  tauriConfig: string;
  versionFile: string;
}

export interface UpdaterManifestOptions {
  notes: string;
  pubDate: string;
  signature: string;
  url: string;
  version: string;
}

export interface ReleasePaths {
  app: string;
  appNotaryZip: string;
  dmg: string;
  dmgAlias: string;
  dmgTmp: string;
  macosBundleDir: string;
  manifest: string;
  stagingDir: string;
  updaterArchive: string;
  updaterSignature: string;
}

export interface CommandRunner {
  capture: (args: string[], opts?: { cwd?: string }) => string;
  run: (args: string[], opts?: { cwd?: string }) => void;
}

function versionFromToml(contents: string, file: string): string {
  const match = contents.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`release: no package version found in ${file}`);
  }
  return match[1];
}

/** Read every independent version source so a desktop binary cannot be tagged
 * with a version different from the updater-visible app version. */
export function readReleaseVersionSources(
  repoRoot = DEFAULT_REPO_ROOT
): ReleaseVersionSources {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8")
  ) as { version?: unknown };
  const tauriConfig = JSON.parse(
    readFileSync(join(repoRoot, "src-tauri", "tauri.conf.json"), "utf8")
  ) as { version?: unknown };
  if (typeof packageJson.version !== "string") {
    throw new Error("release: package.json has no string version");
  }
  if (typeof tauriConfig.version !== "string") {
    throw new Error("release: src-tauri/tauri.conf.json has no string version");
  }

  return {
    versionFile: readFileSync(join(repoRoot, "VERSION"), "utf8").trim(),
    packageJson: packageJson.version,
    tauriConfig: tauriConfig.version,
    cargo: versionFromToml(
      readFileSync(join(repoRoot, "src-tauri", "Cargo.toml"), "utf8"),
      "src-tauri/Cargo.toml"
    ),
  };
}

export function assertReleaseVersionSources(
  sources: ReleaseVersionSources
): string {
  const values = Object.values(sources);
  if (
    values.some(
      (value) =>
        !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value)
    )
  ) {
    throw new Error(
      `release: versions must be valid SemVer: ${JSON.stringify(sources)}`
    );
  }
  if (new Set(values).size !== 1) {
    throw new Error(
      "release: version mismatch; update VERSION, package.json, " +
        `src-tauri/tauri.conf.json, and src-tauri/Cargo.toml together: ${JSON.stringify(sources)}`
    );
  }
  return sources.versionFile;
}

/** Tauri's static updater feed requires the signature contents, not a URL. */
export function createUpdaterManifest(opts: UpdaterManifestOptions): string {
  if (!opts.signature.trim()) {
    throw new Error("release: updater signature is empty");
  }
  if (!opts.url.startsWith("https://")) {
    throw new Error("release: updater URL must be HTTPS");
  }
  return `${JSON.stringify(
    {
      version: opts.version,
      notes: opts.notes,
      pub_date: opts.pubDate,
      platforms: {
        "darwin-aarch64": {
          signature: opts.signature.trim(),
          url: opts.url,
        },
      },
    },
    null,
    2
  )}\n`;
}

export function requiredReleaseAssetNames(version: string): string[] {
  return [
    `${PRODUCT_NAME}_${version}_aarch64.dmg`,
    `${PRODUCT_NAME}-macos-arm64.dmg`,
    `${PRODUCT_NAME}.app.tar.gz`,
    `${PRODUCT_NAME}.app.tar.gz.sig`,
    "latest.json",
  ];
}

export function assertReleaseAssetNames(
  actual: readonly string[],
  version: string
): void {
  const missing = requiredReleaseAssetNames(version).filter(
    (name) => !actual.includes(name)
  );
  if (missing.length > 0) {
    throw new Error(
      `release: draft is missing required asset(s): ${missing.join(", ")}`
    );
  }
}

export function releasePaths(repoRoot: string, version: string): ReleasePaths {
  const macosBundleDir = join(
    repoRoot,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "macos"
  );
  const dmgDir = join(
    repoRoot,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "dmg"
  );
  const stagingDir = mkdtempSync(join(tmpdir(), "openklip-release-desktop-"));
  const dmg = join(dmgDir, `${PRODUCT_NAME}_${version}_aarch64.dmg`);
  return {
    macosBundleDir,
    app: join(macosBundleDir, `${PRODUCT_NAME}.app`),
    appNotaryZip: join(stagingDir, `${PRODUCT_NAME}.app-notary.zip`),
    dmg,
    dmgTmp: `${dmg}.tmp`,
    dmgAlias: join(stagingDir, `${PRODUCT_NAME}-macos-arm64.dmg`),
    updaterArchive: join(macosBundleDir, `${PRODUCT_NAME}.app.tar.gz`),
    updaterSignature: join(macosBundleDir, `${PRODUCT_NAME}.app.tar.gz.sig`),
    manifest: join(stagingDir, "latest.json"),
    stagingDir,
  };
}

function commandLabel(args: string[]): string {
  return args.map((arg) => JSON.stringify(arg)).join(" ");
}

export function defaultRunner(
  log = (line: string) => console.log(line)
): CommandRunner {
  const execute = (
    args: string[],
    opts: { cwd?: string } = {},
    capture = false
  ) => {
    log(`$ ${commandLabel(args)}`);
    const proc = Bun.spawnSync(args, {
      cwd: opts.cwd,
      stdout: capture ? "pipe" : "inherit",
      stderr: capture ? "pipe" : "inherit",
    });
    const stdout = capture ? new TextDecoder().decode(proc.stdout) : "";
    const stderr = capture ? new TextDecoder().decode(proc.stderr) : "";
    if (proc.exitCode !== 0) {
      throw new Error(
        `release: command failed (${proc.exitCode}): ${commandLabel(args)}\n${stderr || stdout}`
      );
    }
    return stdout;
  };
  return {
    run(args, opts) {
      execute(args, opts);
    },
    capture(args, opts) {
      return execute(args, opts, true);
    },
  };
}

function requireFile(path: string, label: string): void {
  if (!existsSync(path)) {
    throw new Error(`release: ${label} is missing: ${path}`);
  }
}

function requireDirectory(path: string, label: string): void {
  if (!(existsSync(path) && lstatSync(path).isDirectory())) {
    throw new Error(`release: ${label} is missing: ${path}`);
  }
}

function commandOutput(
  runner: CommandRunner,
  args: string[],
  cwd: string
): string {
  return runner.capture(args, { cwd }).trim();
}

function preflight(
  runner: CommandRunner,
  repoRoot: string,
  tag: string,
  identity: string,
  notaryProfile: string
): void {
  if (commandOutput(runner, ["uname", "-s"], repoRoot) !== "Darwin") {
    throw new Error("release: desktop releases must run on macOS");
  }
  if (commandOutput(runner, ["uname", "-m"], repoRoot) !== "arm64") {
    throw new Error(
      "release: desktop releases currently require Apple Silicon (arm64)"
    );
  }
  runner.run(["git", "diff", "--quiet"], { cwd: repoRoot });
  runner.run(["git", "diff", "--cached", "--quiet"], { cwd: repoRoot });
  runner.run(["git", "diff", "--quiet", "origin/main...HEAD"], {
    cwd: repoRoot,
  });
  const exactTag = commandOutput(
    runner,
    ["git", "describe", "--tags", "--exact-match"],
    repoRoot
  );
  if (exactTag !== tag) {
    throw new Error(
      `release: HEAD must be tagged ${tag}; found ${exactTag || "no tag"}`
    );
  }
  runner.run(["gh", "auth", "status"], { cwd: repoRoot });
  const identities = commandOutput(
    runner,
    ["security", "find-identity", "-v", "-p", "codesigning"],
    repoRoot
  );
  if (!identities.includes(identity)) {
    throw new Error(`release: signing identity not in keychain: ${identity}`);
  }
  if (
    !(
      process.env.TAURI_SIGNING_PRIVATE_KEY ||
      process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
    )
  ) {
    throw new Error(
      "release: set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH from the secret store"
    );
  }
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    throw new Error(
      "release: set TAURI_SIGNING_PRIVATE_KEY_PASSWORD for the passphrase-protected updater key"
    );
  }
  runner.run(
    ["xcrun", "notarytool", "history", "--keychain-profile", notaryProfile],
    { cwd: repoRoot }
  );
}

function buildDmg(
  runner: CommandRunner,
  paths: ReleasePaths,
  identity: string,
  repoRoot: string
): void {
  requireDirectory(paths.app, "stapled app bundle");
  const dmgStage = join(paths.stagingDir, "dmg");
  mkdirSync(dmgStage, { recursive: true });
  runner.run(["ditto", paths.app, join(dmgStage, `${PRODUCT_NAME}.app`)], {
    cwd: repoRoot,
  });
  symlinkSync("/Applications", join(dmgStage, "Applications"));
  mkdirSync(dirname(paths.dmg), { recursive: true });
  runner.run(
    [
      "hdiutil",
      "create",
      "-volname",
      PRODUCT_NAME,
      "-srcfolder",
      dmgStage,
      "-ov",
      "-format",
      "UDBZ",
      paths.dmgTmp,
    ],
    { cwd: repoRoot }
  );
  runner.run(
    [
      "hdiutil",
      "convert",
      paths.dmgTmp,
      "-format",
      "UDZO",
      "-imagekey",
      "zlib-level=9",
      "-o",
      paths.dmg,
    ],
    { cwd: repoRoot }
  );
  rmSync(paths.dmgTmp, { force: true });
  runner.run(
    ["codesign", "--force", "--timestamp", "-s", identity, paths.dmg],
    { cwd: repoRoot }
  );
  runner.run(["hdiutil", "verify", paths.dmg], { cwd: repoRoot });
}

function rebuildUpdaterArchive(
  runner: CommandRunner,
  paths: ReleasePaths,
  repoRoot: string
): void {
  // Tauri creates this archive before OpenKlip's deep-sign/notarize pass.
  // Replace it with an archive of the final stapled app, then sign that exact
  // byte stream for the updater feed.
  rmSync(paths.updaterArchive, { force: true });
  rmSync(paths.updaterSignature, { force: true });
  runner.run(
    [
      "tar",
      "-czf",
      paths.updaterArchive,
      "-C",
      paths.macosBundleDir,
      `${PRODUCT_NAME}.app`,
    ],
    { cwd: repoRoot }
  );
  runner.run(
    ["bunx", "@tauri-apps/cli@2", "signer", "sign", paths.updaterArchive],
    { cwd: repoRoot }
  );
  requireFile(paths.updaterArchive, "updater archive");
  requireFile(paths.updaterSignature, "updater signature");
}

function publishDraft(
  runner: CommandRunner,
  repoRoot: string,
  tag: string,
  version: string,
  paths: ReleasePaths,
  manifest: string,
  repoNameWithOwner: string
): void {
  runner.run(["gh", "release", "create", tag, "--draft", "--generate-notes"], {
    cwd: repoRoot,
  });
  runner.run(
    [
      "gh",
      "release",
      "upload",
      tag,
      paths.dmg,
      paths.dmgAlias,
      paths.updaterArchive,
      paths.updaterSignature,
      manifest,
    ],
    { cwd: repoRoot }
  );
  const draft = JSON.parse(
    commandOutput(
      runner,
      ["gh", "release", "view", tag, "--json", "isDraft,assets"],
      repoRoot
    )
  ) as { assets?: Array<{ name?: string }>; isDraft?: boolean };
  if (!draft.isDraft) {
    throw new Error("release: refusing to validate a non-draft release");
  }
  assertReleaseAssetNames(
    (draft.assets ?? []).flatMap((asset) =>
      typeof asset.name === "string" ? [asset.name] : []
    ),
    version
  );
  runner.run(["gh", "release", "edit", tag, "--draft=false"], {
    cwd: repoRoot,
  });
  const published = JSON.parse(
    commandOutput(
      runner,
      ["gh", "release", "view", tag, "--json", "isDraft,assets"],
      repoRoot
    )
  ) as { assets?: Array<{ name?: string }>; isDraft?: boolean };
  if (published.isDraft) {
    throw new Error("release: GitHub release remained a draft");
  }
  assertReleaseAssetNames(
    (published.assets ?? []).flatMap((asset) =>
      typeof asset.name === "string" ? [asset.name] : []
    ),
    version
  );
  const latestDownloadBase = `https://github.com/${repoNameWithOwner}/releases/latest/download`;
  runner.run(
    [
      "curl",
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "--output",
      "/dev/null",
      `${latestDownloadBase}/${basename(paths.dmgAlias)}`,
    ],
    { cwd: repoRoot }
  );
  runner.run(
    [
      "curl",
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "--output",
      "/dev/null",
      `${latestDownloadBase}/latest.json`,
    ],
    { cwd: repoRoot }
  );
}

export interface RunReleaseDesktopOptions {
  dryRun?: boolean;
  identity?: string;
  notaryProfile?: string;
  repoRoot?: string;
  runner?: CommandRunner;
}

export function runReleaseDesktop(opts: RunReleaseDesktopOptions = {}): void {
  const repoRoot = opts.repoRoot ?? DEFAULT_REPO_ROOT;
  const identity = opts.identity ?? DEFAULT_IDENTITY;
  const notaryProfile = opts.notaryProfile ?? DEFAULT_NOTARY_PROFILE;
  const runner = opts.runner ?? defaultRunner();
  const version = assertReleaseVersionSources(
    readReleaseVersionSources(repoRoot)
  );
  const tag = `v${version}`;
  const paths = releasePaths(repoRoot, version);
  try {
    if (opts.dryRun) {
      console.log(
        `release: dry run for ${tag}; would build, sign, notarize, create a draft, and publish ${requiredReleaseAssetNames(version).join(", ")}`
      );
      return;
    }

    preflight(runner, repoRoot, tag, identity, notaryProfile);
    runner.run(["bun", "run", "build"], { cwd: repoRoot });
    runner.run(["bun", "run", "desktop:prepare-bundle"], { cwd: repoRoot });
    runner.run(
      [
        "bunx",
        "@tauri-apps/cli@2",
        "build",
        "--bundles",
        "app",
        "--config",
        '{"bundle":{"createUpdaterArtifacts":true}}',
      ],
      { cwd: repoRoot }
    );
    requireDirectory(paths.app, "Tauri app bundle");
    runner.run(
      [
        "env",
        `APPLE_SIGNING_IDENTITY=${identity}`,
        "bash",
        "scripts/sign-desktop-bundle.sh",
        paths.app,
      ],
      { cwd: repoRoot }
    );
    runner.run(
      ["ditto", "-c", "-k", "--keepParent", paths.app, paths.appNotaryZip],
      {
        cwd: repoRoot,
      }
    );
    runner.run(
      [
        "xcrun",
        "notarytool",
        "submit",
        paths.appNotaryZip,
        "--keychain-profile",
        notaryProfile,
        "--wait",
      ],
      { cwd: repoRoot }
    );
    runner.run(["xcrun", "stapler", "staple", paths.app], { cwd: repoRoot });
    runner.run(["bash", "scripts/verify-macos-signature.sh", paths.app], {
      cwd: repoRoot,
    });
    buildDmg(runner, paths, identity, repoRoot);
    runner.run(
      [
        "xcrun",
        "notarytool",
        "submit",
        paths.dmg,
        "--keychain-profile",
        notaryProfile,
        "--wait",
      ],
      { cwd: repoRoot }
    );
    runner.run(["xcrun", "stapler", "staple", paths.dmg], { cwd: repoRoot });
    runner.run(["xcrun", "stapler", "validate", paths.dmg], { cwd: repoRoot });
    runner.run(
      [
        "spctl",
        "-a",
        "-t",
        "open",
        "--context",
        "context:primary-signature",
        "-vvv",
        paths.dmg,
      ],
      { cwd: repoRoot }
    );
    rebuildUpdaterArchive(runner, paths, repoRoot);
    const repo = commandOutput(
      runner,
      ["gh", "repo", "view", "--json", "nameWithOwner"],
      repoRoot
    );
    const owner = (JSON.parse(repo) as { nameWithOwner?: string })
      .nameWithOwner;
    if (!owner) {
      throw new Error("release: could not resolve GitHub repository");
    }
    writeFileSync(
      paths.manifest,
      createUpdaterManifest({
        version,
        notes: `${PRODUCT_NAME} ${version}`,
        pubDate: new Date().toISOString(),
        signature: readFileSync(paths.updaterSignature, "utf8"),
        url: `https://github.com/${owner}/releases/download/${tag}/${basename(paths.updaterArchive)}`,
      })
    );
    copyFileSync(paths.dmg, paths.dmgAlias);
    publishDraft(runner, repoRoot, tag, version, paths, paths.manifest, owner);
    console.log(
      `release: ${tag} published with signed DMG alias and updater feed`
    );
  } finally {
    rmSync(paths.stagingDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--dry-run")) {
      throw new Error("usage: bun run release:desktop [--dry-run]");
    }
    runReleaseDesktop({ dryRun: args.includes("--dry-run") });
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

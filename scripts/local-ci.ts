import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Environment = Record<string, string | undefined>;
type SupportedPlatform = "darwin" | "linux";

interface PathResolutionInput {
  env: Environment;
  homeDir?: string;
  platform: SupportedPlatform;
}

interface ChromeResolutionInput extends PathResolutionInput {
  exists?: (path: string) => boolean;
  which?: (command: string) => string | null;
}

interface CiStep {
  command: string[];
  env?: Environment;
  name: string;
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MINIMUM_BUN_VERSION = "1.3.14";
const MINIMUM_NODE_VERSION = "24";

export function assertMinimumVersion(
  runtime: string,
  actual: string,
  minimum: string
): void {
  const parse = (version: string): number[] =>
    version
      .replace(/^v/, "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const current = parse(actual);
  const required = parse(minimum);
  const width = Math.max(current.length, required.length);

  for (let index = 0; index < width; index += 1) {
    const currentPart = current[index] ?? 0;
    const requiredPart = required[index] ?? 0;
    if (currentPart > requiredPart) {
      return;
    }
    if (currentPart < requiredPart) {
      throw new Error(
        `${runtime} ${minimum} or newer is required (found ${actual}).`
      );
    }
  }
}

export function resolveModelCache(input: PathResolutionInput): string {
  const override = input.env.OPENKLIP_MODEL_CACHE?.trim();
  if (override) {
    return override;
  }

  const userHome = input.homeDir ?? homedir();
  if (input.platform === "darwin") {
    return join(userHome, "Library", "Caches", "OpenKlip", "models");
  }

  const cacheRoot =
    input.env.XDG_CACHE_HOME?.trim() || join(userHome, ".cache");
  return join(cacheRoot, "openklip", "models");
}

export function resolveChromePath(input: ChromeResolutionInput): string {
  const pathExists = input.exists ?? existsSync;
  const findOnPath = input.which ?? ((command) => Bun.which(command));
  const override = input.env.OPENKLIP_CHROME_PATH?.trim();

  if (override) {
    if (pathExists(override)) {
      return override;
    }
    throw new Error(
      `OPENKLIP_CHROME_PATH points to ${override}, but that path does not exist.`
    );
  }

  if (input.platform === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    const match = candidates.find(pathExists);
    if (match) {
      return match;
    }
  } else {
    for (const command of [
      "google-chrome",
      "google-chrome-stable",
      "chromium",
      "chromium-browser",
      "chrome",
    ]) {
      const match = findOnPath(command);
      if (match && pathExists(match)) {
        return match;
      }
    }
  }

  throw new Error(
    "Chrome or Chromium is required for local CI. Install it or set OPENKLIP_CHROME_PATH to its executable."
  );
}

function capturedCommand(command: string[]): string {
  const result = Bun.spawnSync(command, { stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to run ${command.join(" ")}: ${result.stderr.toString().trim()}`
    );
  }
  return result.stdout.toString().trim();
}

async function runStep(step: CiStep): Promise<void> {
  console.error(`\n[local-ci] ${step.name}`);
  console.error(`[local-ci] $ ${step.command.join(" ")}`);

  const child = Bun.spawn(step.command, {
    cwd: REPO_ROOT,
    env: step.env ?? process.env,
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  });
  let forwardedSignal: NodeJS.Signals | undefined;
  const forward = (signal: NodeJS.Signals) => {
    forwardedSignal = signal;
    child.kill(signal);
  };
  const interrupt = () => forward("SIGINT");
  const terminate = () => forward("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);

  const exitCode = await child.exited;
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", terminate);

  if (forwardedSignal) {
    process.kill(process.pid, forwardedSignal);
    return;
  }
  if (exitCode !== 0) {
    throw new Error(`${step.name} failed with exit code ${exitCode}.`);
  }
}

function runtimePlatform(): SupportedPlatform {
  if (process.platform === "darwin" || process.platform === "linux") {
    return process.platform;
  }
  throw new Error(
    `Local CI supports macOS and Linux only (found ${process.platform}).`
  );
}

export async function runLocalCi(): Promise<void> {
  const platform = runtimePlatform();
  assertMinimumVersion("Bun", Bun.version, MINIMUM_BUN_VERSION);

  const nodePath = Bun.which("node");
  if (!nodePath) {
    throw new Error(`Node.js ${MINIMUM_NODE_VERSION} or newer is required.`);
  }
  const nodeVersion = capturedCommand([nodePath, "--version"]);
  assertMinimumVersion("Node.js", nodeVersion, MINIMUM_NODE_VERSION);

  const chromePath = resolveChromePath({ env: process.env, platform });
  const modelCache = resolveModelCache({ env: process.env, platform });
  mkdirSync(modelCache, { recursive: true });

  const bunPath = process.execPath;
  const onlineEnv: Environment = {
    ...process.env,
    OPENKLIP_MODEL_CACHE: modelCache,
  };
  onlineEnv.TRANSFORMERS_OFFLINE = undefined;
  const offlineEnv: Environment = {
    ...onlineEnv,
    TRANSFORMERS_OFFLINE: "1",
  };
  const browserEnv: Environment = {
    ...offlineEnv,
    OPENKLIP_CHROME_PATH: chromePath,
  };

  console.error(`[local-ci] repo=${REPO_ROOT}`);
  console.error(`[local-ci] bun=${Bun.version} node=${nodeVersion}`);
  console.error(`[local-ci] model-cache=${modelCache}`);
  console.error(`[local-ci] chrome=${chromePath}`);

  const steps: CiStep[] = [
    {
      command: [bunPath, "install", "--frozen-lockfile"],
      name: "Install dependencies",
    },
    {
      command: [nodePath, "scripts/warm-models.mjs"],
      env: onlineEnv,
      name: "Warm model cache",
    },
    { command: [bunPath, "run", "check"], name: "Lint and format check" },
    {
      command: [
        bunPath,
        "run",
        "typecheck",
        "--incremental",
        "false",
        "--pretty",
        "false",
      ],
      name: "Typecheck",
    },
    {
      command: [bunPath, "run", "test"],
      env: offlineEnv,
      name: "Unit tests",
    },
    {
      command: [
        bunPath,
        "test",
        "--isolate",
        "tests/cam-mix.test.ts",
        "tests/cam-remix.test.ts",
        "-t",
        "integration",
      ],
      env: offlineEnv,
      name: "Multicam ffmpeg integration tests",
    },
    {
      command: [bunPath, "run", "agent-smoke-audit"],
      env: offlineEnv,
      name: "Agent loop smoke audit",
    },
    { command: [bunPath, "run", "build"], name: "Production build" },
    {
      command: [bunPath, "run", "test:acceptance"],
      env: offlineEnv,
      name: "Acceptance corpus and gate",
    },
    {
      command: [bunPath, "run", "test:integration"],
      env: browserEnv,
      name: "Browser integration tests",
    },
  ];

  for (const step of steps) {
    await runStep(step);
  }
  console.error("\n[local-ci] All checks passed.");
}

if (import.meta.main) {
  try {
    await runLocalCi();
  } catch (error) {
    console.error(
      `[local-ci] ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

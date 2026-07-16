// CRAFT-6185: `openklip serve` launches a production runtime (next start,
// requires a prior `bun run build`) while `openklip dev` keeps the
// contributor next-dev loop. Pure helpers here build the spawn plan and run
// preflight checks (build present, port free) so cli.ts can fail fast with
// an actionable message instead of an opaque crash or a silent dev fallback.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { appRoot } from "./repo-paths.ts";

export type ServeMode = "dev" | "serve";

export function nextBinaryPath(base: string): string {
  return join(base, "node_modules", "next", "dist", "bin", "next");
}

export function hasProductionBuild(base: string): boolean {
  return existsSync(join(base, ".next", "BUILD_ID"));
}

export interface ServeSpawnPlan {
  args: string[];
  cwd: string;
  env: {
    OPENKLIP_APP_ROOT: string;
    OPENKLIP_SLUG: string;
  };
}

export interface BuildServeSpawnPlanOptions {
  base?: string;
  execPath?: string;
  host: string;
  mode: ServeMode;
  port: string;
  slug: string;
}

export function buildServeSpawnPlan(
  options: BuildServeSpawnPlanOptions
): ServeSpawnPlan {
  const base = options.base ?? appRoot();
  const execPath = options.execPath ?? process.execPath;
  const nextCommand = options.mode === "serve" ? "start" : "dev";
  return {
    args: [
      execPath,
      "--bun",
      nextBinaryPath(base),
      nextCommand,
      "-p",
      options.port,
      "-H",
      options.host,
    ],
    cwd: base,
    env: {
      OPENKLIP_SLUG: options.slug,
      OPENKLIP_APP_ROOT: base,
    },
  };
}

export function isAddrInUseError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: unknown };
  return record.code === "EADDRINUSE";
}

/**
 * Preflight bind check: true when the port is free. Binds and immediately
 * releases a loopback-style listener on the given host/port; a bound port
 * (another process already listening, e.g. a prior `openklip serve` still
 * running) throws EADDRINUSE, which this reports as unavailable instead of
 * propagating an opaque crash into the caller.
 */
export async function isPortAvailable(
  port: number,
  host: string
): Promise<boolean> {
  let listener: ReturnType<typeof Bun.serve> | null = null;
  try {
    listener = Bun.serve({
      port,
      hostname: host,
      fetch: () => new Response("ok"),
    });
  } catch (error) {
    if (isAddrInUseError(error)) {
      return false;
    }
    throw error;
  }
  await listener.stop(true);
  return true;
}

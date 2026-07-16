import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function cwdPath(...segments: string[]): string {
  return resolve(/*turbopackIgnore: true*/ process.cwd(), ...segments);
}

// Walk up from `startDir` looking for the openklip package.json (identified
// by name, not just presence, so a nested/unrelated package.json along the
// way can't be mistaken for the app root). Bounded depth: a real match sits
// a handful of directories up at most (e.g. .next/server/app/... from a
// Turbopack server bundle still lives inside the repo tree).
const MAX_ANCESTOR_WALK = 8;

export function resolveAppRootFrom(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < MAX_ANCESTOR_WALK; i++) {
    const pkgPath = resolve(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
          name?: string;
        };
        if (pkg.name === "openklip") {
          return dir;
        }
      } catch {
        // Malformed package.json at this level: not our root, keep walking.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

let cachedModuleRoot: string | null | undefined;

// Derived once per process from this module's own location. Safe even inside
// a Turbopack server bundle: unlike import.meta.dir (which Turpoback compiles
// to undefined, see script-paths.ts), import.meta.url survives, and the
// bundle output still lives inside the repo tree, so the ancestor walk still
// lands on the real package.json. In practice the CLI already pins
// OPENKLIP_APP_ROOT before spawning Next (see src/serve-runtime.ts), so this
// branch mainly serves direct Bun execution (CLI, scripts, tests, MCP).
function moduleDerivedAppRoot(): string | null {
  if (cachedModuleRoot !== undefined) {
    return cachedModuleRoot;
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    cachedModuleRoot = resolveAppRootFrom(here);
  } catch {
    cachedModuleRoot = null;
  }
  return cachedModuleRoot;
}

// Resolvable base for distribution assets (templates, luts, brands, the
// transcribe/embed scripts, the bundled next binary). Order: an explicit
// override wins (set by the CLI when it spawns the Next process, or by a
// future packaged/Tauri launcher) > a base derived from where this module
// itself lives > process.cwd() as the dev fallback.
export function appRoot(): string {
  const override = process.env.OPENKLIP_APP_ROOT;
  if (override) {
    return resolve(override);
  }
  return moduleDerivedAppRoot() ?? process.cwd();
}

// Repo-relative runtime assets resolve against appRoot(), not raw cwd, so
// they keep working when OpenKlip is launched from an installed/relocated
// distribution. cwdPath (above) stays raw-cwd on purpose: it resolves
// user-typed relative file arguments (e.g. `openklip ingest video.mp4`),
// which must anchor at the user's shell cwd regardless of where the app
// itself is installed.
export function repoPath(...segments: string[]): string {
  return resolve(/*turbopackIgnore: true*/ appRoot(), ...segments);
}

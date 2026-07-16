import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { cwdPath } from "./repo-paths.ts";

// Writable local config state, not a bundled distribution asset: stays
// cwd-relative (unlike repoPath's distribution-relative asset base, see
// src/repo-paths.ts) until it gets its own Application-Support-style home
// (tracked separately, out of scope for CRAFT-6185).
function configDir(): string {
  return cwdPath(".openklip");
}

function configPath(): string {
  return join(configDir(), "projects-root");
}

export function readConfiguredProjectsRoot(): string | null {
  const fp = configPath();
  if (!existsSync(fp)) {
    return null;
  }
  const raw = readFileSync(fp, "utf8").trim();
  return raw ? resolve(raw) : null;
}

export function writeConfiguredProjectsRoot(root: string): void {
  const resolved = resolve(root);
  if (!(existsSync(resolved) && statSync(resolved).isDirectory())) {
    throw new Error(`not a directory: ${resolved}`);
  }
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), `${resolved}\n`, "utf8");
}

/** True when the projects root was set explicitly (env or folder picker). */
export function isWorkspaceConfigured(): boolean {
  if (process.env.OPENKLIP_PROJECTS_ROOT) {
    return true;
  }
  return readConfiguredProjectsRoot() !== null;
}

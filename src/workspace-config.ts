import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { stateDir } from "./repo-paths.ts";

function configPath(): string {
  return join(stateDir(), "projects-root");
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
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(configPath(), `${resolved}\n`, "utf8");
}

/** True when the projects root was set explicitly (env or folder picker). */
export function isWorkspaceConfigured(): boolean {
  if (process.env.OPENKLIP_PROJECTS_ROOT) {
    return true;
  }
  return readConfiguredProjectsRoot() !== null;
}

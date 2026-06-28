import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

function configDir(): string {
  return join(process.cwd(), ".openklip");
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

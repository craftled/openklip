import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Run path helpers against ./projects under a temp cwd (no .openklip config). */
export function withDefaultProjectsRoot<T>(fn: () => T): T {
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  const prevCwd = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), "openklip-paths-"));
  process.chdir(temp);
  delete process.env.OPENKLIP_PROJECTS_ROOT;
  try {
    return fn();
  } finally {
    process.chdir(prevCwd);
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
    rmSync(temp, { recursive: true, force: true });
  }
}

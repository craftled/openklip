import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Run path helpers against a temp `projects/` root. Pins
 * OPENKLIP_PROJECTS_ROOT explicitly so the layered-layout assertions
 * (project/working/output) stay deterministic and independent of the default
 * fallback location.
 */
export function withDefaultProjectsRoot<T>(fn: () => T): T {
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  const temp = mkdtempSync(join(tmpdir(), "openklip-paths-"));
  process.env.OPENKLIP_PROJECTS_ROOT = join(temp, "projects");
  try {
    return fn();
  } finally {
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
    rmSync(temp, { recursive: true, force: true });
  }
}

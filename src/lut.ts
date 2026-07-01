// LUT grading: apply a 3D color lookup table (.cube) to the picture at export.
// This is the technically-correct answer to log footage (the deck's S-Log3):
// a LUT converts/maps color in a way a parametric filter cannot. LUTs are a
// named seam like brands : drop `name.cube` into luts/ at the repo root and
// reference it by name, so project.json stays portable (no absolute paths).
//
// The path-name guard and the filtergraph escaping are pure and unit tested;
// only listLuts touches the filesystem.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "./repo-paths.ts";

// Same traversal guard as brand/slug names: a LUT name can never escape luts/.
const LUT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// luts/ lives at the repo root next to projects/ and brands/.
export function lutsRoot(): string {
  return repoPath("luts");
}

// Resolve a LUT name to luts/<name>.cube, rejecting any traversal attempt.
export function lutPath(name: string): string {
  if (typeof name !== "string" || name.length > 64 || !LUT_NAME.test(name)) {
    throw new Error(`invalid LUT name: ${JSON.stringify(name)}`);
  }
  return join(lutsRoot(), `${name}.cube`);
}

// Available LUT names (files in luts/ ending .cube), without the extension.
export function listLuts(): string[] {
  const dir = lutsRoot();
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith(".cube"))
    .map((n) => n.replace(/\.cube$/i, ""))
    .sort();
}

// Escape a path for an ffmpeg filtergraph single-quoted value (mirrors the
// subtitles-path escaping the exporter already uses).
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// The lut3d filter expression for an absolute .cube path.
export function lut3dExpr(absPath: string): string {
  return `lut3d=file='${escapeFilterPath(absPath)}'`;
}

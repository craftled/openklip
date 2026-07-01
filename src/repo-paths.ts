import { resolve } from "node:path";

export function cwdPath(...segments: string[]): string {
  return resolve(/*turbopackIgnore: true*/ process.cwd(), ...segments);
}

// Today repo roots and user-relative paths both anchor at the process cwd.
// Keeping this alias separate makes call sites state intent without duplicating
// the Turbopack ignore marker.
export function repoPath(...segments: string[]): string {
  return cwdPath(...segments);
}

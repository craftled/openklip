import { repoPath } from "./repo-paths.ts";

// Runtime-spawned sibling scripts must resolve from the repo root, not
// import.meta.dir: Turbopack compiles import.meta.dir to undefined inside the
// Next server bundle, which breaks any engine path reached through an API
// route or server action (browser ingest, GUI verify, rich graphic export).
export function transcribeScriptPath(): string {
  return repoPath("src", "transcribe.mjs");
}

export function embedScriptPath(): string {
  return repoPath("src", "embed.mjs");
}

export function graphicRuntimeEntryPath(): string {
  return repoPath("src", "graphic-runtime-entry.ts");
}

export function mapMotionRuntimeEntryPath(): string {
  return repoPath("src", "map-motion-runtime-entry.ts");
}

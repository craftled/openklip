import { repoPath } from "./repo-paths.ts";

// Runtime-spawned sibling scripts must resolve from the repo root, not
// import.meta.dir: Turbopack compiles import.meta.dir to undefined inside the
// Next server bundle, which breaks any engine path reached through an API
// route or server action (browser ingest, GUI verify, rich graphic export).
export function transcribeScriptPath(): string {
  return repoPath("src", "transcribe.mjs");
}

// Test-only override, same convention as OPENKLIP_PROJECTS_ROOT in
// src/paths.ts: lets a test spawn a lightweight fake in place of the real
// embed.mjs (which needs a real CLIP model + network) to exercise the warm
// embed worker's/route's plumbing without that dependency.
export function embedScriptPath(): string {
  return process.env.OPENKLIP_EMBED_SCRIPT_PATH || repoPath("src", "embed.mjs");
}

export function graphicRuntimeEntryPath(): string {
  return repoPath("src", "graphic-runtime-entry.ts");
}

export function mapMotionRuntimeEntryPath(): string {
  return repoPath("src", "map-motion-runtime-entry.ts");
}

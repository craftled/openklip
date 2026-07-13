// Pure inverse of frameTimeSec (src/scene-log.ts): given a source-time
// timestamp, name the ingest frame that covers it. Kept free of node
// imports, unlike the rest of src/moment-search.ts (which imports node:fs
// at module scope), so client components (the Search sidebar panel's Text
// tab, which picks a thumbnail for a transcript match) can value-import
// this one function without dragging node:fs into the browser bundle.
// Pattern: src/action-log-entry.ts / src/agent-task-types.ts. Every caller,
// web and engine, imports from HERE directly - src/moment-search.ts does
// NOT re-export it (that would be a barrel export).

// Ingest frame i (1-based) covers [(i-1)*step, i*step) seconds (mirrors
// FRAME_STEP_SEC in src/scene-log.ts and src/embed.mjs). Flooring picks the
// frame whose span contains `sec`; negative input clamps to the first frame.
export function frameNameForTime(sec: number, stepSec = 3): string {
  const index1Based = Math.max(1, Math.floor(sec / stepSec) + 1);
  return `${String(index1Based).padStart(4, "0")}.jpg`;
}

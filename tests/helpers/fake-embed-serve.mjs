// Test-only stand-in for src/embed.mjs's `serve` subcommand: implements the
// same line-delimited JSON protocol (src/embed-service.ts) but returns a
// fixed 2-dim vector for any query text instead of running a real CLIP
// model. Lets a test exercise the real warm-worker/route wiring (spawn,
// stdio protocol, HTTP response) without network or model-download cost.
// Wired in via OPENKLIP_EMBED_SCRIPT_PATH (src/script-paths.ts).
import { createInterface } from "node:readline";

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Number.POSITIVE_INFINITY,
});
for await (const rawLine of rl) {
  const line = rawLine.trim();
  if (!line) {
    continue;
  }
  const { id } = JSON.parse(line);
  process.stdout.write(
    `${JSON.stringify({ id, model: "fake-test-model", dim: 2, vector: [1, 0] })}\n`
  );
}

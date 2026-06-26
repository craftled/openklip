// Post-export "package" passes: optional finishing steps that run DOWNSTREAM of
// `openklip export` on the finished out.mp4 via the real HyperFrames CLI
// (`hyperframes`, an npm package — NOT bundled; it needs Chrome + ffmpeg).
//
// These map to the HyperFrames subcommands that genuinely operate on a finished
// video. `remove-background` is the matte primitive the "embed captions behind
// the subject" / transparent-transition workflows are built on; `transcribe`
// re-derives word timestamps. The skill-driven HTML compositions
// (embedded-captions, talking-head-recut) are authored via `hyperframes skills`
// + `hyperframes render` and are out of scope for a one-shot pass.
//
// Pure builders here are unit-testable; the actual spawn happens in the CLI.
import { existsSync } from "node:fs";

export interface PackagePass {
  // argv template after the CLI binary; {input}/{output} are substituted.
  args: string[];
  id: string;
  label: string;
  // output file extension for this pass's product.
  outExt: string;
  // optional human note about extra deps this pass needs.
  requires?: string;
}

const PASSES: PackagePass[] = [
  {
    id: "remove-background",
    label:
      "Remove background → transparent media (matte for embed-behind-subject / transitions)",
    args: ["remove-background", "{input}", "-o", "{output}"],
    outExt: "webm",
  },
  {
    id: "transcribe",
    label: "Re-derive word-level captions from the cut (SRT sidecar)",
    args: ["transcribe", "{input}", "--to", "srt", "-o", "{output}"],
    outExt: "srt",
    requires: "whisper-cpp (brew install whisper-cpp)",
  },
];

export function listPackagePasses(): PackagePass[] {
  return PASSES;
}

export function resolvePackagePass(id: string): PackagePass {
  const pass = PASSES.find((p) => p.id === id);
  if (!pass) {
    const known = PASSES.map((p) => p.id).join(", ");
    throw new Error(`unknown package pass "${id}". Known: ${known}`);
  }
  return pass;
}

// Where to find the HyperFrames CLI: explicit env override wins; otherwise the
// caller checks the local node_modules bin / PATH via preflight.
export function resolveHyperframesCli(): string {
  return process.env.HYPERFRAMES_CLI || "hyperframes";
}

export function buildPackageArgv(
  pass: PackagePass,
  input: string,
  output: string,
  cli: string
): string[] {
  const subst = (s: string) =>
    s.replace("{input}", input).replace("{output}", output);
  return [cli, ...pass.args.map(subst)];
}

// Decide whether a pass can run. Kept pure (no fs) so it is unit-testable; the
// CLI feeds it the results of its existsSync/which checks.
export function checkPackagePreflight(input: {
  outExists: boolean;
  cli: string | null;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input.outExists) {
    errors.push("no export found — run `openklip export <slug>` first");
  }
  if (!input.cli) {
    errors.push(
      "HyperFrames CLI not found — install it (bun add -d hyperframes) and/or set HYPERFRAMES_CLI to its path"
    );
  }
  return { ok: errors.length === 0, errors };
}

// Resolve a CLI string to a concrete path if it exists, else null. A bare
// command name like "hyperframes" can't be existence-checked here, so treat it
// as unresolved unless it's a path (contains a separator) that exists.
export function resolveCliPath(cli: string): string | null {
  if (cli.includes("/") && existsSync(cli)) {
    return cli;
  }
  return null;
}

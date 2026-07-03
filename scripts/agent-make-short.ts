#!/usr/bin/env bun
/**
 * Make-short agent loop: derives a vertical short from an existing edit.
 * Sets 9:16 aspect with scene-based reframe when sceneLog is available,
 * exports with the shorts platform preset, and verifies. No LLM bundled.
 *
 * Trimming to --max-sec is not auto-applied (trimming requires agent
 * judgment about which phrases to cut). When the kept runtime exceeds
 * the target, this script warns and continues. Run the full agent loop
 * (or openklip cut) to trim first.
 */
import { setExportSettings, summarize } from "../src/actions.ts";
import type { CropMode, Project } from "../src/edl.ts";
import { exportCut } from "../src/exporter.ts";
import { mutateProject } from "../src/projectStore.ts";
import { verifyCut } from "../src/verify.ts";

function help(): void {
  console.log(`OpenKlip make-short agent loop

  bun run agent-make-short <slug> [options]

Options:
  --max-sec <n>     warn if kept duration exceeds N seconds (no auto-cut)
  --dry-run         preview settings without saving project.json or exporting
  --skip-export     set reframe without exporting
  --skip-verify     skip verify after export

Examples:
  bun run agent-make-short my-talk
  bun run agent-make-short my-talk --max-sec 60
  bun run agent-make-short my-talk --dry-run
  bun run agent-make-short my-talk --skip-export
`);
}

/**
 * Decide whether to use scene-derived crop or manual crop.
 * Returns "scene" when the project has a sceneLog, "manual" otherwise.
 * Exported for testing.
 */
export function chooseCropMode(project: Project): CropMode {
  return project.sceneLog ? "scene" : "manual";
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    help();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const slug = args[0];
  const dryRun = args.includes("--dry-run");
  const skipExport = args.includes("--skip-export");
  const skipVerify = args.includes("--skip-verify");

  const maxSecIdx = args.indexOf("--max-sec");
  const maxSec = maxSecIdx === -1 ? undefined : Number(args[maxSecIdx + 1]);
  if (maxSecIdx !== -1 && (maxSec === undefined || Number.isNaN(maxSec))) {
    console.error("error: --max-sec requires a number\n");
    help();
    process.exit(1);
  }

  try {
    // Re-import for clarity; mutateProject re-loads inside its own lock.
    const { loadProject } = await import("../src/projectStore.ts");
    const project = await loadProject(slug);
    const s = summarize(project);

    console.log(`\n[make-short] ${slug}`);
    console.log(
      `  kept runtime: ${s.keptDurationSec.toFixed(1)}s  words: ${s.kept}/${s.words}  ranges: ${s.cuts}`
    );

    if (maxSec !== undefined && s.keptDurationSec > maxSec) {
      console.warn(
        `\n[make-short] warning: kept runtime ${s.keptDurationSec.toFixed(1)}s exceeds --max-sec ${maxSec}. Trim separately before exporting.`
      );
    }

    const cropMode = chooseCropMode(project);
    console.log(
      `\n[make-short] setting 9:16 reframe, crop mode: ${cropMode}${project.sceneLog ? " (sceneLog detected)" : ""}`
    );

    if (dryRun) {
      console.log("[make-short] dry-run: skipping save and export");
      console.log("[make-short] done");
      process.exit(0);
    }

    await mutateProject(
      slug,
      (p) => {
        setExportSettings(p, { aspect: "9:16", cropMode });
      },
      { action: "export-set", actor: "agent" }
    );
    console.log("[make-short] saved export settings (9:16, shorts)");

    if (!skipExport) {
      console.log("\n[make-short] exporting (platform: shorts)...");
      const result = await exportCut(slug, { platform: "shorts" });
      console.log(
        `[make-short] exported ${result.durationSec.toFixed(1)}s  ${result.width}x${result.height}  -> ${result.out}`
      );

      if (!skipVerify) {
        console.log("\n[make-short] verifying...");
        const report = await verifyCut(slug);
        if (report.ok) {
          console.log("[make-short] verify passed");
        } else {
          console.warn(
            `[make-short] verify warnings: filler survivors: ${report.fillerSurvivors.length}, leaked cuts: ${report.leakedDeleted.length}, coverage: ${(report.keptCoverage * 100).toFixed(0)}%`
          );
          process.exit(1);
        }
      }
    }

    console.log("\n[make-short] done");
  } catch (e) {
    console.error(`\nerror: ${(e as Error).message}\n`);
    process.exit(1);
  }
}

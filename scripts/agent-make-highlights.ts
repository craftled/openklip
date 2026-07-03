#!/usr/bin/env bun
import type { HighlightClip } from "../src/edl.ts";
import { exportHighlight, highlightOutPath } from "../src/highlight-export.ts";
import { highlightClipLines } from "../src/highlights.ts";
import { loadProject } from "../src/projectStore.ts";

/**
 * Make-highlights agent loop: export stored LLM highlight clips as separate
 * vertical shorts without trimming project.json. Each clip is rendered from
 * its source-time span to output/highlights/{id}.mp4.
 */
function help(): void {
  console.log(`OpenKlip make-highlights agent loop

  bun run agent-make-highlights <slug> [options]

Options:
  --dry-run         preview clips and output paths without exporting
  --skip-export     list clips only, no render
  --skip-verify     skip verify (per-clip verify is not supported yet)
  --ids <h1,h2>     export only the listed highlight ids

Examples:
  bun run agent-make-highlights my-talk
  bun run agent-make-highlights my-talk --ids h1,h3
  bun run agent-make-highlights my-talk --dry-run
  bun run agent-make-highlights my-talk --skip-export
`);
}

/** Exported for testing: filter clips when --ids is passed. */
export function filterHighlightClips(
  clips: HighlightClip[],
  ids?: string[]
): HighlightClip[] {
  if (!ids || ids.length === 0) {
    return clips;
  }
  const want = new Set(ids);
  return clips.filter((c) => want.has(c.id));
}

/** Exported for testing: dry-run preview rows. */
export function previewHighlightExports(
  slug: string,
  clips: HighlightClip[]
): Array<{
  id: string;
  title: string;
  fromSec: number;
  toSec: number;
  out: string;
}> {
  return clips.map((c) => ({
    id: c.id,
    title: c.title,
    fromSec: c.fromSec,
    toSec: c.toSec,
    out: highlightOutPath(slug, c.id),
  }));
}

function parseIdsArg(args: string[]): string[] | undefined {
  const idx = args.indexOf("--ids");
  if (idx === -1) {
    return;
  }
  const raw = args[idx + 1];
  if (!raw) {
    throw new Error("--ids requires a comma-separated list (e.g. h1,h2)");
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

  try {
    const ids = parseIdsArg(args);
    const project = await loadProject(slug);
    const highlights = project.highlights;
    if (!highlights || highlights.clips.length === 0) {
      throw new Error(
        `no highlight clips on "${slug}". Run: openklip highlights-detect ${slug}`
      );
    }

    const clips = filterHighlightClips(highlights.clips, ids);
    if (clips.length === 0) {
      throw new Error("no clips matched --ids");
    }

    console.log(`\n[make-highlights] ${slug}`);
    console.log(highlightClipLines({ ...highlights, clips }));
    console.log(`\n[make-highlights] ${clips.length} clip(s) to export`);

    if (dryRun || skipExport) {
      for (const row of previewHighlightExports(slug, clips)) {
        console.log(
          `  ${row.id}  ${row.fromSec.toFixed(1)}-${row.toSec.toFixed(1)}s  -> ${row.out}`
        );
      }
      console.log(
        dryRun
          ? "[make-highlights] dry-run: skipping export"
          : "[make-highlights] skip-export: done"
      );
      process.exit(0);
    }

    if (!skipVerify) {
      console.warn(
        "[make-highlights] note: per-clip verify is not supported yet; use --skip-verify to silence"
      );
    }

    const exportOpts = { platform: "shorts" as const };
    for (const clip of clips) {
      console.log(`\n[make-highlights] exporting ${clip.id}...`);
      const result = await exportHighlight(slug, clip.id, exportOpts);
      console.log(
        `[make-highlights] ${clip.id}  ${result.durationSec.toFixed(1)}s  ${result.width}x${result.height}  -> ${result.out}`
      );
    }

    console.log("\n[make-highlights] done");
  } catch (e) {
    console.error(`\nerror: ${(e as Error).message}\n`);
    process.exit(1);
  }
}

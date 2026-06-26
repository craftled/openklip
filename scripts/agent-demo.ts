#!/usr/bin/env bun
/**
 * Agent-loop demo: composes atomic OpenKlip primitives the way an external
 * agent (Claude Code, Codex) would — discover state, cut from a phrase list,
 * verify, optionally export. No LLM bundled; phrases come from argv or a file.
 */
import { readFileSync } from "node:fs";
import { cutAllByText, cutByText, summarize } from "../src/actions.ts";
import { exportCut } from "../src/exporter.ts";
import { loadProject, saveProject } from "../src/projectStore.ts";

function help(): void {
  console.log(`OpenKlip agent-loop demo

  bun run agent-demo <slug> [options] [phrase...]

Options:
  --phrases <file>   one phrase per line (# comments and blank lines skipped)
  --all              cut every matching run per phrase (not just the first)
  --export           render out.mp4 after editing
  --dry-run          preview cuts without saving project.json

Examples:
  bun run agent-demo my-talk --phrases scripts/example-phrases.txt
  bun run agent-demo my-talk --all "you know" "sort of"
  bun run agent-demo my-talk --phrases scripts/example-phrases.txt --export
`);
}

function loadPhrases(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
}

function printStatus(
  label: string,
  slug: string,
  project: Awaited<ReturnType<typeof loadProject>>
): void {
  const s = summarize(project);
  console.log(`\n[${label}] ${slug}`);
  console.log(
    `  words: ${s.words} (${s.kept} kept, ${s.deleted} cut)  ranges: ${s.cuts}  runtime: ${s.keptDurationSec.toFixed(1)}s`
  );
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  help();
  process.exit(args.length === 0 ? 1 : 0);
}

const slug = args[0];
const dryRun = args.includes("--dry-run");
const cutAll = args.includes("--all");
const doExport = args.includes("--export");
const phrasesIdx = args.indexOf("--phrases");
const phrasesFile = phrasesIdx === -1 ? undefined : args[phrasesIdx + 1];
if (phrasesIdx !== -1 && !phrasesFile) {
  console.error("error: --phrases requires a file path\n");
  help();
  process.exit(1);
}

const positional = args.slice(1).filter((a, i, arr) => {
  if (a.startsWith("--")) {
    return false;
  }
  if (i > 0 && arr[i - 1] === "--phrases") {
    return false;
  }
  return !["--dry-run", "--all", "--export"].includes(a);
});

const phrases = [
  ...(phrasesFile ? loadPhrases(phrasesFile) : []),
  ...positional,
];

if (phrases.length === 0) {
  console.error(
    "error: provide phrases as arguments or via --phrases <file>\n"
  );
  help();
  process.exit(1);
}

try {
  const project = await loadProject(slug);
  printStatus("before", slug, project);

  console.log(
    `\n[agent] cutting ${phrases.length} phrase(s)${cutAll ? " (all matches)" : ""}...`
  );
  let totalWords = 0;
  for (const phrase of phrases) {
    if (cutAll) {
      const result = cutAllByText(project, phrase);
      if (result.matches === 0) {
        console.log(`  skip  "${phrase}" (no match)`);
      } else {
        totalWords += result.ids.length;
        console.log(
          `  cut   "${phrase}" → ${result.matches} run(s), ${result.ids.length} word(s)`
        );
      }
    } else {
      const result = cutByText(project, phrase);
      if (result.matched) {
        totalWords += result.ids.length;
        console.log(`  cut   "${phrase}" → ${result.ids.length} word(s)`);
      } else {
        console.log(`  skip  "${phrase}" (no match)`);
      }
    }
  }

  console.log(`\n[agent] ${totalWords} word(s) marked deleted`);
  printStatus("after", slug, project);

  if (dryRun) {
    console.log("\n[agent] dry-run — project.json not saved");
  } else {
    await saveProject(slug, project);
    console.log("\n[agent] saved project.json");
  }

  if (doExport) {
    if (dryRun) {
      console.log("[agent] skipping export in dry-run mode");
    } else {
      console.log("\n[agent] exporting...");
      const r = await exportCut(slug);
      console.log(
        `[agent] exported ${r.ranges} ranges, ${r.durationSec.toFixed(1)}s (${r.height}p) -> ${r.out}`
      );
    }
  }

  console.log("\n[agent] done");
} catch (e) {
  console.error(`\nerror: ${(e as Error).message}\n`);
  process.exit(1);
}

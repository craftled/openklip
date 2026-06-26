#!/usr/bin/env bun
import { existsSync } from "node:fs";
import {
  addBroll,
  addTitle,
  cutByText,
  cutWords,
  removeBroll,
  removeTitle,
  restoreAll,
  setCaptions,
  summarize,
} from "./actions.ts";
import { registerBroll } from "./broll.ts";
import { type Project, ProjectSchema, samplesToSec } from "./edl.ts";
import { exportCut } from "./exporter.ts";
import { ingest } from "./ingest.ts";
import { projectPaths } from "./paths.ts";
import { latestProject } from "./projectStore.ts";

const [cmd, ...rest] = process.argv.slice(2);

function help(): void {
  console.log(`OpenKlip - edit video by editing text

  openklip ingest <video>          transcribe + build a project
  openklip serve [slug]            open the local editor (default: latest project)
  openklip broll <slug> <f>        register a b-roll clip on a project

  openklip transcript <slug>       print every word with id, time, and cut state
  openklip cut <slug> <tokens...>  mark words deleted; ids (w12) or ranges (w12-w20)
                                     --restore     restore the listed words instead
                                     --text "..."  cut the first run matching a phrase
  openklip restore <slug>          restore every word (clear all cuts)
  openklip broll-add <slug> <assetId> <fromSec> <toSec>
                                   cover a source-time span with a registered asset
  openklip broll-rm <slug> <brollId>   remove a b-roll clip
  openklip title-add <slug> <fromSec> <toSec> <text>
                                   burn a title card over a source-time span
                                     --position lower|center|hero  (default lower)
  openklip title-rm <slug> <titleId>   remove a title card
  openklip captions <slug> <on|off>    toggle burned captions for export
  openklip status <slug>           summarize the current edit

  openklip export <slug>           render the current cut to out.mp4
`);
}

// Load + validate a project.json by slug. The file IS the edit, so this is the
// same document the GUI reads/writes.
async function loadProject(slug: string): Promise<Project> {
  const p = projectPaths(slug);
  return ProjectSchema.parse(JSON.parse(await Bun.file(p.project).text()));
}

// Persist a project back to disk in the canonical pretty-printed shape.
async function saveProject(slug: string, project: Project): Promise<void> {
  const p = projectPaths(slug);
  await Bun.write(p.project, JSON.stringify(project, null, 2));
}

function mmss(sample: number): string {
  const total = Math.round(samplesToSec(sample));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Expand cut tokens (word ids "w12" and inclusive ranges "w12-w20") into the
// concrete list of word ids present on the project, preserving project order.
function resolveCutIds(project: Project, tokens: string[]): string[] {
  const order = new Map(project.words.map((w, i) => [w.id, i]));
  const picked = new Set<string>();
  for (const tok of tokens) {
    const dash = tok.indexOf("-");
    if (dash > 0) {
      const from = tok.slice(0, dash);
      const to = tok.slice(dash + 1);
      const a = order.get(from);
      const b = order.get(to);
      if (a === undefined) {
        throw new Error(`unknown word id "${from}"`);
      }
      if (b === undefined) {
        throw new Error(`unknown word id "${to}"`);
      }
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      for (let i = lo; i <= hi; i++) {
        picked.add(project.words[i].id);
      }
    } else {
      if (!order.has(tok)) {
        throw new Error(`unknown word id "${tok}"`);
      }
      picked.add(tok);
    }
  }
  // Return in project order for stable output.
  return project.words.map((w) => w.id).filter((id) => picked.has(id));
}

try {
  switch (cmd) {
    case "ingest":
      if (!rest[0]) {
        throw new Error("usage: openklip ingest <video>");
      }
      await ingest(rest[0]);
      break;
    case "serve":
    case "dev": {
      // Launch the Next.js editor, pinned to this project via OPENKLIP_SLUG.
      const slug = rest[0] ?? latestProject();
      if (!slug) {
        throw new Error("no projects found. Run: openklip ingest <video>");
      }
      if (!existsSync(projectPaths(slug).project)) {
        throw new Error(`project not found: ${slug}`);
      }
      const port = process.env.PORT ?? "4399";
      console.log(
        `[serve] project: ${slug}\n\n  OpenKlip ready  ->  http://localhost:${port}\n`
      );
      const proc = Bun.spawn(
        [
          process.execPath,
          "--bun",
          "node_modules/next/dist/bin/next",
          "dev",
          "-p",
          String(port),
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, OPENKLIP_SLUG: slug },
          stdio: ["inherit", "inherit", "inherit"],
        }
      );
      await proc.exited;
      break;
    }
    case "broll": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip broll <slug> <file>");
      }
      await registerBroll(rest[0], rest[1]);
      break;
    }
    case "transcript": {
      if (!rest[0]) {
        throw new Error("usage: openklip transcript <slug>");
      }
      const project = await loadProject(rest[0]);
      project.words.forEach((w, i) => {
        const cut = w.deleted ? "  [cut]" : "";
        console.log(
          `${String(i).padStart(4)}  ${w.id.padEnd(6)}  ${mmss(w.startSample)}  ${w.text}${cut}`
        );
      });
      console.log(
        `\n${project.words.length} words (${project.words.filter((w) => w.deleted).length} cut)`
      );
      break;
    }
    case "cut": {
      if (!rest[0]) {
        throw new Error(
          'usage: openklip cut <slug> <tokens...> | --text "phrase" [--restore]'
        );
      }
      const slug = rest[0];
      const args = rest.slice(1);
      const restore = args.includes("--restore");
      const textIdx = args.indexOf("--text");
      const project = await loadProject(slug);

      if (textIdx !== -1) {
        const phrase = args[textIdx + 1];
        if (!phrase) {
          throw new Error('usage: openklip cut <slug> --text "phrase to cut"');
        }
        const result = cutByText(project, phrase);
        if (!result.matched) {
          console.log(`no contiguous run of words matched: "${phrase}"`);
          break;
        }
        await saveProject(slug, project);
        console.log(`cut ${result.ids.length} words: ${result.ids.join(", ")}`);
        break;
      }

      const tokens = args.filter((a) => a !== "--restore");
      if (tokens.length === 0) {
        throw new Error(
          "usage: openklip cut <slug> <w12> <w15-w20> [--restore]"
        );
      }
      const ids = resolveCutIds(project, tokens);
      cutWords(project, ids, !restore);
      await saveProject(slug, project);
      console.log(
        `${restore ? "restored" : "cut"} ${ids.length} words: ${ids.join(", ")}`
      );
      break;
    }
    case "restore": {
      if (!rest[0]) {
        throw new Error("usage: openklip restore <slug>");
      }
      const project = await loadProject(rest[0]);
      restoreAll(project);
      await saveProject(rest[0], project);
      console.log("restored all words");
      break;
    }
    case "broll-add": {
      if (!(rest[0] && rest[1] && rest[2] && rest[3])) {
        throw new Error(
          "usage: openklip broll-add <slug> <assetId> <fromSec> <toSec>"
        );
      }
      const slug = rest[0];
      const fromSec = Number(rest[2]);
      const toSec = Number(rest[3]);
      if (!(Number.isFinite(fromSec) && Number.isFinite(toSec))) {
        throw new Error("fromSec and toSec must be numbers (seconds)");
      }
      const project = await loadProject(slug);
      const item = addBroll(project, { assetId: rest[1], fromSec, toSec });
      await saveProject(slug, project);
      console.log(
        `added b-roll ${item.id} (asset "${item.assetId}", ${fromSec}s-${toSec}s)`
      );
      break;
    }
    case "broll-rm": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip broll-rm <slug> <brollId>");
      }
      const project = await loadProject(rest[0]);
      const removed = removeBroll(project, rest[1]);
      if (!removed) {
        console.log(`no b-roll clip with id "${rest[1]}"`);
        break;
      }
      await saveProject(rest[0], project);
      console.log(`removed b-roll ${rest[1]}`);
      break;
    }
    case "title-add": {
      if (!rest[0]) {
        throw new Error(
          "usage: openklip title-add <slug> <fromSec> <toSec> <text> [--position lower|center|hero]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(1);
      const posIdx = args.indexOf("--position");
      let position: "lower" | "center" | "hero" = "lower";
      if (posIdx !== -1) {
        const pos = args[posIdx + 1]?.toLowerCase();
        if (pos !== "lower" && pos !== "center" && pos !== "hero") {
          throw new Error("--position must be lower, center, or hero");
        }
        position = pos;
      }
      const timingAndText =
        posIdx === -1
          ? args
          : args.filter((_, i) => i !== posIdx && i !== posIdx + 1);
      if (timingAndText.length < 3) {
        throw new Error(
          "usage: openklip title-add <slug> <fromSec> <toSec> <text> [--position lower|center|hero]"
        );
      }
      const fromSec = Number(timingAndText[0]);
      const toSec = Number(timingAndText[1]);
      if (!(Number.isFinite(fromSec) && Number.isFinite(toSec))) {
        throw new Error("fromSec and toSec must be numbers (seconds)");
      }
      const text = timingAndText.slice(2).join(" ").replace(/\\n/g, "\n");
      const project = await loadProject(slug);
      const item = addTitle(project, { fromSec, toSec, text, position });
      await saveProject(slug, project);
      console.log(
        `added title ${item.id} (${fromSec}s-${toSec}s, ${position}): "${item.text}"`
      );
      break;
    }
    case "title-rm": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip title-rm <slug> <titleId>");
      }
      const project = await loadProject(rest[0]);
      const removed = removeTitle(project, rest[1]);
      if (!removed) {
        console.log(`no title card with id "${rest[1]}"`);
        break;
      }
      await saveProject(rest[0], project);
      console.log(`removed title ${rest[1]}`);
      break;
    }
    case "captions": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip captions <slug> <on|off>");
      }
      const mode = rest[1].toLowerCase();
      if (mode !== "on" && mode !== "off") {
        throw new Error("usage: openklip captions <slug> <on|off>");
      }
      const project = await loadProject(rest[0]);
      setCaptions(project, mode === "on");
      await saveProject(rest[0], project);
      console.log(`captions ${mode}`);
      break;
    }
    case "status": {
      if (!rest[0]) {
        throw new Error("usage: openklip status <slug>");
      }
      const project = await loadProject(rest[0]);
      const s = summarize(project);
      console.log(`project: ${project.slug}`);
      console.log(
        `  words:        ${s.words}  (${s.kept} kept, ${s.deleted} cut)`
      );
      console.log(`  cut ranges:   ${s.cuts}`);
      console.log(`  b-roll:       ${s.brollCount}`);
      console.log(`  captions:     ${project.captions.enabled ? "on" : "off"}`);
      console.log(`  kept runtime: ${s.keptDurationSec.toFixed(1)}s`);
      break;
    }
    case "export": {
      if (!rest[0]) {
        throw new Error("usage: openklip export <slug>");
      }
      const r = await exportCut(rest[0]);
      console.log(
        `exported ${r.ranges} ranges, ${r.durationSec.toFixed(1)}s -> ${r.out}`
      );
      break;
    }
    default:
      help();
  }
} catch (e) {
  console.error(`\nerror: ${(e as Error).message}\n`);
  process.exit(1);
}

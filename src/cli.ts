#!/usr/bin/env bun
import { existsSync } from "node:fs";
import {
  addBroll,
  addTitle,
  addZoom,
  cutAllByText,
  cutByText,
  cutWords,
  removeBroll,
  removeTitle,
  removeZoom,
  restoreAll,
  setCaptionMaxWords,
  setCaptions,
  setLook,
  setPadMs,
  summarize,
  updateBroll,
  updateTitle,
  updateZoom,
} from "./actions.ts";
import { registerBroll } from "./broll.ts";
import { type Project, ProjectSchema, samplesToSec } from "./edl.ts";
import { exportCut } from "./exporter.ts";
import { ingest } from "./ingest.ts";
import { projectPaths } from "./paths.ts";
import { latestProject, listProjects } from "./projectStore.ts";

const [cmd, ...rest] = process.argv.slice(2);

function help(): void {
  console.log(`OpenKlip - edit video by editing text

Discovery
  openklip list                      list projects (most recent first)
  openklip assets <slug>             list registered b-roll assets

Setup
  openklip ingest <video>            transcribe + build a project
  openklip serve [slug]              open the local editor (default: latest)
  openklip broll <slug> <file>       register a b-roll clip on a project

Transcript edits
  openklip transcript <slug>         print every word with id, time, cut state
  openklip cut <slug> <tokens...>    mark words deleted; ids (w12) or ranges (w12-w20)
                                       --restore     restore the listed words instead
                                       --text "..."  cut the first run matching a phrase
                                       --all         with --text, cut every matching run
  openklip restore <slug>            restore every word (clear all cuts)

Overlays
  openklip broll-add <slug> <assetId> <fromSec> <toSec>
                                     cover a source-time span with a registered asset
  openklip broll-set <slug> <brollId>  patch b-roll (--asset --from --to --src-in)
  openklip broll-rm <slug> <brollId> remove a b-roll clip
  openklip title-add <slug> <fromSec> <toSec> <text>
                                     burn a title card over a source-time span
                                       --position lower|center|hero  (default lower)
  openklip title-set <slug> <titleId>  patch title (--text --position --from --to)
  openklip title-rm <slug> <titleId> remove a title card
  openklip zoom-add <slug> <fromSec> <toSec>
                                     push-in zoom over a source-time span
                                       --scale <1-3>   (default 1.15)
                                       --ramp <sec>    (default 0.6)
  openklip zoom-set <slug> <zoomId>  patch zoom (--scale --ramp --from --to)
  openklip zoom-rm <slug> <zoomId>   remove a push-in zoom

Look & captions
  openklip captions <slug> <on|off>    toggle burned captions for export
  openklip captions-max <slug> <n>       words per caption line (1-12)
  openklip look <slug> vignette <on|off> toggle vignette
  openklip pad <slug> <ms>               cut boundary padding (0-500 ms)

Review & export
  openklip status <slug>             summarize the current edit
  openklip export <slug>             render the current cut to out.mp4
                                       --height <px>  max output height (e.g. 1080)
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

function secSpan(startSample: number, endSample: number): string {
  return `${samplesToSec(startSample).toFixed(1)}s-${samplesToSec(endSample).toFixed(1)}s`;
}

function parseOnOff(value: string, label: string): boolean {
  const mode = value.toLowerCase();
  if (mode === "on") {
    return true;
  }
  if (mode === "off") {
    return false;
  }
  throw new Error(`usage: ${label} <on|off>`);
}

function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) {
    return;
  }
  return args[idx + 1];
}

function flagNumber(args: string[], flag: string): number | undefined {
  const raw = flagValue(args, flag);
  if (raw === undefined) {
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${flag} must be a number`);
  }
  return n;
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
    case "list": {
      const projects = listProjects();
      if (projects.length === 0) {
        console.log("no projects found. Run: openklip ingest <video>");
        break;
      }
      for (const { slug, mtimeMs } of projects) {
        const ageMin = Math.round((Date.now() - mtimeMs) / 60_000);
        const age =
          ageMin < 60
            ? `${ageMin}m ago`
            : ageMin < 1440
              ? `${Math.round(ageMin / 60)}h ago`
              : `${Math.round(ageMin / 1440)}d ago`;
        console.log(`${slug.padEnd(24)}  ${age}`);
      }
      console.log(`\n${projects.length} project(s)`);
      break;
    }
    case "assets": {
      if (!rest[0]) {
        throw new Error("usage: openklip assets <slug>");
      }
      const project = await loadProject(rest[0]);
      if (project.assets.length === 0) {
        console.log("no assets registered. Run: openklip broll <slug> <file>");
        break;
      }
      for (const a of project.assets) {
        const dur = samplesToSec(a.durationSamples).toFixed(1);
        console.log(`${a.id.padEnd(16)}  ${`${dur}s`.padStart(7)}  ${a.name}`);
      }
      console.log(`\n${project.assets.length} asset(s)`);
      break;
    }
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
      const cutAll = args.includes("--all");
      const textIdx = args.indexOf("--text");
      const project = await loadProject(slug);

      if (textIdx !== -1) {
        const phrase = args[textIdx + 1];
        if (!phrase) {
          throw new Error(
            'usage: openklip cut <slug> --text "phrase" [--all] [--restore]'
          );
        }
        if (restore) {
          throw new Error("--restore is not supported with --text");
        }
        if (cutAll) {
          const result = cutAllByText(project, phrase);
          if (result.matches === 0) {
            console.log(`no contiguous runs matched: "${phrase}"`);
            break;
          }
          await saveProject(slug, project);
          console.log(
            `cut ${result.matches} run(s), ${result.ids.length} words: ${result.ids.join(", ")}`
          );
          break;
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

      const tokens = args.filter((a) => a !== "--restore" && a !== "--all");
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
    case "broll-set": {
      if (!(rest[0] && rest[1])) {
        throw new Error(
          "usage: openklip broll-set <slug> <brollId> [--asset id] [--from N] [--to N] [--src-in N]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(2);
      const project = await loadProject(slug);
      const item = updateBroll(project, rest[1], {
        assetId: flagValue(args, "--asset"),
        fromSec: flagNumber(args, "--from"),
        toSec: flagNumber(args, "--to"),
        srcInSec: flagNumber(args, "--src-in"),
      });
      await saveProject(slug, project);
      console.log(
        `updated b-roll ${item.id} (asset "${item.assetId}", ${secSpan(item.startSample, item.endSample)})`
      );
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
    case "title-set": {
      if (!(rest[0] && rest[1])) {
        throw new Error(
          'usage: openklip title-set <slug> <titleId> [--text "..."] [--position lower|center|hero] [--from N] [--to N]'
        );
      }
      const slug = rest[0];
      const args = rest.slice(2);
      const pos = flagValue(args, "--position")?.toLowerCase();
      if (
        pos !== undefined &&
        pos !== "lower" &&
        pos !== "center" &&
        pos !== "hero"
      ) {
        throw new Error("--position must be lower, center, or hero");
      }
      const textRaw = flagValue(args, "--text");
      const project = await loadProject(slug);
      const item = updateTitle(project, rest[1], {
        text: textRaw?.replace(/\\n/g, "\n"),
        position: pos as "lower" | "center" | "hero" | undefined,
        fromSec: flagNumber(args, "--from"),
        toSec: flagNumber(args, "--to"),
      });
      await saveProject(slug, project);
      console.log(
        `updated title ${item.id} (${item.position}): "${item.text.replace(/\n/g, "\\n")}"`
      );
      break;
    }
    case "zoom-add": {
      if (!rest[0]) {
        throw new Error(
          "usage: openklip zoom-add <slug> <fromSec> <toSec> [--scale N] [--ramp N]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(1);
      const scaleIdx = args.indexOf("--scale");
      const rampIdx = args.indexOf("--ramp");
      let scale: number | undefined;
      let rampSec: number | undefined;
      if (scaleIdx !== -1) {
        scale = Number(args[scaleIdx + 1]);
        if (!Number.isFinite(scale)) {
          throw new Error("--scale must be a number between 1 and 3");
        }
      }
      if (rampIdx !== -1) {
        rampSec = Number(args[rampIdx + 1]);
        if (!Number.isFinite(rampSec)) {
          throw new Error("--ramp must be a number between 0 and 5");
        }
      }
      const timing = args.filter(
        (_, i) =>
          i !== scaleIdx &&
          i !== scaleIdx + 1 &&
          i !== rampIdx &&
          i !== rampIdx + 1
      );
      if (timing.length < 2) {
        throw new Error(
          "usage: openklip zoom-add <slug> <fromSec> <toSec> [--scale N] [--ramp N]"
        );
      }
      const fromSec = Number(timing[0]);
      const toSec = Number(timing[1]);
      if (!(Number.isFinite(fromSec) && Number.isFinite(toSec))) {
        throw new Error("fromSec and toSec must be numbers (seconds)");
      }
      const project = await loadProject(slug);
      const item = addZoom(project, { fromSec, toSec, scale, rampSec });
      await saveProject(slug, project);
      console.log(
        `added zoom ${item.id} (${fromSec}s-${toSec}s, ${item.scale}x, ramp ${item.rampSec}s)`
      );
      break;
    }
    case "zoom-rm": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip zoom-rm <slug> <zoomId>");
      }
      const project = await loadProject(rest[0]);
      const removed = removeZoom(project, rest[1]);
      if (!removed) {
        console.log(`no zoom with id "${rest[1]}"`);
        break;
      }
      await saveProject(rest[0], project);
      console.log(`removed zoom ${rest[1]}`);
      break;
    }
    case "zoom-set": {
      if (!(rest[0] && rest[1])) {
        throw new Error(
          "usage: openklip zoom-set <slug> <zoomId> [--scale N] [--ramp N] [--from N] [--to N]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(2);
      const project = await loadProject(slug);
      const item = updateZoom(project, rest[1], {
        scale: flagNumber(args, "--scale"),
        rampSec: flagNumber(args, "--ramp"),
        fromSec: flagNumber(args, "--from"),
        toSec: flagNumber(args, "--to"),
      });
      await saveProject(slug, project);
      console.log(
        `updated zoom ${item.id} (${item.scale}x, ramp ${item.rampSec}s, ${secSpan(item.startSample, item.endSample)})`
      );
      break;
    }
    case "captions": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip captions <slug> <on|off>");
      }
      const enabled = parseOnOff(rest[1], "openklip captions <slug>");
      const project = await loadProject(rest[0]);
      setCaptions(project, enabled);
      await saveProject(rest[0], project);
      console.log(`captions ${enabled ? "on" : "off"}`);
      break;
    }
    case "captions-max": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip captions-max <slug> <n>");
      }
      const n = Number(rest[1]);
      if (!Number.isFinite(n)) {
        throw new Error("n must be a number between 1 and 12");
      }
      const project = await loadProject(rest[0]);
      setCaptionMaxWords(project, n);
      await saveProject(rest[0], project);
      console.log(`captions max words: ${project.captions.maxWords}`);
      break;
    }
    case "look": {
      if (!(rest[0] && rest[1] && rest[2])) {
        throw new Error("usage: openklip look <slug> vignette <on|off>");
      }
      if (rest[1] !== "vignette") {
        throw new Error("usage: openklip look <slug> vignette <on|off>");
      }
      const vignette = parseOnOff(rest[2], "openklip look <slug> vignette");
      const project = await loadProject(rest[0]);
      setLook(project, { vignette });
      await saveProject(rest[0], project);
      console.log(`vignette ${vignette ? "on" : "off"}`);
      break;
    }
    case "pad": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip pad <slug> <ms>");
      }
      const ms = Number(rest[1]);
      if (!Number.isFinite(ms)) {
        throw new Error("ms must be a number between 0 and 500");
      }
      const project = await loadProject(rest[0]);
      setPadMs(project, ms);
      await saveProject(rest[0], project);
      console.log(`pad: ${project.padMs}ms`);
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
      console.log(`  kept runtime: ${s.keptDurationSec.toFixed(1)}s`);
      console.log(`  pad:          ${project.padMs ?? 50}ms`);
      console.log(
        `  captions:     ${project.captions.enabled ? "on" : "off"}  (max ${project.captions.maxWords ?? 6} words/line)`
      );
      console.log(
        `  look:         vignette ${project.look?.vignette ? "on" : "off"}`
      );
      console.log(`  assets:       ${s.assetCount}`);
      console.log(`  b-roll:       ${s.brollCount}`);
      for (const b of project.broll) {
        console.log(
          `    ${b.id}  asset ${b.assetId}  ${secSpan(b.startSample, b.endSample)}`
        );
      }
      console.log(`  titles:       ${s.titleCount}`);
      for (const t of project.titles ?? []) {
        const preview = t.text.replace(/\n/g, "\\n").slice(0, 40);
        console.log(
          `    ${t.id}  ${t.position}  ${secSpan(t.startSample, t.endSample)}  "${preview}"`
        );
      }
      console.log(`  zooms:        ${s.zoomCount}`);
      for (const z of project.zooms ?? []) {
        console.log(
          `    ${z.id}  ${z.scale}x  ramp ${z.rampSec}s  ${secSpan(z.startSample, z.endSample)}`
        );
      }
      break;
    }
    case "export": {
      if (!rest[0]) {
        throw new Error("usage: openklip export <slug> [--height <px>]");
      }
      const heightIdx = rest.indexOf("--height");
      let maxHeight: number | undefined;
      if (heightIdx !== -1) {
        maxHeight = Number(rest[heightIdx + 1]);
        if (!Number.isFinite(maxHeight)) {
          throw new Error("--height must be a positive number");
        }
      }
      const r = await exportCut(rest[0], { maxHeight });
      console.log(
        `exported ${r.ranges} ranges, ${r.durationSec.toFixed(1)}s (${r.height}p) -> ${r.out}`
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

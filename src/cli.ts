#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readActionLog } from "./action-log.ts";
import { summarize } from "./actions.ts";
import { listAgentTasks } from "./agent-tasks.ts";
import {
  AGENT_TASK_STATUSES,
  agentToolManifest,
  agentToolTable,
} from "./agent-tools.ts";
import { assembleFromSelection, ingestTake, listTakes } from "./assembly.ts";
import { analyzeAssets } from "./asset-cards.ts";
import { registerAsset } from "./assets.ts";
import { loadAudioAnalysis } from "./audio-analysis.ts";
import type { SilenceSpan } from "./audio-analysis-core.ts";
import { applyBrand, loadBrand } from "./brands.ts";
import { loadBrief, saveBrief } from "./brief.ts";
import { logBriefSet } from "./brief-log.ts";
import { BROLL_AUDIO_MODE_IDS } from "./broll-audio.ts";
import { BROLL_DISPLAY_IDS } from "./broll-display.ts";
import { isCaptionStyleId, listCaptionStyles } from "./caption-styles.ts";
import {
  cleanupReport,
  fillerOnlyCleanupReport,
  partitionSafeCandidates,
} from "./cleanup.ts";
import {
  runOverlays,
  runRanges,
  runStatusJson,
  runTranscriptGrep,
  runTranscriptPhrase,
  runTranscriptSpan,
} from "./cli-query.ts";
import { colorAdjustSummary } from "./color-adjust.ts";
import { runDoctor } from "./doctor.ts";
import {
  type Broll,
  type BrollDisplay,
  type Graphic,
  type MusicPlacement,
  type Project,
  ProjectSchema,
  type Still,
  samplesToSec,
  type Title,
  type Zoom,
} from "./edl.ts";
import {
  EXPORT_PLATFORM_IDS,
  type ExportPlatformId,
  isExportPlatformId,
} from "./export-platforms.ts";
import {
  EXPORT_COMPRESSIONS,
  type ExportCompression,
  exportCut,
  parseExportFpsFlag,
  parseExportLoudnessFlag,
} from "./exporter.ts";
import { FFMPEG, FFPROBE } from "./ffmpeg.ts";
import { FILTER_NAMES, isFilter } from "./filter.ts";
import { ingest } from "./ingest.ts";
import { loadIngesters } from "./ingesters.ts";
import { listLuts, lutPath } from "./lut.ts";
import { startMcpServer } from "./mcp-server.ts";
import {
  buildPackageArgv,
  checkPackagePreflight,
  listPackagePasses,
  resolveCliPath,
  resolveHyperframesCli,
  resolvePackagePass,
} from "./package-pass.ts";
import { projectPaths } from "./paths.ts";
import { PRODUCT_ANNOUNCEMENT_CATALOG } from "./product-announcement.ts";
import {
  latestProject,
  listHistorySnapshotRevisions,
  listProjects,
  mutateProject,
  loadProject as storeLoadProject,
} from "./projectStore.ts";
import { expandWordTokens } from "./query.ts";
import { placeFromPhrase } from "./reanchor.ts";
import {
  actionManifest,
  actionTable,
  runAction,
  type Surface,
} from "./registry.ts";
import { type RevertTarget, revertProject } from "./revert.ts";
import { analyzeSceneLog } from "./scene-log.ts";
import {
  applyProjectTemplate,
  listTemplates,
  loadTemplateSkill,
} from "./templates.ts";
import { verifyCut, verifyVerdict } from "./verify.ts";

const [cmd, ...rest] = process.argv.slice(2);

function help(): void {
  console.log(`OpenKlip - agent-native video editing on plain files

Discovery
  openklip list                      list projects (most recent first)
  openklip assets <slug>             list registered media assets

Setup
  openklip ingest <video>            transcribe + build a project
                                       --brand <name>  apply a brand preset
  openklip serve [slug]              open the local editor (default: latest)
  openklip asset-add <slug> <file>   register b-roll, music, or still (auto-detect)
                                       --kind broll|music|still
  openklip broll <slug> <file>       register b-roll video (alias for asset-add)

Transcript (read)
  openklip transcript <slug>         print every word with id, time, cut state
  openklip transcript grep <slug> "phrase" [--all] [--json]
                                     find phrase runs (word ids + seconds)
  openklip transcript span <slug> <w12|w12-w20> [--context N] [--json]
                                     slice words around ids
  openklip transcript phrase <slug> "phrase" [--json]
                                     first match span for overlay placement

Transcript edits
  openklip transcript <slug>         print every word with id, time, cut state
  openklip cut <slug> <tokens...>    mark words deleted; ids (w12) or ranges (w12-w20)
                                       --restore     restore the listed words instead
                                       --text "..."  cut the first run matching a phrase
                                       --all         with --text, cut every matching run
  openklip restore <slug>            restore every word (clear all cuts)
  openklip word-text <slug> <wordId> <text...>
                                     correct one word's transcript text
                                       (GUI bulk edits use edit-words instead)

Overlays
  openklip broll-add <slug> <assetId> <fromSec> <toSec>
                                     cover a source-time span with a registered asset
                                       --display cover|pip|split  (default cover)
                                       --audio-mode silent|broll|mix|duck-voice|duck-broll
  openklip broll-set <slug> <brollId>  patch b-roll (--asset --from --to --src-in
                                       --display cover|pip --audio-mode ...)
  openklip broll-rm <slug> <brollId> remove a b-roll clip
  openklip music-add <slug> <assetId> <fromSec> <toSec>
                                     place background music under the voice
                                       --gain <0-2>      (default 1)
                                       --fade-in <s>  --fade-out <s>  (0-10)
                                       --src-in <s>   --mode trim|loop
                                       --note <text>
  openklip music-set <slug> <musicId>  patch music (--asset --gain --fade-in
                                       --fade-out --from --to --src-in --mode
                                       --note)
  openklip music-rm <slug> <musicId> remove a music placement
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
  openklip still-add <slug> <assetId> <fromSec> <toSec>
                                     overlay a still image with a Ken Burns push-in
                                       --scale <1-3>  --focus-x <0-1>  --focus-y <0-1>
  openklip still-set <slug> <stillId> patch still (--asset --from --to --scale --focus-x --focus-y)
  openklip still-rm <slug> <stillId> remove a still overlay
  openklip graphic-add <slug> <template> <fromSec> <toSec>
                                     overlay an HTML/CSS graphic template
                                       --param key=value (repeatable)  --track broll|title|zoom
  openklip graphic-set <slug> <graphicId> patch graphic (--template --from --to --param --track)
  openklip graphic-rm <slug> <graphicId> remove a graphic overlay
  openklip json-graphic-add <slug> product-announcement <fromSec> <toSec>
                                     overlay a validated json-render announcement spec
                                       --spec-file spec.json  --track broll|title|zoom
  openklip json-graphic-set <slug> <graphicId>
                                     patch a json-render graphic (--from --to --spec-file --track)
  openklip title-add-phrase <slug> "spoken phrase" "title text"
                                     place title at first phrase match
                                       --position lower|center|hero
  openklip zoom-add-phrase <slug> "spoken phrase"
                                     push-in zoom at first phrase match
                                       --scale <1-3>  --ramp <sec>
  openklip broll-add-phrase <slug> <assetId> "spoken phrase"
                                     b-roll cover at first phrase match
  openklip reanchor <slug> [overlayId] re-resolve phrase-anchored overlays after a re-cut
  openklip reorder <slug> <broll|title|zoom> <id> <toIndex>
                                     restack an overlay (paint order)

Look & captions
  openklip captions <slug> <on|off>    toggle burned captions for export
  openklip captions-max <slug> <n>       words per caption line (1-12)
  openklip captions-style <slug> <style> caption look preset (boxed|clean|karaoke|bold-caps|minimal)
  openklip look <slug> vignette <on|off> toggle vignette
  openklip look <slug> color [--temp n] [--tint n] [--bright n] [--contrast n] [--sat n] | --reset
  openklip audio <slug>                  print current export audio quality settings
  openklip audio <slug> [--duck on|off] [--duck-amount <1-30 dB>]
                        [--duck-attack <1-500 ms>] [--duck-release <20-2000 ms>]
                        [--loudness on|off] [--loudness-target <-30..-10 LUFS>]
                        [--highpass on|off] [--highpass-hz <40-200>]
  openklip pad <slug> <ms>               cut boundary padding (0-500 ms)
  openklip brand <slug> <name>           apply a brand preset (look defaults)
  openklip template list                 list edit templates (templates/*/skill.md)
  openklip template show <id>            print a template skill file
  openklip template set <slug> <id>      attach a template to a project
  openklip brief <slug>                  print the project brief (brief.md)
  openklip brief <slug> --set <text...>  replace the brief with the given text
  openklip brief <slug> --file <path>    replace the brief with a file's content
                                       (empty text clears the brief)

Multi-take assembly
  openklip take-add <slug> <video>   ingest an alternate take into takes/<id>/
                                       --id <takeId>   --label <text>
  openklip takes <slug>              list ingested takes (id, duration, words)
  openklip assemble <slug> <takeId:wStart-wEnd> [more...]
                                     splice chosen take runs into a new source
                                       --pad <ms>   seam pad (0-500, default 50)
                                       --force      overwrite an existing edit
                                     add a per-segment "why" note via the agent tool

Review & export
  openklip status <slug>             summarize the current edit
                                       --json            agent-friendly JSON
  openklip ranges <slug> [--json]    kept source-time segments after cuts
  openklip overlays <slug> [--json]  b-roll, music, titles, zooms, stills with ids
  openklip cleanup <slug> [--json]   filler-word and dead-air candidates (safe/review)
                                       --apply-safe      apply the safe candidates and print what changed
  openklip dead-air-rm <slug> <id>   remove a registered dead-air span by id
  openklip export <slug>             render the current cut to out.mp4
                                       --height <px>  max output height (e.g. 1080)
                                       --fps <n>      output frame rate, integer 1-120 (default: source)
                                       --compression <preset>  studio|social|web|web-low
                                       --platform <id>  destination preset (youtube|youtube-4k|x|linkedin); fills gaps only, explicit flags win
  openklip revert <slug> --to <rev>  restore an earlier logged revision
  openklip revert <slug> --task <id> revert every change made by one agent task
  openklip revert <slug> --last      undo the most recent logged edit
                                       --force   proceed even if a later, unrelated edit is discarded
  openklip history <slug>            action history log (newest first) and revertible revisions
                                       --limit <n>       max entries (default 50, max 200)
                                       --task <id>       only entries from one agent task
                                       --action <name>   only entries with this action name
  openklip tasks <slug>              agent task records (newest first)
                                       --limit <n>       max tasks (default 20, max 100)
                                       --status <status> pending|running|blocked|failed|completed|cancelled

Diagnostics
  openklip doctor [slug]             check ffmpeg, whisper, and project health
  openklip actions                   project.json mutation registry only
                                       --json            machine-readable manifest
                                       --surface mcp     filter by cli|gui|mcp
  openklip tools                     unified agent tool manifest (query + mutate + export)
                                       --json            machine-readable manifest
                                       --surface mcp     filter by cli|gui|mcp
  openklip mcp                       start the MCP stdio server (Cursor, Claude Desktop, …)

Post-export (optional, external)
  openklip package <slug> <pass>     run a HyperFrames finishing pass on out.mp4
                                       passes: remove-background, transcribe
                                       requires the HyperFrames CLI (bun add -d hyperframes)
`);
}

// Load + validate a project.json by slug. The file IS the edit, so this is the
// same document the GUI reads/writes.
async function loadProject(slug: string): Promise<Project> {
  const p = projectPaths(slug);
  return ProjectSchema.parse(JSON.parse(await Bun.file(p.project).text()));
}

// Best-effort VAD silences for a project's ranges/status output: only worth
// loading when the project actually snaps to VAD, and a missing/failed
// analysis must never break `ranges`/`status` (mirrors the exporter's own
// fallback). Keeps CLI output in lockstep with export truth without paying
// the analysis cost for projects that don't use snap.
async function loadSilencesForCli(
  project: Project
): Promise<SilenceSpan[] | undefined> {
  if (!(project.cuts?.snap?.enabled && project.cuts.snap.mode === "vad")) {
    return;
  }
  return await loadAudioAnalysis(project.slug)
    .then((a) => a.silences)
    .catch(() => undefined);
}

// Run a registry action through the shared store: the mutation happens inside
// the per-slug lock, bumps the project revision, and appends one entry to
// working/actions.jsonl with actor "cli". Returns the action result plus the
// mutated project so commands can print state-derived output (e.g. padMs).
async function runLoggedAction<T = unknown>(
  slug: string,
  name: string,
  input: unknown
): Promise<{ project: Project; result: T }> {
  let mutated: Project | undefined;
  const result = await mutateProject(
    slug,
    (project) => {
      mutated = project;
      return runAction(name, project, input) as T;
    },
    { action: name, actor: "cli", input }
  );
  return { project: mutated as Project, result };
}

interface DeadAirAddSpan {
  fromSec: number;
  toSec: number;
}

const DEAD_AIR_ADD_BATCH_SIZE = 50;

async function addDeadAirSpansInBatches(
  slug: string,
  spans: DeadAirAddSpan[]
): Promise<void> {
  for (let i = 0; i < spans.length; i += DEAD_AIR_ADD_BATCH_SIZE) {
    await runLoggedAction(slug, "dead-air-add", {
      spans: spans.slice(i, i + DEAD_AIR_ADD_BATCH_SIZE),
    });
  }
}

function secRange(startSec: number, endSec: number): string {
  return `${startSec.toFixed(1)}s-${endSec.toFixed(1)}s`;
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

function parseBrollDisplayFlag(
  raw: string | undefined
): BrollDisplay | undefined {
  if (raw === undefined) {
    return;
  }
  if (raw === "cover" || raw === "pip" || raw === "split") {
    return raw;
  }
  throw new Error(
    `unknown b-roll display "${raw}" (expected one of: ${BROLL_DISPLAY_IDS.join(", ")})`
  );
}

function parseBrollAudioModeFlag(
  raw: string | undefined
): Broll["audioMode"] | undefined {
  if (raw === undefined) {
    return;
  }
  if ((BROLL_AUDIO_MODE_IDS as readonly string[]).includes(raw)) {
    return raw as Broll["audioMode"];
  }
  throw new Error(
    `unknown b-roll audio mode "${raw}" (expected one of: ${BROLL_AUDIO_MODE_IDS.join(", ")})`
  );
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

async function readJsonSpecFile(args: string[]): Promise<unknown> {
  const specFile = flagValue(args, "--spec-file");
  if (!specFile) {
    throw new Error("--spec-file is required");
  }
  try {
    return JSON.parse(await Bun.file(specFile).text());
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`could not read --spec-file ${specFile}: ${detail}`);
  }
}

// Collect repeated `--param key=value` flags into a params record for graphic
// overlays. Values stay strings (the Graphic params schema accepts string too).
function collectParams(args: string[]): Record<string, string> {
  const params: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--param") {
      continue;
    }
    const pair = args[i + 1];
    if (!pair) {
      throw new Error("--param expects key=value");
    }
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new Error(`--param must be key=value (got "${pair}")`);
    }
    params[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return params;
}

// Parse the optional --track flag for graphics (z-layer: broll|title|zoom).
function trackFlag(args: string[]): "broll" | "title" | "zoom" | undefined {
  const t = flagValue(args, "--track");
  if (t === undefined) {
    return;
  }
  if (t !== "broll" && t !== "title" && t !== "zoom") {
    throw new Error("--track must be broll, title, or zoom");
  }
  return t;
}

// Parse the optional --mode flag for music placements (trim|loop).
function musicModeFlag(args: string[]): "trim" | "loop" | undefined {
  const mode = flagValue(args, "--mode");
  if (mode === undefined) {
    return;
  }
  if (mode !== "trim" && mode !== "loop") {
    throw new Error("--mode must be trim or loop");
  }
  return mode;
}

// Expand cut tokens (word ids "w12" and inclusive ranges "w12-w20") into the
// concrete list of word ids present on the project, preserving project order.
function resolveCutIds(project: Project, tokens: string[]): string[] {
  return expandWordTokens(project, tokens);
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
        console.log(
          "no assets registered. Run: openklip asset-add <slug> <file>"
        );
        break;
      }
      for (const a of project.assets) {
        const dur = samplesToSec(a.durationSamples).toFixed(1);
        const kind = (a.kind ?? "broll").padEnd(6);
        console.log(
          `${a.id.padEnd(16)}  ${kind}  ${`${dur}s`.padStart(7)}  ${a.name}`
        );
      }
      console.log(`\n${project.assets.length} asset(s)`);
      break;
    }
    case "analyze": {
      if (!rest[0]) {
        throw new Error("usage: openklip analyze <slug> [--agent <model>]");
      }
      const slug = rest[0];
      const agent = flagValue(rest, "--agent") ?? "claude-opus-4-8";
      console.log(`[analyze] reading media with ${agent}...`);
      const res = await analyzeAssets(
        slug,
        { agent },
        { loadProject: storeLoadProject, mutateProject }
      );
      let sceneLogged = false;
      const project = await storeLoadProject(slug);
      if (!project.sceneLog) {
        const log = await analyzeSceneLog(slug, project, { agent });
        if (log) {
          await mutateProject(slug, (proj) => {
            if (!proj.sceneLog) {
              proj.sceneLog = log;
            }
          });
          sceneLogged = true;
          console.log(
            `[analyze] scene log: ${log.segments.length} segment(s) on the main video`
          );
        }
      }
      if (res.total === 0 && !sceneLogged) {
        console.log(
          "[analyze] nothing to do (assets already described, scene log present or frames missing)."
        );
        break;
      }
      if (res.total > 0) {
        for (const a of res.analyzed) {
          console.log(`  ${a.id.padEnd(16)}  ${a.summary}`);
        }
        if (res.skipped.length > 0) {
          console.log(
            `[analyze] skipped (not described): ${res.skipped.join(", ")}`
          );
        }
        console.log(
          `[analyze] ${res.analyzed.length}/${res.total} asset(s) described.`
        );
      }
      break;
    }
    case "ingest": {
      if (!rest[0]) {
        throw new Error(
          "usage: openklip ingest <video> [--brand <name>] [--force]"
        );
      }
      const brandName = flagValue(rest, "--brand");
      const force = rest.includes("--force");
      const videoArg = rest.filter(
        (a) => a !== "--brand" && a !== brandName && a !== "--force"
      )[0];
      if (!videoArg) {
        throw new Error(
          "usage: openklip ingest <video> [--brand <name>] [--force]"
        );
      }
      const ingestedSlug = await ingest(videoArg, { force });
      if (brandName) {
        // Only the brand application is a logged mutation; project creation
        // above (ingest) is not a registry-style edit.
        const brand = await loadBrand(brandName);
        await mutateProject(
          ingestedSlug,
          (project) => {
            applyBrand(project, brand);
          },
          { action: "brand", actor: "cli", input: { name: brandName } }
        );
        console.log(`[ingest] applied brand "${brandName}"`);
      }
      break;
    }
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
      // Surface a broken ffmpeg / whisper / proxy before the editor opens, so a
      // failed edit loop isn't the first signal something is wrong.
      const health = await runDoctor(slug);
      for (const c of health.checks.filter((x) => x.status !== "ok")) {
        const sigil = c.status === "fail" ? "✗" : "!";
        console.log(`[serve] ${sigil} ${c.name}: ${c.detail}`);
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
    case "asset-add":
    case "asset": {
      if (!(rest[0] && rest[1])) {
        throw new Error(
          "usage: openklip asset-add <slug> <file> [--kind broll|music|still]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(1);
      const kindIdx = args.indexOf("--kind");
      let fileArg: string;
      let kind: "broll" | "music" | "still" | undefined;
      if (kindIdx === -1) {
        fileArg = args.join(" ");
      } else {
        const k = args[kindIdx + 1];
        if (k !== "broll" && k !== "music" && k !== "still") {
          throw new Error("--kind must be broll, music, or still");
        }
        kind = k;
        fileArg = args
          .filter((_, i) => i !== kindIdx && i !== kindIdx + 1)
          .join(" ");
      }
      if (!fileArg) {
        throw new Error(
          "usage: openklip asset-add <slug> <file> [--kind broll|music|still]"
        );
      }
      const asset = await registerAsset(slug, fileArg, kind, "cli");
      console.log(
        `registered ${asset.kind} "${asset.id}" (${asset.name}, ${samplesToSec(asset.durationSamples).toFixed(1)}s)`
      );
      break;
    }
    case "broll": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip broll <slug> <file>");
      }
      await registerAsset(rest[0], rest[1], "broll", "cli");
      break;
    }
    case "transcript": {
      const sub = rest[0];
      if (sub === "grep" || sub === "span" || sub === "phrase") {
        const slug = rest[1];
        if (!slug) {
          throw new Error(
            `usage: openklip transcript ${sub} <slug> ... (see openklip help)`
          );
        }
        const project = await loadProject(slug);
        const tail = rest.slice(2);
        if (sub === "grep") {
          const phraseParts: string[] = [];
          for (const arg of tail) {
            if (arg === "--all" || arg === "--json") {
              continue;
            }
            phraseParts.push(arg);
          }
          const phrase = phraseParts.join(" ");
          if (!phrase) {
            throw new Error(
              'usage: openklip transcript grep <slug> "phrase" [--all] [--json]'
            );
          }
          process.stdout.write(
            runTranscriptGrep(project, phrase, {
              all: tail.includes("--all"),
              json: tail.includes("--json"),
            })
          );
          break;
        }
        if (sub === "span") {
          const token = tail.find((a) => !a.startsWith("--"));
          if (!token) {
            throw new Error(
              "usage: openklip transcript span <slug> <w12|w12-w20> [--context N] [--json]"
            );
          }
          const ctxRaw = flagValue(tail, "--context");
          const context = ctxRaw === undefined ? undefined : Number(ctxRaw);
          if (context !== undefined && !Number.isFinite(context)) {
            throw new Error("--context must be a non-negative number");
          }
          process.stdout.write(
            runTranscriptSpan(project, token, {
              context,
              json: tail.includes("--json"),
            })
          );
          break;
        }
        const phraseParts: string[] = [];
        for (const arg of tail) {
          if (arg === "--json") {
            continue;
          }
          phraseParts.push(arg);
        }
        const phrase = phraseParts.join(" ");
        if (!phrase) {
          throw new Error(
            'usage: openklip transcript phrase <slug> "phrase" [--json]'
          );
        }
        process.stdout.write(
          runTranscriptPhrase(project, phrase, {
            json: tail.includes("--json"),
          })
        );
        break;
      }
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
      // F1: optional human rationale recorded on the cut words.
      const note = flagValue(args, "--note");

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
          const { result } = await runLoggedAction<{
            matches: number;
            ids: string[];
          }>(slug, "cut-text", { phrase, all: true, note });
          if (result.matches === 0) {
            console.log(`no contiguous runs matched: "${phrase}"`);
            break;
          }
          console.log(
            `cut ${result.matches} run(s), ${result.ids.length} words: ${result.ids.join(", ")}`
          );
          break;
        }
        const { result } = await runLoggedAction<{
          matched: boolean;
          ids: string[];
        }>(slug, "cut-text", { phrase, all: false, note });
        if (!result.matched) {
          console.log(`no contiguous run of words matched: "${phrase}"`);
          break;
        }
        console.log(`cut ${result.ids.length} words: ${result.ids.join(", ")}`);
        break;
      }

      // Keep word tokens only: drop the boolean flags and the --note value pair.
      const noteIdx = args.indexOf("--note");
      const tokens = args.filter(
        (a, i) =>
          a !== "--restore" &&
          a !== "--all" &&
          a !== "--note" &&
          !(noteIdx !== -1 && i === noteIdx + 1)
      );
      if (tokens.length === 0) {
        throw new Error(
          "usage: openklip cut <slug> <w12> <w15-w20> [--restore] [--note <why>]"
        );
      }
      // Read-only load to expand word tokens, then the logged mutation.
      const project = await loadProject(slug);
      const ids = resolveCutIds(project, tokens);
      await runLoggedAction(slug, "cut", { ids, deleted: !restore, note });
      console.log(
        `${restore ? "restored" : "cut"} ${ids.length} words: ${ids.join(", ")}`
      );
      break;
    }
    case "restore": {
      if (!rest[0]) {
        throw new Error("usage: openklip restore <slug>");
      }
      await runLoggedAction(rest[0], "restore-all", {});
      console.log("restored all words");
      break;
    }
    case "word-text": {
      if (!(rest[0] && rest[1] && rest.length > 2)) {
        throw new Error("usage: openklip word-text <slug> <wordId> <text...>");
      }
      const slug = rest[0];
      const id = rest[1];
      const text = rest.slice(2).join(" ");
      const { result } = await runLoggedAction<{
        id: string;
        text: string;
        originalText?: string;
      }>(slug, "word-text", { id, text });
      console.log(`word ${result.id}: "${result.text}"`);
      break;
    }
    case "broll-add": {
      if (!(rest[0] && rest[1] && rest[2] && rest[3])) {
        throw new Error(
          "usage: openklip broll-add <slug> <assetId> <fromSec> <toSec> [--display cover|pip] [--audio-mode silent|broll|mix|duck-voice|duck-broll]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(4);
      const fromSec = Number(rest[2]);
      const toSec = Number(rest[3]);
      if (!(Number.isFinite(fromSec) && Number.isFinite(toSec))) {
        throw new Error("fromSec and toSec must be numbers (seconds)");
      }
      const display = parseBrollDisplayFlag(flagValue(args, "--display"));
      const audioMode = parseBrollAudioModeFlag(
        flagValue(args, "--audio-mode")
      );
      const { result: item } = await runLoggedAction<Broll>(slug, "broll-add", {
        assetId: rest[1],
        fromSec,
        toSec,
        ...(display === undefined ? {} : { display }),
        ...(audioMode === undefined ? {} : { audioMode }),
      });
      const modeNote = item.display === "pip" ? ", pip inset" : "";
      const audioNote =
        item.audioMode && item.audioMode !== "silent"
          ? `, audio ${item.audioMode}`
          : "";
      console.log(
        `added b-roll ${item.id} (asset "${item.assetId}", ${fromSec}s-${toSec}s${modeNote}${audioNote})`
      );
      break;
    }
    case "broll-rm": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip broll-rm <slug> <brollId>");
      }
      const { result } = await runLoggedAction<{ removed: boolean }>(
        rest[0],
        "broll-rm",
        { id: rest[1] }
      );
      if (!result.removed) {
        console.log(`no b-roll clip with id "${rest[1]}"`);
        break;
      }
      console.log(`removed b-roll ${rest[1]}`);
      break;
    }
    case "broll-set": {
      if (!(rest[0] && rest[1])) {
        throw new Error(
          "usage: openklip broll-set <slug> <brollId> [--asset id] [--from N] [--to N] [--src-in N] [--display cover|pip] [--audio-mode silent|broll|mix|duck-voice|duck-broll]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(2);
      const display = parseBrollDisplayFlag(flagValue(args, "--display"));
      const audioMode = parseBrollAudioModeFlag(
        flagValue(args, "--audio-mode")
      );
      const { result: item } = await runLoggedAction<Broll>(slug, "broll-set", {
        id: rest[1],
        assetId: flagValue(args, "--asset"),
        fromSec: flagNumber(args, "--from"),
        toSec: flagNumber(args, "--to"),
        srcInSec: flagNumber(args, "--src-in"),
        ...(display === undefined ? {} : { display }),
        ...(audioMode === undefined ? {} : { audioMode }),
      });
      console.log(
        `updated b-roll ${item.id} (asset "${item.assetId}", ${secSpan(item.startSample, item.endSample)})`
      );
      break;
    }
    case "music-add": {
      if (!(rest[0] && rest[1] && rest[2] && rest[3])) {
        throw new Error(
          "usage: openklip music-add <slug> <assetId> <fromSec> <toSec> [--gain N] [--fade-in s] [--fade-out s] [--src-in s] [--mode trim|loop] [--note text]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(4);
      const fromSec = Number(rest[2]);
      const toSec = Number(rest[3]);
      if (!(Number.isFinite(fromSec) && Number.isFinite(toSec))) {
        throw new Error("fromSec and toSec must be numbers (seconds)");
      }
      const { result: item } = await runLoggedAction<MusicPlacement>(
        slug,
        "music-add",
        {
          assetId: rest[1],
          fromSec,
          toSec,
          gain: flagNumber(args, "--gain"),
          fadeInSec: flagNumber(args, "--fade-in"),
          fadeOutSec: flagNumber(args, "--fade-out"),
          srcInSec: flagNumber(args, "--src-in"),
          mode: musicModeFlag(args),
          note: flagValue(args, "--note"),
        }
      );
      console.log(
        `added music ${item.id} (asset "${item.assetId}", ${secSpan(item.startSample, item.endSample)}, gain ${item.gain}, ${item.mode})`
      );
      break;
    }
    case "music-set": {
      if (!(rest[0] && rest[1])) {
        throw new Error(
          "usage: openklip music-set <slug> <musicId> [--asset id] [--gain N] [--fade-in s] [--fade-out s] [--from N] [--to N] [--src-in s] [--mode trim|loop] [--note text]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(2);
      const { result: item } = await runLoggedAction<MusicPlacement>(
        slug,
        "music-set",
        {
          id: rest[1],
          assetId: flagValue(args, "--asset"),
          fromSec: flagNumber(args, "--from"),
          toSec: flagNumber(args, "--to"),
          gain: flagNumber(args, "--gain"),
          fadeInSec: flagNumber(args, "--fade-in"),
          fadeOutSec: flagNumber(args, "--fade-out"),
          srcInSec: flagNumber(args, "--src-in"),
          mode: musicModeFlag(args),
          note: flagValue(args, "--note"),
        }
      );
      console.log(
        `updated music ${item.id} (asset "${item.assetId}", ${secSpan(item.startSample, item.endSample)}, gain ${item.gain}, ${item.mode})`
      );
      break;
    }
    case "music-rm": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip music-rm <slug> <musicId>");
      }
      const { result } = await runLoggedAction<{ removed: boolean }>(
        rest[0],
        "music-rm",
        { id: rest[1] }
      );
      if (!result.removed) {
        console.log(`no music placement with id "${rest[1]}"`);
        break;
      }
      console.log(`removed music ${rest[1]}`);
      break;
    }
    case "still-add": {
      if (!(rest[0] && rest[1] && rest[2] && rest[3])) {
        throw new Error(
          "usage: openklip still-add <slug> <assetId> <fromSec> <toSec> [--scale N] [--focus-x N] [--focus-y N]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(1);
      const fromSec = Number(rest[2]);
      const toSec = Number(rest[3]);
      if (!(Number.isFinite(fromSec) && Number.isFinite(toSec))) {
        throw new Error("fromSec and toSec must be numbers (seconds)");
      }
      const { result: item } = await runLoggedAction<Still>(slug, "still-add", {
        assetId: rest[1],
        fromSec,
        toSec,
        scale: flagNumber(args, "--scale"),
        focusX: flagNumber(args, "--focus-x"),
        focusY: flagNumber(args, "--focus-y"),
      });
      console.log(
        `added still ${item.id} (asset "${item.assetId}", ${fromSec}s-${toSec}s, ${item.scale}x focus ${item.focusX},${item.focusY})`
      );
      break;
    }
    case "still-set": {
      if (!(rest[0] && rest[1])) {
        throw new Error(
          "usage: openklip still-set <slug> <stillId> [--asset id] [--from N] [--to N] [--scale N] [--focus-x N] [--focus-y N]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(2);
      const { result: item } = await runLoggedAction<Still>(slug, "still-set", {
        id: rest[1],
        assetId: flagValue(args, "--asset"),
        fromSec: flagNumber(args, "--from"),
        toSec: flagNumber(args, "--to"),
        scale: flagNumber(args, "--scale"),
        focusX: flagNumber(args, "--focus-x"),
        focusY: flagNumber(args, "--focus-y"),
      });
      console.log(
        `updated still ${item.id} (asset "${item.assetId}", ${secSpan(item.startSample, item.endSample)}, ${item.scale}x)`
      );
      break;
    }
    case "still-rm": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip still-rm <slug> <stillId>");
      }
      const { result } = await runLoggedAction<{ removed: boolean }>(
        rest[0],
        "still-rm",
        { id: rest[1] }
      );
      if (!result.removed) {
        console.log(`no still overlay with id "${rest[1]}"`);
        break;
      }
      console.log(`removed still ${rest[1]}`);
      break;
    }
    case "graphic-add": {
      if (!(rest[0] && rest[1] && rest[2] && rest[3])) {
        throw new Error(
          "usage: openklip graphic-add <slug> <template> <fromSec> <toSec> [--param key=value ...] [--track broll|title|zoom]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(1);
      const fromSec = Number(rest[2]);
      const toSec = Number(rest[3]);
      if (!(Number.isFinite(fromSec) && Number.isFinite(toSec))) {
        throw new Error("fromSec and toSec must be numbers (seconds)");
      }
      const { result: item } = await runLoggedAction<Graphic>(
        slug,
        "graphic-add",
        {
          template: rest[1],
          fromSec,
          toSec,
          params: collectParams(args),
          track: trackFlag(args),
        }
      );
      console.log(
        `added graphic ${item.id} (template "${item.template}", ${fromSec}s-${toSec}s, ${item.track})`
      );
      break;
    }
    case "graphic-set": {
      if (!(rest[0] && rest[1])) {
        throw new Error(
          "usage: openklip graphic-set <slug> <graphicId> [--template id] [--from N] [--to N] [--param key=value ...] [--track broll|title|zoom]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(2);
      const params = collectParams(args);
      const { result: item } = await runLoggedAction<Graphic>(
        slug,
        "graphic-set",
        {
          id: rest[1],
          template: flagValue(args, "--template"),
          fromSec: flagNumber(args, "--from"),
          toSec: flagNumber(args, "--to"),
          params: Object.keys(params).length > 0 ? params : undefined,
          track: trackFlag(args),
        }
      );
      console.log(
        `updated graphic ${item.id} (template "${item.template}", ${secSpan(item.startSample, item.endSample)}, ${item.track})`
      );
      break;
    }
    case "json-graphic-add": {
      if (!(rest[0] && rest[1] && rest[2] && rest[3])) {
        throw new Error(
          "usage: openklip json-graphic-add <slug> product-announcement <fromSec> <toSec> --spec-file spec.json [--track broll|title|zoom]"
        );
      }
      const slug = rest[0];
      const catalog = rest[1];
      if (catalog !== PRODUCT_ANNOUNCEMENT_CATALOG) {
        throw new Error(
          `unknown json-render catalog "${catalog}". Available: ${PRODUCT_ANNOUNCEMENT_CATALOG}`
        );
      }
      const fromSec = Number(rest[2]);
      const toSec = Number(rest[3]);
      if (!(Number.isFinite(fromSec) && Number.isFinite(toSec))) {
        throw new Error("fromSec and toSec must be numbers (seconds)");
      }
      const { result: item } = await runLoggedAction<Graphic>(
        slug,
        "json-graphic-add",
        {
          catalog,
          fromSec,
          toSec,
          spec: await readJsonSpecFile(rest),
          track: trackFlag(rest),
        }
      );
      console.log(
        `added JSON graphic ${item.id} (catalog "${item.catalog}", ${fromSec}s-${toSec}s, ${item.track})`
      );
      break;
    }
    case "json-graphic-set": {
      if (!(rest[0] && rest[1])) {
        throw new Error(
          "usage: openklip json-graphic-set <slug> <graphicId> [--from N] [--to N] [--spec-file spec.json] [--track broll|title|zoom]"
        );
      }
      const slug = rest[0];
      const args = rest.slice(2);
      const spec = args.includes("--spec-file")
        ? await readJsonSpecFile(args)
        : undefined;
      const { result: item } = await runLoggedAction<Graphic>(
        slug,
        "json-graphic-set",
        {
          id: rest[1],
          fromSec: flagNumber(args, "--from"),
          toSec: flagNumber(args, "--to"),
          spec,
          track: trackFlag(args),
        }
      );
      console.log(
        `updated JSON graphic ${item.id} (catalog "${item.catalog}", ${secSpan(item.startSample, item.endSample)}, ${item.track})`
      );
      break;
    }
    case "graphic-rm": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip graphic-rm <slug> <graphicId>");
      }
      const { result } = await runLoggedAction<{ removed: boolean }>(
        rest[0],
        "graphic-rm",
        { id: rest[1] }
      );
      if (!result.removed) {
        console.log(`no graphic overlay with id "${rest[1]}"`);
        break;
      }
      console.log(`removed graphic ${rest[1]}`);
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
      const { result: item } = await runLoggedAction<Title>(slug, "title-add", {
        fromSec,
        toSec,
        text,
        position,
      });
      console.log(
        `added title ${item.id} (${fromSec}s-${toSec}s, ${position}): "${item.text}"`
      );
      break;
    }
    case "title-rm": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip title-rm <slug> <titleId>");
      }
      const { result } = await runLoggedAction<{ removed: boolean }>(
        rest[0],
        "title-rm",
        { id: rest[1] }
      );
      if (!result.removed) {
        console.log(`no title card with id "${rest[1]}"`);
        break;
      }
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
      const { result: item } = await runLoggedAction<Title>(slug, "title-set", {
        id: rest[1],
        text: textRaw?.replace(/\\n/g, "\n"),
        position: pos,
        fromSec: flagNumber(args, "--from"),
        toSec: flagNumber(args, "--to"),
      });
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
      const { result: item } = await runLoggedAction<Zoom>(slug, "zoom-add", {
        fromSec,
        toSec,
        scale,
        rampSec,
      });
      console.log(
        `added zoom ${item.id} (${fromSec}s-${toSec}s, ${item.scale}x, ramp ${item.rampSec}s)`
      );
      break;
    }
    case "zoom-rm": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip zoom-rm <slug> <zoomId>");
      }
      const { result } = await runLoggedAction<{ removed: boolean }>(
        rest[0],
        "zoom-rm",
        { id: rest[1] }
      );
      if (!result.removed) {
        console.log(`no zoom with id "${rest[1]}"`);
        break;
      }
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
      const { result: item } = await runLoggedAction<Zoom>(slug, "zoom-set", {
        id: rest[1],
        scale: flagNumber(args, "--scale"),
        rampSec: flagNumber(args, "--ramp"),
        fromSec: flagNumber(args, "--from"),
        toSec: flagNumber(args, "--to"),
      });
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
      await runLoggedAction(rest[0], "captions", { enabled });
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
      const { project } = await runLoggedAction(rest[0], "captions-max", {
        maxWords: n,
      });
      console.log(`captions max words: ${project.captions.maxWords}`);
      break;
    }
    case "captions-style": {
      const validIds = listCaptionStyles()
        .map((s) => s.id)
        .join(", ");
      const usage = `usage: openklip captions-style <slug> <style>\nvalid styles: ${validIds}`;
      if (!(rest[0] && rest[1])) {
        throw new Error(usage);
      }
      if (!isCaptionStyleId(rest[1])) {
        throw new Error(`unknown style "${rest[1]}"\n${usage}`);
      }
      const { project } = await runLoggedAction(rest[0], "captions-style", {
        style: rest[1],
      });
      console.log(`captions style: ${project.captions.style}`);
      break;
    }
    case "look": {
      const filterUsage = `openklip look <slug> filter <${FILTER_NAMES.join("|")}>`;
      if (!(rest[0] && rest[1] && rest[2])) {
        throw new Error(
          `usage: openklip look <slug> vignette <on|off>\n       ${filterUsage}\n       openklip look <slug> lut <name|none>`
        );
      }
      if (rest[1] === "filter") {
        if (!isFilter(rest[2])) {
          throw new Error(`usage: ${filterUsage}`);
        }
        const { project } = await runLoggedAction(rest[0], "look-filter", {
          filter: rest[2],
        });
        console.log(`filter: ${project.look.filter}`);
        break;
      }
      if (rest[1] === "lut") {
        const clearing = rest[2] === "none" || rest[2] === "off";
        if (!(clearing || existsSync(lutPath(rest[2])))) {
          const have = listLuts();
          const hint = have.length
            ? `available: ${have.join(", ")}`
            : "no LUTs in luts/ (drop a name.cube there)";
          throw new Error(`LUT not found: ${rest[2]} (${hint})`);
        }
        const { project } = await runLoggedAction(rest[0], "look-lut", {
          lut: clearing ? "" : rest[2],
        });
        console.log(`lut: ${project.look.lut ?? "none"}`);
        break;
      }
      if (rest[1] === "color") {
        const colorNum = (...flags: string[]) => {
          for (const flag of flags) {
            const v = flagValue(rest, flag);
            if (v === undefined) {
              continue;
            }
            const n = Number(v);
            if (!Number.isFinite(n)) {
              throw new Error(`${flag} must be a number`);
            }
            return n;
          }
          return;
        };
        const input: Record<string, number | boolean> = {};
        if (rest.includes("--reset")) {
          input.reset = true;
        } else {
          const temperature = colorNum("--temp", "--temperature");
          const tint = colorNum("--tint");
          const brightness = colorNum("--bright", "--brightness");
          const contrast = colorNum("--contrast");
          const saturation = colorNum("--sat", "--saturation");
          if (temperature !== undefined) {
            input.temperature = temperature;
          }
          if (tint !== undefined) {
            input.tint = tint;
          }
          if (brightness !== undefined) {
            input.brightness = brightness;
          }
          if (contrast !== undefined) {
            input.contrast = contrast;
          }
          if (saturation !== undefined) {
            input.saturation = saturation;
          }
          if (Object.keys(input).length === 0) {
            throw new Error(
              "usage: openklip look <slug> color [--temp n] [--tint n] [--bright n] [--contrast n] [--sat n] | --reset"
            );
          }
        }
        const { project } = await runLoggedAction(rest[0], "look-color", input);
        console.log(`color: ${colorAdjustSummary(project.look.color)}`);
        break;
      }
      if (rest[1] !== "vignette") {
        throw new Error(
          `usage: openklip look <slug> vignette <on|off>\n       ${filterUsage}\n       openklip look <slug> lut <name|none>\n       openklip look <slug> color [--temp n] [--tint n] [--bright n] [--contrast n] [--sat n] | --reset`
        );
      }
      const vignette = parseOnOff(rest[2], "openklip look <slug> vignette");
      await runLoggedAction(rest[0], "look-vignette", { vignette });
      console.log(`vignette ${vignette ? "on" : "off"}`);
      break;
    }
    case "motion": {
      if (!rest[0]) {
        throw new Error(
          "usage: openklip motion <slug> [--speed n] [--fade ms] [--hero-fade ms] [--slide frac]"
        );
      }
      const slug = rest[0];
      const num = (flag: string) => {
        const v = flagValue(rest, flag);
        if (v === undefined) {
          return;
        }
        const n = Number(v);
        if (!Number.isFinite(n)) {
          throw new Error(`${flag} must be a number`);
        }
        return n;
      };
      const input: Record<string, number> = {};
      const speed = num("--speed");
      const fadeMs = num("--fade");
      const heroFadeMs = num("--hero-fade");
      const slideFrac = num("--slide");
      if (speed !== undefined) {
        input.speed = speed;
      }
      if (fadeMs !== undefined) {
        input.fadeMs = fadeMs;
      }
      if (heroFadeMs !== undefined) {
        input.heroFadeMs = heroFadeMs;
      }
      if (slideFrac !== undefined) {
        input.slideFrac = slideFrac;
      }
      const { project } = await runLoggedAction(slug, "motion", input);
      const m = project.motion;
      console.log(
        `motion: speed ${m.speed}, fade ${m.fadeMs}ms, hero ${m.heroFadeMs}ms, slide ${m.slideFrac}`
      );
      break;
    }
    case "audio": {
      if (!rest[0]) {
        throw new Error(
          "usage: openklip audio <slug> [--duck on|off] [--duck-amount <db>] [--duck-attack <ms>] [--duck-release <ms>] [--loudness on|off] [--loudness-target <lufs>] [--highpass on|off] [--highpass-hz <n>]"
        );
      }
      const slug = rest[0];
      const duck = flagValue(rest, "--duck");
      const duckAmount = flagNumber(rest, "--duck-amount");
      const duckAttack = flagNumber(rest, "--duck-attack");
      const duckRelease = flagNumber(rest, "--duck-release");
      const loudness = flagValue(rest, "--loudness");
      const loudnessTarget = flagNumber(rest, "--loudness-target");
      const highpass = flagValue(rest, "--highpass");
      const highpassHz = flagNumber(rest, "--highpass-hz");

      const input: {
        ducking?: {
          enabled?: boolean;
          amountDb?: number;
          attackMs?: number;
          releaseMs?: number;
        };
        loudness?: { enabled?: boolean; targetLufs?: number };
        voiceHighpass?: { enabled?: boolean; hz?: number };
      } = {};
      if (
        duck !== undefined ||
        duckAmount !== undefined ||
        duckAttack !== undefined ||
        duckRelease !== undefined
      ) {
        input.ducking = {};
        if (duck !== undefined) {
          input.ducking.enabled = parseOnOff(
            duck,
            "openklip audio <slug> --duck"
          );
        }
        if (duckAmount !== undefined) {
          input.ducking.amountDb = duckAmount;
        }
        if (duckAttack !== undefined) {
          input.ducking.attackMs = duckAttack;
        }
        if (duckRelease !== undefined) {
          input.ducking.releaseMs = duckRelease;
        }
      }
      if (loudness !== undefined || loudnessTarget !== undefined) {
        input.loudness = {};
        if (loudness !== undefined) {
          input.loudness.enabled = parseOnOff(
            loudness,
            "openklip audio <slug> --loudness"
          );
        }
        if (loudnessTarget !== undefined) {
          input.loudness.targetLufs = loudnessTarget;
        }
      }
      if (highpass !== undefined || highpassHz !== undefined) {
        input.voiceHighpass = {};
        if (highpass !== undefined) {
          input.voiceHighpass.enabled = parseOnOff(
            highpass,
            "openklip audio <slug> --highpass"
          );
        }
        if (highpassHz !== undefined) {
          input.voiceHighpass.hz = highpassHz;
        }
      }

      const project =
        Object.keys(input).length === 0
          ? await loadProject(slug)
          : (await runLoggedAction(slug, "audio", input)).project;
      const a = project.audio;
      console.log(
        `audio: duck ${a.ducking.enabled ? "on" : "off"} (${a.ducking.amountDb}dB, attack ${a.ducking.attackMs}ms, release ${a.ducking.releaseMs}ms), loudness ${a.loudness.enabled ? "on" : "off"} (${a.loudness.targetLufs} LUFS), highpass ${a.voiceHighpass.enabled ? "on" : "off"} (${a.voiceHighpass.hz}Hz)`
      );
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
      const { project } = await runLoggedAction(rest[0], "pad", { padMs: ms });
      console.log(`pad: ${project.padMs}ms`);
      break;
    }
    case "status": {
      if (!rest[0]) {
        throw new Error("usage: openklip status <slug> [--json]");
      }
      const project = await loadProject(rest[0]);
      const silences = await loadSilencesForCli(project);
      if (rest.includes("--json")) {
        process.stdout.write(runStatusJson(project, silences));
        break;
      }
      const s = summarize(project, silences);
      console.log(`project: ${project.slug}`);
      if (project.template) {
        console.log(`  template:     ${project.template}`);
      }
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
        `  look:         vignette ${project.look?.vignette ? "on" : "off"}, filter ${project.look?.filter ?? "none"}${project.look?.lut ? `, lut ${project.look.lut}` : ""}${project.look?.color ? `, color ${colorAdjustSummary(project.look.color)}` : ""}`
      );
      console.log(
        `  motion:       speed ${project.motion.speed}, fade ${project.motion.fadeMs}ms`
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
    case "ranges": {
      if (!rest[0]) {
        throw new Error("usage: openklip ranges <slug> [--json]");
      }
      const project = await loadProject(rest[0]);
      const silences = await loadSilencesForCli(project);
      process.stdout.write(
        runRanges(project, { json: rest.includes("--json"), silences })
      );
      break;
    }
    case "overlays": {
      if (!rest[0]) {
        throw new Error("usage: openklip overlays <slug> [--json]");
      }
      const project = await loadProject(rest[0]);
      process.stdout.write(
        runOverlays(project, { json: rest.includes("--json") })
      );
      break;
    }
    case "cleanup": {
      if (!rest[0]) {
        throw new Error(
          "usage: openklip cleanup <slug> [--json] [--apply-safe]"
        );
      }
      const slug = rest[0];
      const project = await loadProject(slug);
      const silences = await loadAudioAnalysis(slug)
        .then((a) => a.silences)
        .catch(() => null);
      if (silences === null) {
        console.error(
          "warning: no audio analysis yet; dead-air candidates skipped (re-ingest or open the project once with analysis available)"
        );
      }
      const report = silences
        ? cleanupReport(project, silences)
        : fillerOnlyCleanupReport(project);

      if (rest.includes("--apply-safe")) {
        const { fillerIds, deadAirSpans } = partitionSafeCandidates(
          report.candidates
        );
        if (fillerIds.length === 0 && deadAirSpans.length === 0) {
          console.log("cleanup: no safe candidates to apply");
          break;
        }
        if (fillerIds.length > 0) {
          await runLoggedAction(slug, "cut", {
            ids: fillerIds,
            deleted: true,
            note: "cleanup: apply all safe",
          });
          console.log(`cleanup: cut ${fillerIds.length} filler word(s)`);
        }
        if (deadAirSpans.length > 0) {
          await addDeadAirSpansInBatches(slug, deadAirSpans);
          console.log(
            `cleanup: registered ${deadAirSpans.length} dead-air span(s)`
          );
        }
        break;
      }

      if (rest.includes("--json")) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        break;
      }

      console.log(
        `cleanup: ${report.fillerCount} filler, ${report.deadAirCount} dead-air, ~${report.estSavedSec.toFixed(1)}s total`
      );
      for (const warning of report.warnings) {
        console.log(`  warning: ${warning}`);
      }
      const filler = report.candidates.filter((c) => c.kind === "filler");
      const deadAir = report.candidates.filter((c) => c.kind === "dead-air");
      if (filler.length > 0) {
        console.log("  filler:");
        for (const c of filler) {
          console.log(
            `    ${c.id}  ${c.risk.padEnd(6)}  ${secRange(c.startSec, c.endSec)}  ~${c.estSavedSec.toFixed(1)}s  ${c.reason}  "${c.text}"`
          );
        }
      }
      if (deadAir.length > 0) {
        console.log("  dead-air:");
        for (const c of deadAir) {
          console.log(
            `    ${c.id}  ${c.risk.padEnd(6)}  ${secRange(c.startSec, c.endSec)}  ~${c.estSavedSec.toFixed(1)}s  ${c.reason}`
          );
        }
      }
      break;
    }
    case "dead-air-rm": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip dead-air-rm <slug> <id>");
      }
      const { result } = await runLoggedAction<{ removed: boolean }>(
        rest[0],
        "dead-air-rm",
        { id: rest[1] }
      );
      console.log(
        result.removed
          ? `dead-air-rm: removed ${rest[1]}`
          : `dead-air-rm: no span with id ${rest[1]}`
      );
      break;
    }
    case "title-add-phrase": {
      if (!rest[0]) {
        throw new Error(
          'usage: openklip title-add-phrase <slug> "spoken phrase" "title text" [--position lower|center|hero]'
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
      const positional = args.filter(
        (_, i) => posIdx === -1 || (i !== posIdx && i !== posIdx + 1)
      );
      if (positional.length < 2) {
        throw new Error(
          'usage: openklip title-add-phrase <slug> "spoken phrase" "title text" [--position lower|center|hero]'
        );
      }
      const spokenPhrase = positional[0];
      const text = positional.slice(1).join(" ").replace(/\\n/g, "\n");
      // Read-only load to resolve the phrase span, then the logged mutation.
      const project = await loadProject(slug);
      const span = placeFromPhrase(project, spokenPhrase);
      if (!span.matched) {
        throw new Error(`no match for spoken phrase: "${spokenPhrase}"`);
      }
      const { result: item } = await runLoggedAction<Title>(slug, "title-add", {
        fromSec: span.fromSec,
        toSec: span.toSec,
        text,
        position,
        anchor: { phrase: spokenPhrase, wordIds: span.ids, stale: false },
      });
      console.log(
        `added title ${item.id} at phrase "${spokenPhrase}" (${span.fromSec.toFixed(3)}s-${span.toSec.toFixed(3)}s, ${position}): "${item.text.replace(/\n/g, "\\n")}"`
      );
      break;
    }
    case "zoom-add-phrase": {
      if (!rest[0]) {
        throw new Error(
          'usage: openklip zoom-add-phrase <slug> "spoken phrase" [--scale N] [--ramp N]'
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
      const spokenParts: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (scaleIdx !== -1 && (i === scaleIdx || i === scaleIdx + 1)) {
          continue;
        }
        if (rampIdx !== -1 && (i === rampIdx || i === rampIdx + 1)) {
          continue;
        }
        spokenParts.push(args[i]);
      }
      const spokenPhrase = spokenParts.join(" ");
      if (!spokenPhrase) {
        throw new Error(
          'usage: openklip zoom-add-phrase <slug> "spoken phrase" [--scale N] [--ramp N]'
        );
      }
      // Read-only load to resolve the phrase span, then the logged mutation.
      const project = await loadProject(slug);
      const span = placeFromPhrase(project, spokenPhrase);
      if (!span.matched) {
        throw new Error(`no match for spoken phrase: "${spokenPhrase}"`);
      }
      const { result: item } = await runLoggedAction<Zoom>(slug, "zoom-add", {
        fromSec: span.fromSec,
        toSec: span.toSec,
        scale,
        rampSec,
        anchor: { phrase: spokenPhrase, wordIds: span.ids, stale: false },
      });
      console.log(
        `added zoom ${item.id} at phrase "${spokenPhrase}" (${span.fromSec.toFixed(3)}s-${span.toSec.toFixed(3)}s, ${item.scale}x)`
      );
      break;
    }
    case "broll-add-phrase": {
      if (!(rest[0] && rest[1])) {
        throw new Error(
          'usage: openklip broll-add-phrase <slug> <assetId> "spoken phrase"'
        );
      }
      const slug = rest[0];
      const assetId = rest[1];
      const spokenPhrase = rest.slice(2).join(" ");
      if (!spokenPhrase) {
        throw new Error(
          'usage: openklip broll-add-phrase <slug> <assetId> "spoken phrase"'
        );
      }
      // Read-only load to resolve the phrase span, then the logged mutation.
      const project = await loadProject(slug);
      const span = placeFromPhrase(project, spokenPhrase);
      if (!span.matched) {
        throw new Error(`no match for spoken phrase: "${spokenPhrase}"`);
      }
      const { result: item } = await runLoggedAction<Broll>(slug, "broll-add", {
        assetId,
        fromSec: span.fromSec,
        toSec: span.toSec,
        anchor: { phrase: spokenPhrase, wordIds: span.ids, stale: false },
      });
      console.log(
        `added b-roll ${item.id} at phrase "${spokenPhrase}" (asset "${assetId}", ${span.fromSec.toFixed(3)}s-${span.toSec.toFixed(3)}s)`
      );
      break;
    }
    case "export": {
      if (!rest[0]) {
        throw new Error(
          "usage: openklip export <slug> [--height <px>] [--fps <n>] [--compression <preset>] [--platform <id>] [--loudness <lufs>]"
        );
      }
      const heightIdx = rest.indexOf("--height");
      let maxHeight: number | undefined;
      if (heightIdx !== -1) {
        maxHeight = Number(rest[heightIdx + 1]);
        if (!Number.isFinite(maxHeight)) {
          throw new Error("--height must be a positive number");
        }
        // Same cap as the HTTP route, server action, and MCP tool (8K).
        if (maxHeight > 4320) {
          throw new Error("--height must be at most 4320 (8K)");
        }
      }
      const fpsRaw = flagValue(rest, "--fps");
      const fps = fpsRaw === undefined ? undefined : parseExportFpsFlag(fpsRaw);
      const compressionRaw = flagValue(rest, "--compression");
      let compression: ExportCompression | undefined;
      if (compressionRaw !== undefined) {
        if (
          !EXPORT_COMPRESSIONS.includes(compressionRaw as ExportCompression)
        ) {
          throw new Error(
            `unknown compression preset "${compressionRaw}" (expected one of: ${EXPORT_COMPRESSIONS.join(", ")})`
          );
        }
        compression = compressionRaw as ExportCompression;
      }
      // Guard against a trailing flag with no value: `flagValue` would
      // otherwise silently return undefined and export would proceed with no
      // preset applied.
      let platform: ExportPlatformId | undefined;
      if (rest.includes("--platform")) {
        const platformRaw = flagValue(rest, "--platform");
        if (platformRaw === undefined || !isExportPlatformId(platformRaw)) {
          throw new Error(
            `unknown export platform "${platformRaw ?? ""}" (expected one of: ${EXPORT_PLATFORM_IDS.join(", ")})`
          );
        }
        platform = platformRaw;
      }
      let loudnessTargetLufs: number | undefined;
      if (rest.includes("--loudness")) {
        const loudnessRaw = flagValue(rest, "--loudness");
        if (loudnessRaw === undefined) {
          throw new Error(
            "--loudness requires a value (a number between -30 and -10)"
          );
        }
        loudnessTargetLufs = parseExportLoudnessFlag(loudnessRaw);
      }
      const r = await exportCut(rest[0], {
        compression,
        fps,
        loudnessTargetLufs,
        maxHeight,
        platform,
      });
      const platformNote = r.platform ? `, platform ${r.platform}` : "";
      const loudnessNote =
        r.loudnessTargetLufs === undefined
          ? ""
          : `, loudness ${r.loudnessTargetLufs} LUFS`;
      console.log(
        `exported ${r.ranges} ranges, ${r.durationSec.toFixed(1)}s (${r.height}p, ${r.fps}fps, ${r.compression}${platformNote}${loudnessNote}, music ${r.music}) -> ${r.out}`
      );
      break;
    }
    case "verify": {
      if (!rest[0]) {
        throw new Error("usage: openklip verify <slug>");
      }
      console.log("[verify] re-transcribing the rendered cut...");
      const report = await verifyCut(rest[0]);
      console.log(verifyVerdict(report));
      if (report.missingKept.length > 0) {
        console.log(`  missing kept words: ${report.missingKept.join(", ")}`);
      }
      process.exitCode = report.ok ? 0 : 1;
      break;
    }
    case "take-add": {
      if (!(rest[0] && rest[1])) {
        throw new Error(
          "usage: openklip take-add <slug> <video> [--id <takeId>] [--label <text>]"
        );
      }
      const slug = rest[0];
      const id = flagValue(rest, "--id");
      const label = flagValue(rest, "--label");
      const video = rest.slice(1).filter((a, i, arr) => {
        const prev = arr[i - 1];
        return (
          a !== "--id" &&
          a !== "--label" &&
          prev !== "--id" &&
          prev !== "--label"
        );
      })[0];
      if (!video) {
        throw new Error(
          "usage: openklip take-add <slug> <video> [--id <takeId>]"
        );
      }
      const take = await ingestTake(slug, video, { id, label });
      console.log(
        `take "${take.id}" ingested: ${take.words.length} words, ${samplesToSec(take.durationSamples).toFixed(1)}s`
      );
      break;
    }
    case "takes": {
      if (!rest[0]) {
        throw new Error("usage: openklip takes <slug>");
      }
      const takes = await listTakes(rest[0]);
      if (takes.length === 0) {
        console.log("no takes. Run: openklip take-add <slug> <video>");
        break;
      }
      for (const t of takes) {
        const dur = samplesToSec(t.durationSamples).toFixed(1);
        console.log(
          `${t.id.padEnd(20)}  ${`${dur}s`.padStart(7)}  ${t.words.length} words${t.label ? `  ${t.label}` : ""}`
        );
      }
      console.log(`\n${takes.length} take(s)`);
      break;
    }
    case "assemble": {
      if (!(rest[0] && rest[1])) {
        throw new Error(
          "usage: openklip assemble <slug> <takeId:wStart-wEnd> [more...] [--pad <ms>] [--force]"
        );
      }
      const slug = rest[0];
      const padMs = flagNumber(rest, "--pad");
      const force = rest.includes("--force");
      // Each segment is "<takeId>:<startWordId>-<endWordId>".
      const segments = rest
        .slice(1)
        .filter((a, i, arr) => {
          const prev = arr[i - 1];
          return a !== "--pad" && a !== "--force" && prev !== "--pad";
        })
        .map((spec) => {
          const colon = spec.indexOf(":");
          const dash = spec.indexOf("-", colon + 1);
          if (colon <= 0 || dash <= colon) {
            throw new Error(
              `bad segment "${spec}" (want <takeId>:<wStart>-<wEnd>)`
            );
          }
          return {
            takeId: spec.slice(0, colon),
            startWordId: spec.slice(colon + 1, dash),
            endWordId: spec.slice(dash + 1),
          };
        });
      const r = await assembleFromSelection(
        slug,
        { segments, ...(padMs === undefined ? {} : { padMs }) },
        { force, actor: "cli" }
      );
      console.log(
        `assembled ${r.segments} segment(s), ${r.words} words, ${r.durationSec.toFixed(1)}s -> ${slug}`
      );
      break;
    }
    case "brand": {
      if (!(rest[0] && rest[1])) {
        throw new Error("usage: openklip brand <slug> <name>");
      }
      const brand = await loadBrand(rest[1]);
      const project = await mutateProject(
        rest[0],
        (p) => {
          applyBrand(p, brand);
          return p;
        },
        { action: "brand", actor: "cli", input: { name: rest[1] } }
      );
      console.log(
        `applied brand "${rest[1]}": captions ${project.captions.enabled ? "on" : "off"} (max ${project.captions.maxWords}), vignette ${project.look?.vignette ? "on" : "off"}, pad ${project.padMs}ms`
      );
      break;
    }
    case "template": {
      const sub = rest[0];
      if (sub === "list") {
        const list = listTemplates();
        if (list.length === 0) {
          console.log("no templates in templates/");
          break;
        }
        for (const t of list) {
          console.log(
            `${t.id}\t${t.label}${t.description ? `\t${t.description}` : ""}`
          );
        }
        console.log(`\n${list.length} template(s)`);
        break;
      }
      if (sub === "show") {
        const id = rest[1];
        if (!id) {
          throw new Error("usage: openklip template show <id>");
        }
        console.log(loadTemplateSkill(id));
        break;
      }
      if (sub === "set") {
        const [slug, id] = rest.slice(1);
        if (!(slug && id)) {
          throw new Error("usage: openklip template set <slug> <id>");
        }
        await mutateProject(
          slug,
          (project) => {
            applyProjectTemplate(project, id);
          },
          { action: "template-set", actor: "cli", input: { id } }
        );
        console.log(`template set to "${id}" for ${slug}`);
        break;
      }
      throw new Error(
        "usage: openklip template list | show <id> | set <slug> <id>"
      );
    }
    case "brief": {
      const slug = rest[0];
      if (!slug) {
        throw new Error(
          "usage: openklip brief <slug> [--set <text...> | --file <path>]"
        );
      }
      const setIndex = rest.indexOf("--set");
      const filePath = flagValue(rest, "--file");
      let newText: string | undefined;
      let source = "";
      if (setIndex !== -1) {
        newText = rest.slice(setIndex + 1).join(" ");
      } else if (filePath) {
        newText = await Bun.file(filePath).text();
        source = ` from ${filePath}`;
      }
      if (newText !== undefined) {
        await saveBrief(slug, newText);
        await logBriefSet(slug, "cli", newText);
        console.log(
          newText.trim()
            ? `brief saved for ${slug}${source} (${newText.trim().length} chars)`
            : `brief cleared for ${slug}`
        );
        break;
      }
      const brief = await loadBrief(slug);
      if (!brief) {
        console.log(
          `no brief.md yet for ${slug}. Run: openklip brief ${slug} --set "..."`
        );
        break;
      }
      console.log(brief);
      break;
    }
    case "revert": {
      const slug = rest[0];
      if (!slug) {
        throw new Error(
          "usage: openklip revert <slug> (--to <rev> | --task <taskId> | --last) [--force]"
        );
      }
      const toRaw = flagValue(rest, "--to");
      const taskId = flagValue(rest, "--task");
      const last = rest.includes("--last");
      const force = rest.includes("--force");
      const given = [toRaw !== undefined, taskId !== undefined, last].filter(
        Boolean
      ).length;
      if (given !== 1) {
        throw new Error(
          "usage: openklip revert <slug> (--to <rev> | --task <taskId> | --last) [--force]"
        );
      }
      let target: RevertTarget;
      if (toRaw !== undefined) {
        const to = Number(toRaw);
        if (!Number.isInteger(to) || to < 0) {
          throw new Error("--to must be a non-negative integer revision");
        }
        target = { to };
      } else if (taskId === undefined) {
        target = { last: true };
      } else {
        target = { task: taskId, force };
      }
      const { revision, restoredTo } = await revertProject(slug, target, {
        actor: "cli",
      });
      console.log(
        `reverted ${slug} to revision ${restoredTo} (new revision ${revision})`
      );
      break;
    }
    case "history": {
      if (!rest[0]) {
        throw new Error(
          "usage: openklip history <slug> [--limit N] [--task <id>] [--action <name>]"
        );
      }
      const historySlug = rest[0];
      const limitRaw = flagValue(rest, "--limit");
      const limit = limitRaw === undefined ? 50 : Number(limitRaw);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw new Error("--limit must be an integer between 1 and 200");
      }
      const taskFilter = flagValue(rest, "--task");
      const actionFilter = flagValue(rest, "--action");
      const allEntries = await readActionLog(historySlug);
      let entries = allEntries;
      if (taskFilter !== undefined) {
        entries = entries.filter((e) => e.taskId === taskFilter);
      }
      if (actionFilter !== undefined) {
        entries = entries.filter((e) => e.action === actionFilter);
      }
      const filteredOutAll = entries.length === 0;
      entries = entries.slice(0, limit);
      const snapshotRevisions = listHistorySnapshotRevisions(historySlug);
      if (entries.length === 0) {
        // Distinguish "genuinely no history" from "a filter matched
        // nothing" (Finding 6): the latter is a common false-empty read
        // that shouldn't look identical to an empty project.
        if (filteredOutAll && allEntries.length > 0) {
          const activeFilters = [
            taskFilter === undefined ? undefined : `--task=${taskFilter}`,
            actionFilter === undefined ? undefined : `--action=${actionFilter}`,
          ].filter((f): f is string => f !== undefined);
          console.log(
            `no history entries match the filter (${activeFilters.join(", ")}) for ${historySlug}.`
          );
        } else {
          console.log(`no history for ${historySlug}.`);
        }
        break;
      }
      for (const e of entries) {
        console.log(
          `${e.action.padEnd(16)}  rev ${e.revisionBefore}->${e.revisionAfter}  ${e.actor}${e.taskId ? `  task ${e.taskId}` : ""}  ${new Date(e.at).toISOString()}`
        );
      }
      console.log(
        `\n${entries.length} entr${entries.length === 1 ? "y" : "ies"}`
      );
      console.log(
        `snapshot revisions: ${snapshotRevisions.length > 0 ? snapshotRevisions.join(", ") : "(none)"}`
      );
      break;
    }
    case "tasks": {
      if (!rest[0]) {
        throw new Error(
          "usage: openklip tasks <slug> [--limit N] [--status <status>]"
        );
      }
      const tasksSlug = rest[0];
      const limitRaw = flagValue(rest, "--limit");
      const limit = limitRaw === undefined ? 20 : Number(limitRaw);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("--limit must be an integer between 1 and 100");
      }
      const statusFilter = flagValue(rest, "--status");
      if (
        statusFilter !== undefined &&
        !(AGENT_TASK_STATUSES as readonly string[]).includes(statusFilter)
      ) {
        throw new Error(
          `--status must be one of: ${AGENT_TASK_STATUSES.join(", ")}`
        );
      }
      const tasks = await listAgentTasks(tasksSlug, {
        limit: statusFilter === undefined ? limit : Number.MAX_SAFE_INTEGER,
      });
      const filtered = (
        statusFilter === undefined
          ? tasks
          : tasks.filter((t) => t.status === statusFilter)
      ).slice(0, limit);
      if (filtered.length === 0) {
        // Distinguish "genuinely no tasks" from "a --status filter matched
        // nothing" (Finding 6), same as the history command above.
        if (statusFilter !== undefined && tasks.length > 0) {
          console.log(
            `no tasks match the filter (--status=${statusFilter}) for ${tasksSlug}.`
          );
        } else {
          console.log(`no tasks for ${tasksSlug}.`);
        }
        break;
      }
      for (const t of filtered) {
        console.log(
          `${t.id}  ${t.status.padEnd(10)}  ${new Date(t.startedAt).toISOString()}  ${t.request.slice(0, 60)}`
        );
      }
      console.log(
        `\n${filtered.length} task${filtered.length === 1 ? "" : "s"}`
      );
      break;
    }
    case "reorder": {
      if (!(rest[0] && rest[1] && rest[2] && rest[3] !== undefined)) {
        throw new Error(
          "usage: openklip reorder <slug> <broll|title|zoom> <id> <toIndex>"
        );
      }
      const [slug, kind, id] = rest;
      const toIndex = Number(rest[3]);
      if (!Number.isFinite(toIndex)) {
        throw new Error("toIndex must be a number");
      }
      await runLoggedAction(slug, "reorder", { track: kind, id, toIndex });
      console.log(`reordered ${kind} ${id} -> index ${toIndex}`);
      break;
    }
    case "reanchor": {
      if (!rest[0]) {
        throw new Error("usage: openklip reanchor <slug> [overlayId]");
      }
      const slug = rest[0];
      const overlayId = rest[1];
      const { result: results } = await runLoggedAction<
        Array<{ id: string; kind: string; status: string }>
      >(slug, "reanchor", overlayId ? { id: overlayId } : {});
      if (results.length === 0) {
        console.log("no phrase-anchored overlays to re-resolve");
        break;
      }
      for (const r of results) {
        console.log(`${r.kind} ${r.id}: ${r.status}`);
      }
      break;
    }
    case "package": {
      if (!(rest[0] && rest[1])) {
        const passes = listPackagePasses()
          .map((p) => p.id)
          .join(", ");
        throw new Error(
          `usage: openklip package <slug> <pass>\n  passes: ${passes}`
        );
      }
      const slug = rest[0];
      const pass = resolvePackagePass(rest[1]);
      const p = projectPaths(slug);
      const input = p.out;
      const output = `${p.output}/out-${pass.id}.${pass.outExt}`;
      // Prefer the locally-installed hyperframes bin, else env override, else PATH.
      const localBin = resolve(process.cwd(), "node_modules/.bin/hyperframes");
      const cliRaw = process.env.HYPERFRAMES_CLI
        ? resolveHyperframesCli()
        : existsSync(localBin)
          ? localBin
          : resolveHyperframesCli();
      const cliPath = resolveCliPath(cliRaw);
      const preflight = checkPackagePreflight({
        outExists: existsSync(input),
        cli: cliPath,
      });
      if (!preflight.ok) {
        console.error(`\ncannot run package pass "${pass.id}":`);
        for (const e of preflight.errors) {
          console.error(`  - ${e}`);
        }
        if (pass.requires) {
          console.error(`  - this pass also needs: ${pass.requires}`);
        }
        process.exit(1);
      }
      const argv = buildPackageArgv(pass, input, output, cliPath as string);
      console.log(`[package] ${pass.label}`);
      console.log(`[package] ${argv.join(" ")}`);
      // HyperFrames shells out to ffmpeg/ffprobe by name; put our static binaries
      // on PATH so it doesn't require a system ffmpeg install.
      const proc = Bun.spawn(argv, {
        stdio: ["inherit", "inherit", "inherit"],
        env: {
          ...process.env,
          PATH: `${dirname(FFMPEG)}:${dirname(FFPROBE)}:${process.env.PATH ?? ""}`,
        },
      });
      if ((await proc.exited) !== 0) {
        throw new Error(`package pass "${pass.id}" failed`);
      }
      console.log(`[package] done -> ${output}`);
      break;
    }
    case "actions": {
      // Emit the unified action registry : the machine-readable capability
      // manifest an external agent can read whole (--json), or a Markdown table
      // that mirrors the AGENTS.md capability map. Optionally filter by surface.
      const surfaceArg = flagValue(rest, "--surface");
      if (
        surfaceArg !== undefined &&
        surfaceArg !== "cli" &&
        surfaceArg !== "gui" &&
        surfaceArg !== "mcp"
      ) {
        throw new Error("--surface must be cli, gui, or mcp");
      }
      const surface = surfaceArg as Surface | undefined;
      if (rest.includes("--json")) {
        console.log(JSON.stringify(actionManifest(surface), null, 2));
        break;
      }
      console.log(actionTable(surface));
      break;
    }
    case "tools": {
      const surfaceArg = flagValue(rest, "--surface");
      if (
        surfaceArg !== undefined &&
        surfaceArg !== "cli" &&
        surfaceArg !== "gui" &&
        surfaceArg !== "mcp"
      ) {
        throw new Error("--surface must be cli, gui, or mcp");
      }
      const surface = surfaceArg as Surface | undefined;
      if (rest.includes("--json")) {
        console.log(JSON.stringify(agentToolManifest(surface), null, 2));
        break;
      }
      console.log(agentToolTable(surface));
      break;
    }
    case "mcp": {
      await startMcpServer();
      break;
    }
    case "ingesters": {
      const list = await loadIngesters();
      if (list.length === 0) {
        console.log("no ingester plugins in ingesters/");
        break;
      }
      for (const m of list) {
        const required = m.fields
          .filter((f) => f.required)
          .map((f) => f.name)
          .join(", ");
        console.log(
          `${m.id.padEnd(16)}  ${m.label}${required ? `  (needs: ${required})` : ""}`
        );
      }
      console.log(`\n${list.length} ingester(s)`);
      break;
    }
    case "luts": {
      const names = listLuts();
      if (names.length === 0) {
        console.log("no LUTs in luts/ (drop a name.cube there)");
        break;
      }
      for (const n of names) {
        console.log(n);
      }
      console.log(`\n${names.length} LUT(s)`);
      break;
    }
    case "doctor": {
      const report = await runDoctor(rest[0]);
      const mark = { ok: "✓", warn: "!", fail: "✗" } as const;
      for (const c of report.checks) {
        console.log(`  ${mark[c.status]} ${c.name.padEnd(18)} ${c.detail}`);
      }
      console.log(
        `\n${report.ok ? "healthy" : "problems found"} (${report.checks.length} checks)`
      );
      if (!report.ok) {
        process.exit(1);
      }
      break;
    }
    default:
      help();
  }
} catch (e) {
  console.error(`\nerror: ${(e as Error).message}\n`);
  process.exit(1);
}

# AGENTS.md

Single source of truth for AI agents working in this repo: OpenKlip editing workflow, guardrails, copy rules, and code standards.

---

# OpenKlip agent skill

OpenKlip is a local-first, agent-native video toolchain: external agents run the edit loop via CLI; the browser reviews the same `project.json`.

## The file model (read this first)

Each project lives as plain files under `projects/<slug>/` in a layered layout. The parent directory is resolved by `projectsRoot()`:

1. `OPENKLIP_PROJECTS_ROOT` if set
2. else `.openklip/projects-root` in the app cwd (GUI folder picker)
3. else `~/Movies/OpenKlip`

```
projects/<slug>/
  project.json            the EDL - the edit itself (the only file you edit)
  brief.md                optional project brief: audience, goal, tone,
                          must-use assets, avoid list, target length, formats
  assets/                 user originals (flat): drop b-roll, music, stills here
  graphics/               optional project-local graphic templates (override bundled ids)
  working/                derived media + scratch: proxy.mp4, transcript.json,
                          audio16k.f32, frames/, asset proxies, chats.json,
                          actions.jsonl, tasks.json…
  output/out.mp4          the rendered export
```

Edit templates (repo root, not per project):

```
templates/<id>/skill.md   agent playbook (cuts, overlays, export loop)
```

Optional `template` field on `project.json` points at a template id (e.g. `talking-head`).

**`project.json` IS the edit.** It holds every transcribed word with a `deleted` flag, b-roll overlays, still (Ken Burns) overlays, push-in zooms, title cards, graphics (HTML/CSS template overlays), music placements, captions settings, look flags, optional `sceneLog` (visual spans + speaker focus), optional `highlights` (LLM clip candidates), and `export` (aspect + reframe crop). Everything under `working/` and `output/` is regenerated from it. The GUI editor and these CLI commands both read and write this same file; they are **equivalent (parity)**. Edit it through the CLI; the browser editor will show the same result, and vice-versa.

**Action history.** Every user-facing mutation (GUI, CLI, MCP) appends one entry to `working/actions.jsonl`: an append-only log with action name, actor (`human|agent|cli|mcp|system`), optional provenance fields (`authorId`, `model`, `agentSurface`), truncated input/result summaries, timestamp, and the `project.json` `revision` counter before and after (bumped inside the write lock). This covers registry actions, GUI direct-save paths, asset registration/deletion, `template set`, `brand`/`ingest --brand`, and multi-take `assemble` (which now writes through `mutateProject` instead of a raw file write, so it no longer resets the revision counter); background folder-sync prune logs `asset-prune` under the `system` actor. Read it via `GET /api/projects/<slug>/history`, the History section in the Config panel, `openklip history <slug> [--limit] [--task] [--action] [--actor] [--author]`, or the MCP `history_list` tool (also filterable by `actor`, `author`, or `model`). Set `OPENKLIP_ACTOR` in the environment to attribute GUI-spawned agent edits as `agent`. Set `OPENKLIP_AUTHOR_ID` (e.g. `ai:cursor`), `OPENKLIP_AGENT_MODEL` (e.g. `claude-sonnet-4-6`), and `OPENKLIP_AGENT_SURFACE` (e.g. `claude-code`, `codex`, `cursor`) to record which agent or model performed an edit. Transcript words and overlays optionally carry `authoredBy` / `authoredRevision`; the GUI shows hover attribution and **View in history** only when Settings → Appearance → **Show edit attribution** is on (default off). Brief saves from CLI, GUI, and MCP all write one best-effort `brief-set` history entry with the same revision before and after, because `brief.md` is not part of the EDL. Log entries carry an optional `taskId` (from `OPENKLIP_TASK_ID`) grouping an agent run's edits.

**Snapshots and revert.** Every logged mutation writes the project state from just before the change to `working/history/rev-<revisionBefore>.json` (atomic, best-effort, pruned to the newest 100 revisions). `openklip revert <slug> (--to <rev> | --task <taskId> | --last) [--force]` restores the project to an earlier snapshot as a normal logged `revert` mutation, so the revision counter stays monotonic and a revert is itself revertible. `--task` restores to just before that task's earliest entry and refuses without `--force` if a foreign revision-bumping entry (including one interleaved between the task's own) would also be discarded. A revert refuses to cross a multi-take `assemble` boundary, since the snapshot's source no longer matches the media on disk. Revert restores `project.json` only, not `brief.md`, chats, tasks, asset files, or derived media (proxy, extracted audio, transcript). Also available as the MCP `revert` tool and per-entry/per-task "Revert" in the GUI History panel. The GUI History panel also offers **Show transcript diff** on transcript mutations (`cut`, `cut-text`, `restore`, `edit-words`, `word-text`): a review-only kept-word diff between the before snapshot and the after state (`GET /api/projects/<slug>/history/snapshot?revision=<n>`), rendered with `@pierre/diffs` (Inline/Classic layout). It does not replace the main transcript editor.

**Agent tasks.** Every tool-calling chat edit gets a visible, persisted task in `working/tasks.json` (`src/agent-tasks.ts`): id, request, status (`pending|running|blocked|failed|completed|cancelled`), a step list with per-step status and notes, optional MCP tool-call traces, and start/complete timestamps. The running agent reports its own progress with the `task_step` and `task_complete` MCP tools, which resolve the active task from the `OPENKLIP_TASK_ID` environment variable set on the spawned process, never from tool input, so an agent can only touch the one task it was spawned for. The unified chat timeline polls `GET /api/projects/<slug>/tasks` every 2 seconds while a task is running; each task card can show steps, action-history entries, tool-call traces, and a cancel button that `POST`s `{ action: "cancel", taskId }` to the same route, which best-effort kills the live process and marks the task cancelled. Tool-calling edit runs get a 900-second budget (`runClaudeEdit`'s `timeoutMs`) so a full draft (cuts, overlays, music, export, verify) doesn't get killed mid-run; a run that exits without calling `task_complete` is finalized as failed (with a distinct timeout message) or completed as a fallback. Any agent can list past task records with `openklip tasks <slug> [--limit] [--status] [--actor]` or the MCP `task_list` tool (also filterable by `actor`), without needing the task id from context. `AgentTask.actor` is optional: tasks created before this filter existed have no recorded actor and are not matched by an `--actor` filter.

Time is integer audio samples at 48 kHz. The CLI takes seconds where a human number is natural (overlay spans) and converts for you.

## Capability map

| User action (GUI) | Agent command |
| --- | --- |
| List projects | `openklip list` |
| Ingest a video | `openklip ingest <video> [--force]` |
| Create blank canvas | `openklip ingest --blank [--slug] [--duration] [--aspect] [--fps] [--color] [--force]` (GUI: New project → Blank canvas; MCP: `blank_ingest`) |
| Open editor | `openklip serve [slug]` (alias `dev`) |
| Read / write the project brief | `openklip brief <slug> [--set <text...> \| --file <path> \| --audit]` |
| Read transcript (full) | `openklip transcript <slug>` |
| Grep transcript | `openklip transcript grep`, `span`, `phrase` |
| Search moments by transcript text or visual scene | `openklip search <slug> "query" [--json] [--limit N]` (MCP: `moment_search`) |
| Rebuild the visual moment search index | `openklip index <slug> [--force]` |
| Review edit (JSON) | `openklip status <slug> --json`, `ranges`, `overlays` |
| Cut / restore words | `openklip cut`, `openklip restore` |
| Correct one word's transcript text | `openklip word-text <slug> <wordId> <text...>` |
| Read filler/dead-air cleanup candidates by category | `openklip cleanup <slug> [--json]` |
| Apply safe cleanup candidates | `openklip cleanup <slug> --apply-safe` |
| Apply enabled-category cleanup candidates (any risk) plus all dead-air | `openklip cleanup <slug> --apply-enabled` |
| Persist cleanup category toggles and thresholds (`minSec`, `keepPadSec`) | `openklip cleanup-config`, MCP/GUI `cleanup-config` (Cleanup tab) |
| Remove a registered dead-air span | `openklip dead-air-rm <slug> <id>` |
| Register b-roll file | `openklip broll <slug> <file>` |
| Register a still or music asset | `openklip asset-add <slug> <file> --kind still\|music` |
| List b-roll assets | `openklip assets <slug>` |
| Describe media (subagents) | `openklip analyze <slug>` |
| Rank b-roll for a spoken span | `openklip broll-suggest <slug> --phrase "..."` or `--text "..."` (MCP: `broll_suggest`) |
| Place / patch / remove b-roll | `openklip broll-add`, `broll-set`, `broll-rm`, `broll-add-phrase` |
| Place / patch / remove still (Ken Burns) | `openklip still-add`, `still-set`, `still-rm` |
| Place / patch / remove music placement | `openklip music-add`, `music-set`, `music-rm` |
| Detect music tempo (BPM) | `openklip bpm <slug> <assetId>` (MCP: `music_bpm`; GUI: Music panel **Detect BPM**) |
| Measure loudness before export | `openklip audio measure <slug>` (MCP: `audio_measure`; GUI: Audio panel **Measure loudness**) |
| Place / patch / remove graphic (HTML/CSS template) | `openklip graphic-add`, `graphic-set`, `graphic-rm`, `graphic-add-phrase` (optional `--beats`, `--bpm`, `--music-asset`), `graphic-add-cuts` |
| List / show graphic templates | `openklip graphic list [--slug]`, `openklip graphic show <id> [--slug]` (MCP: `graphic_list`, `graphic_show`; GUI Config → Graphics picker) |
| Add / patch json-render graphic | `openklip json-graphic-add`, `json-graphic-set` (`product-announcement`, `map-motion`) |
| Place / patch / remove title | `openklip title-add`, `title-set`, `title-rm`, `title-add-phrase` |
| Add / patch / remove zoom | `openklip zoom-add`, `zoom-set`, `zoom-rm`, `zoom-add-phrase` |
| Reorder overlay (paint order) | `openklip reorder <slug> <broll\|title\|zoom> <id> <toIndex>` |
| Ingest an alternate take | `openklip take-add <slug> <video> [--id <takeId>] [--label <text>]` |
| List ingested takes | `openklip takes <slug>` |
| Splice takes into a new source | `openklip assemble <slug> <takeId:wStart-wEnd> [more...]` |
| Ingest a cam video | `openklip cam-add <slug> <video> [--id <camId>] [--name <text>] [--role speaker\|wide] [--offset <ms>] [--force]` |
| List ingested cams | `openklip cams <slug> [--json]` |
| Patch cam metadata | `openklip cam-set <slug> <camId> [--name <text>] [--role speaker\|wide] [--offset <ms>]` |
| Mix cams into a switched program | `openklip cam-mix <slug> [--mode follow\|auto] [--agent <id>] [--master-mix <path>] [--min-shot <ms>] [--max-shot <ms>] [--interjection <ms>] [--lead <ms>] [--wide auto\|off] [--json]` |
| Lock a manual shot override and re-mix | `openklip cam-override <slug> <fromSec>-<toSec> <shot> [--json]` |
| Apply brand preset (look defaults) | `openklip brand <slug> <name>` |
| Set edit template (agent skill) | `openklip template set <slug> <id>` |
| List / show edit templates | `openklip template list`, `openklip template show <id>` |
| Toggle captions | `openklip captions <slug> on\|off` |
| Caption line length | `openklip captions-max <slug> <n>` |
| Caption look preset | `openklip captions-style <slug> <boxed\|clean\|karaoke\|bold-caps\|minimal>` |
| Vertical caption safe-area inset | `openklip captions-inset <slug> on\|off [--platform generic\|tiktok\|reels\|youtube-shorts]` |
| Toggle vignette | `openklip look <slug> vignette on\|off` |
| Set animation feel | `openklip motion <slug> --speed <n>` |
| Set color grade | `openklip look <slug> grade <name>` |
| Fine-tune the grade (color knobs) | `openklip look <slug> color --temp 0.15 --contrast 0.96 --sat 0.84` |
| Apply a LUT (.cube) | `openklip look <slug> lut <name>` |
| List available LUTs | `openklip luts` |
| Set export audio quality (ducking / loudness / highpass / noise / de-ess) | `openklip audio <slug> [--duck on\|off] [--loudness on\|off] [--loudness-mode single\|two-pass] [--noise-reduction on\|off] [--highpass on\|off] [--deess on\|off]` |
| Cut boundary padding | `openklip pad <slug> <ms>` |
| VAD cut snap + seam crossfade | `openklip cuts-snap <slug> [--on\|--off] [--mode off\|vad] [--max-shift <ms>] [--crossfade <ms>]` |
| Review edit | `openklip status <slug>` (`--json` for agents) |
| Kept ranges / overlays | `openklip ranges <slug>`, `openklip overlays <slug>` |
| Check environment / project health | `openklip doctor [slug]` |
| Revert to an earlier revision, a task's start, or the last edit | `openklip revert <slug> (--to <rev> \| --task <id> \| --last) [--force]` |
| Read action history (newest first) | `openklip history <slug> [--limit] [--task] [--action] [--actor]` |
| List agent task records (newest first) | `openklip tasks <slug> [--limit] [--status] [--actor]` |
| List ingester plugins | `openklip ingesters` |
| List shipped product capabilities | `openklip features` |
| List the action registry (mutations only) | `openklip actions` |
| List all agent tools (query + mutate + export) | `openklip tools` |
| MCP server (stdio) | `openklip mcp` or `bun run mcp` |
| Export MP4 | `openklip export <slug>` |
| Set export aspect and reframe crop | `openklip export-set <slug> [--aspect source\|16:9\|9:16\|1:1] [--crop-mode manual\|scene\|vision] [--crop-focus-x <0-1>] [--crop-focus-y <0-1>] [--crop-scale <1-3>] [--layout fill\|split-vertical] [--split-ratio <0.25-0.75>] [--split-speaker top\|bottom]` |
| Set asset must-use / avoid flags | `openklip asset-flags <slug> <assetId> [--must-use\|--avoid\|--clear]` |
| Enrich sceneLog with macOS Vision face focus | `openklip vision-focus <slug>` (darwin only) |
| List / detect LLM highlight clip candidates | `openklip highlights <slug> [--json]`, `openklip highlights-detect <slug> [--agent] [--max-clips] [--target-sec]` |
| Export one or all highlight clips | `openklip export-highlight <slug> <h1|all> [--platform shorts]` |
| Export all highlights (agent script) | `bun run agent-make-highlights <slug> [--ids h1,h2] [--dry-run]` |
| Run macOS Vision reframe (GUI) | Reframe panel **Vision focus** button (darwin server only) |
| Export with a platform preset | `openklip export <slug> --platform youtube\|youtube-4k\|x\|linkedin\|shorts [--loudness <lufs>]` |
| Verify rendered cut | `openklip verify <slug>` |
| Post-export packaging (HyperFrames) | `openklip package <slug> <pass>` |

## Commands

Run as `bun run src/cli.ts <command>` (or the `openklip` bin).

### Discovery

| Command | What it does |
| --- | --- |
| `openklip list` | List all projects, most recent first. |
| `openklip assets <slug>` | List registered b-roll assets with ids and durations. |
| `openklip broll-suggest <slug> (--text "..." \| --phrase "...") [--top N] [--json]` | Rank b-roll assets for a spoken span or keywords using existing asset cards (`summary`, `tags`, `bestFor`). Respects `mustUse` / `avoid`. Assets without cards are listed in `uncarded` with an analyze hint. |
| `openklip analyze <slug> [--agent <model>]` | One "understand my media" pass: fan out one subagent per un-described asset (b-roll, stills) to write an "asset card", and (if absent) one subagent over the main video's ingest frames to write a `sceneLog` on `project.json` (what is on screen, b-roll opportunities). Idempotent: only missing work runs. |
| `openklip brief <slug>` | Print the project brief (`brief.md`), or a hint if none exists yet. |
| `openklip brief <slug> --set <text...>` | Replace the brief with the given text (empty text clears it). |
| `openklip brief <slug> --file <path>` | Replace the brief with a file's content. |
| `openklip brief <slug> --audit` | Check the current edit against `brief.md` targets (runtime, overlays, music, protected phrases). Exits non-zero on failure. |

### Transcript (read)

Prefer bounded reads over dumping the full transcript. Use `--json` for machine parsing.

| Command | What it does |
| --- | --- |
| `openklip transcript <slug>` | Print every word as `index  id  mm:ss  text  [cut]`. Use on short clips only. |
| `openklip transcript grep <slug> "phrase" [--all] [--json]` | Find phrase runs: word ids, seconds, matched text. |
| `openklip transcript span <slug> <w12\|w12-w20> [--context N] [--json]` | Slice words around ids (default context 0). |
| `openklip transcript phrase <slug> "phrase" [--json]` | First match span (`fromSec`, `toSec`, ids) for overlay placement. |

### Transcript edits

| Command | What it does |
| --- | --- |
| `openklip transcript <slug>` | Print every word as `index  id  mm:ss  text  [cut]`. Read this before editing. |
| `openklip cut <slug> <tokens...>` | Mark words deleted. Tokens are word ids (`w12`) or inclusive ranges (`w12-w20`). |
| `openklip cut <slug> --text "phrase"` | Cut the first contiguous run matching the phrase (case/punctuation-insensitive). |
| `openklip cut <slug> --text "phrase" --all` | Cut **every** matching run (e.g. repeated filler words). |
| `openklip cut <slug> <tokens...> --restore` | Restore the listed words instead of cutting them. |
| `openklip restore <slug>` | Restore every word (clear all cuts). |
| `openklip word-text <slug> <wordId> <text...>` | Correct one word's transcript text without changing its timing. The original text is preserved once, on the first correction (`originalText`, never overwritten again). GUI bulk edits go through the same preservation logic via `edit-words`. |

Add `--note "<why>"` to any `cut` or overlay-add to record the rationale on the edit (metadata only, never reaches ffmpeg; `--note ""` clears it). Surfaces in `transcript`, `overlays`, and the agent tools so the next pass knows why.

### Overlays

| Command | What it does |
| --- | --- |
| `openklip broll <slug> <file>` | Register a b-roll clip (builds preview proxy, returns asset id). |
| `openklip asset-add <slug> <file> [--kind broll\|music\|still]` | Register any asset kind (builds a proxy for video/audio, returns the asset id). `openklip broll` is the `--kind broll` shortcut; register a **still** here before `still-add`. |
| `openklip broll-add <slug> <assetId> <fromSec> <toSec>` | Cover a source-time span with a registered asset. `--display cover\|pip\|split` (default `cover`; `pip` insets bottom-right; `split` shows speaker left and b-roll right). `--audio-mode silent\|broll\|mix\|duck-voice\|duck-broll` (default `silent`). |
| `openklip broll-add-phrase <slug> <assetId> "spoken phrase"` | Cover the span of the first spoken phrase match. |
| `openklip broll-set <slug> <brollId>` | Patch b-roll: `--asset`, `--from`, `--to`, `--src-in` (seconds), `--display cover\|pip\|split`, `--audio-mode silent\|broll\|mix\|duck-voice\|duck-broll`. |
| `openklip broll-rm <slug> <brollId>` | Remove a b-roll clip. |
| `openklip music-add <slug> <assetId> <fromSec> <toSec>` | Place a registered **music** asset as a background bed. `--gain 0.3` (0–2), `--fade-in <sec>` / `--fade-out <sec>` (0–10), `--src-in <sec>`, `--mode loop\|trim`, `--note "<why>"`. |
| `openklip music-set <slug> <musicId>` | Patch a music placement: same flags plus `--asset`. |
| `openklip music-rm <slug> <musicId>` | Remove a music placement. |
| `openklip title-add <slug> <fromSec> <toSec> <text>` | Burn a title card. `--position lower\|center\|hero\|quote\|divider\|callout` (default lower). Use `\n` for two lines (hero/quote attribution). |
| `openklip title-add-phrase <slug> "spoken" "title text"` | Place a title at the first spoken phrase match (min 2s span). |
| `openklip title-set <slug> <titleId>` | Patch title: `--text`, `--position`, `--from`, `--to`. |
| `openklip title-rm <slug> <titleId>` | Remove a title card. |
| `openklip zoom-add <slug> <fromSec> <toSec>` | Push-in zoom. `--scale 1.15` (1–3), `--ramp 0.6` (0–5 sec). |
| `openklip zoom-add-phrase <slug> "spoken phrase"` | Push-in zoom at the first spoken phrase match. |
| `openklip zoom-set <slug> <zoomId>` | Patch zoom: `--scale`, `--ramp`, `--from`, `--to`. |
| `openklip zoom-rm <slug> <zoomId>` | Remove a push-in zoom. |
| `openklip still-add <slug> <assetId> <fromSec> <toSec>` | Overlay a registered **still** image with a Ken Burns push-in. `--scale 1.2` (1–3), `--focus-x 0.5` / `--focus-y 0.5` (0–1 image coords). |
| `openklip still-set <slug> <stillId>` | Patch a still: `--asset`, `--from`, `--to`, `--scale`, `--focus-x`, `--focus-y`. |
| `openklip still-rm <slug> <stillId>` | Remove a still overlay. |
| `openklip graphic-add <slug> <template> <fromSec> <toSec>` | Overlay an HTML/CSS graphic template. `--param key=value` (repeatable), `--track broll\|title\|zoom` (z-layer), optional `--beats N` with `--bpm` or `--music-asset` for beat-snapped spans. Spans auto-extend to fit `inDurFrames`/`staggerFrames` entrance timing. Motion pack templates accept `inDurFrames` and `staggerFrames` timing params. Image-filter shaders (`shader-fluted-glass`, `shader-halftone-*`, `shader-heatmap`, `shader-image-dithering`) require `--param assetId=<still-or-image-broll>`. `shader-liquid-metal` and `shader-gem-smoke` accept an optional `assetId` for logo-style treatments. Text templates (`kind: "text"`) render via ASS and stay browser-free; rich templates (`kind: "rich"`) render pixel-faithfully through headless Chrome to a transparent ProRes 4444 MOV (install once: `bunx puppeteer browsers install chrome-headless-shell`). Rich renders are cached in `working/graphics-cache/` when params and span match a prior export. Includes 29 shader templates under `graphics/shader-*` (24 procedural + 5 image-filter) powered by `@paper-design/shaders@0.0.77`, plus 5 `transition-*` hit templates, with deterministic frame-driven motion from the shared runtime (`web/lib/graphic-runtime.ts`, `web/lib/paper-shader-specs.ts`). Bundled templates live in repo `graphics/`; drop overrides in `projects/<slug>/graphics/` (project-local ids win on collision). |
| `openklip graphic list [--slug <slug>]` | List graphic templates with pack, kind, and param keys (includes project-local when `--slug` is set). |
| `openklip graphic show <id> [--slug <slug>]` | Print one template manifest as JSON (project-local override when `--slug` is set). |
| `openklip graphic-add-phrase <slug> <template> "spoken phrase"` | Place a graphic at the first spoken phrase match (min 2s span; extends for entrance animation). Same flags as `graphic-add`, plus optional `--beats`/`--bpm`/`--music-asset`. Auto-fills `text` from the transcript for kinetic motion templates when omitted; auto-sets `staggerFrames` from kept phrase word ids when omitted. See `templates/motion-graphics/skill.md`, `templates/motion-shorts/skill.md`, and `templates/motion-canvas/skill.md`. |
| `openklip graphic-add-cuts <slug> <transition-template>` | Place a `transition-*` graphic centered on every kept-range cut seam. `--duration <sec>` overrides template default length; same `--param` / `--track` flags as `graphic-add`. GUI: **Place at cut seams** in the Graphics section when a transition template is selected. |
| `openklip bpm <slug> <assetId>` | Detect tempo of a registered **music** asset (local ffmpeg PCM analysis). Caches in `working/music-bpm.json`. `--force` re-analyzes. |
| `openklip audio measure <slug>` | Read integrated loudness (LUFS), true peak, and LRA from `output/out.mp4` or the ingest proxy without re-exporting. `--source export\|proxy`, `--json`. |
| `openklip graphic-set <slug> <graphicId>` | Patch a graphic: `--template`, `--from`, `--to`, `--param`, `--track`. |
| `openklip graphic-rm <slug> <graphicId>` | Remove a graphic overlay. |
| `openklip json-graphic-add <slug> <catalog> <fromSec> <toSec> --spec-file spec.json` | Add a catalog-constrained json-render graphic (`product-announcement` or `map-motion`). `--spec-file` is required; `--track broll\|title\|zoom` sets the z-layer. The spec is hard-validated before it persists; the editor previews the same React render and it exports through the normal timeline. See `templates/product-announcement/skill.md` or `templates/map-motion/skill.md`. |
| `openklip json-graphic-set <slug> <graphicId>` | Patch a json-render graphic: `--from`, `--to`, `--spec-file`, `--track`. Shares the same span + spec validation path as `json-graphic-add`. |
| `openklip reorder <slug> <broll\|title\|zoom> <id> <toIndex>` | Restack an overlay within its track. Array order is paint order: a later index paints on top (matters when b-roll covers overlap). |
| `openklip reanchor <slug> [overlayId]` | Re-resolve phrase-anchored overlays onto the current kept words. Reports each overlay as `moved`, `unchanged`, or `stale`. Runs automatically after every word-deletion path (`cut`, `cut --text`, `restore`, GUI word toggles); call it manually only to re-snap after editing the transcript out of band. |

The `*-add-phrase` helpers remember the spoken phrase as an **anchor** on the overlay, so a later cut re-snaps the overlay's window onto the words it belongs to instead of stranding it. If you manually move a phrase-placed overlay with `*-set` (`--from`/`--to`), that span may be re-moved by the next word-deletion (the anchor still wins); place anchorless overlays with the plain `*-add` if you want the span pinned. When the anchored phrase is deleted the overlay is flagged `stale` and keeps its last good span (the exporter still renders it); restoring the words clears `stale`.

**Authoring graphic templates**: `graphic-add`'s `<template>` argument is any `graphics/<id>/` folder (a `manifest.json` + `composition.html` pair, auto-discovered, no code registration) under repo `graphics/` or `projects/<slug>/graphics/`. This includes the bundled `motion-*` pack (`motion-typewriter`, `motion-blur-reveal`, `motion-shimmer`, `motion-glitch`, `motion-kinetic-build`, `motion-roll-number`, `motion-word-cascade`, `motion-highlight-pop`), the `transition-*` hit pack, and rich text templates driven by the shared `data-anim` runtime contract. To add a new template, read `graphics/AUTHORING.md` first: it documents the manifest schema, the full `data-anim`/split/stagger attribute reference, and frame-purity rules.

### Multi-take assembly

Pick the best lines across several recordings of the same script, then splice them into one clean source the rest of the engine treats normally (single `source`/`proxy`, all overlays/look/captions apply on top).

| Command | What it does |
| --- | --- |
| `openklip take-add <slug> <video>` | Ingest one alternate take into `takes/<id>/` (probe + 720p proxy + Whisper transcript). Takes never enter `project.json`; they are raw material. `--id <takeId>` to name it, `--label <text>` for a human note. |
| `openklip takes <slug>` | List ingested takes with id, duration, and word count. |
| `openklip assemble <slug> <takeId:wStart-wEnd> [more...]` | Splice the chosen word runs end-to-end into a **new** single-source project. `--pad <ms>` is the symmetric seam pad (0–500, default 50); `--force` overwrites an existing edit. Segments are inclusive word-id ranges into each take's own transcript (read them with `take_transcript`). |

Workflow: `take-add` each recording, read `take_transcript <slug> <takeId>` to find the best read of each line, then `assemble` the runs in script order. The planner lays them end-to-end with no gap at the seam and re-ids the merged transcript `w0..` (integer-exact source-sample → output-sample re-timing, so preview and export can't drift). Provenance (where every output span came from in take samples) is written to `project.json`'s `assembly` block. Via the `assemble` agent tool you can attach a per-segment `note` recording **why** that take won the line, and it rides into the provenance for the next pass. The exporter is unchanged: it reads the one assembled `source`. Concat uses an ffmpeg **filter** (not the demuxer) so mismatched takes are normalized to the first take's geometry/fps; the takes stay parked in `takes/` alongside the new source.

### Contextual cam switch

Turn per-speaker camera files into one professionally switched program: ingest each angle, run follow-speaker or LLM auto scene mixing, and patch obvious misfires with locked overrides, all rendered down to a normal single-source project the rest of the engine edits unchanged.

| Command | What it does |
| --- | --- |
| `openklip cam-add <slug> <video>` | Ingest one cam into `cams/<id>/` (probe + 720p proxy + 16kHz PCM, no transcription). `--id <camId>` to name it, `--name <text>` for a display name, `--role speaker\|wide` (default `speaker`), `--offset <ms>` for manual sync (integer, may be negative), `--force` to overwrite. Up to 8 cams per project. |
| `openklip cams <slug> [--json]` | List ingested cams: id, name, role, offset, duration, resolution. |
| `openklip cam-set <slug> <camId> [--name <text>] [--role speaker\|wide] [--offset <ms>]` | Patch a cam's display name, role, or manual offset. |
| `openklip cam-mix <slug> [--mode follow\|auto] [--agent <id>] [--master-mix <path>] [--min-shot <ms>] [--max-shot <ms>] [--interjection <ms>] [--lead <ms>] [--wide auto\|off] [--json]` | Mix ingested speaker cams into a single switched source. `follow` (default) is a deterministic speaker-follow planner; `auto` asks an LLM (`--agent`) for scene-mix variety, validated and clamped by the same guardrails, falling back to follow plus rule-based wides when no agent is available. `--master-mix` supplies external program audio instead of mixing all cam mics. Guardrails default to `minShotMs: 2000`, `interjectionMs: 700`, `leadMs: 250`, `maxShotMs: 25000`, and a synthetic `wide` (side-by-side for 2 speakers, grid for 3-4) unless `--wide off`. Requires at least 2 `speaker`-role cams. |
| `openklip cam-override <slug> <fromSec>-<toSec> <shot> [--json]` | Lock a manual shot (a cam id or `wide`) for a source-time span and re-render. Locked spans survive later `cam-mix`/`cam-override` calls. |

Workflow: `cam-add` each speaker's file (and an optional `wide` cam), `cam-set` to fix names/roles/offsets, then `cam-mix` to render. Speaker ID compares per-track RMS energy across each cam's own audio (no ML or cloud diarization); one Whisper pass transcribes the mixed program audio and each word is attributed to a cam by energy vote, landing as an optional `speaker` field on the word. The mix-down is one ffmpeg pass that writes `source.mp4` and `proxy.mp4` like any other project, so cuts, captions, reframe, and export work unchanged; re-running `cam-mix` or `cam-override` re-encodes. The GUI Config → Project **Cameras** section ingests cams, edits name/role/offset, plays per-cam audio for audition, picks follow/auto mode, tunes mix guardrails, locks manual shot spans, re-mixes, and shows a read-only mix timeline for both modes.

### Moment search

Find moments in the source footage by transcript text or on-screen visual content, then seek to or restore them.

| Command | What it does |
| --- | --- |
| `openklip search <slug> "<query>" [--json] [--limit N]` | Search transcript text and visual scenes in one call. Text matches include cut words (marked `[cut]`); scene matches blend CLIP frame embeddings with scene-log summaries, gated by a measured score floor plus peak-relative pruning so wrong-topic queries return nothing instead of noise. `--limit` caps result count (1-100, default 24; MCP: `moment_search`, same input shape). |
| `openklip index <slug> [--force]` | Build or rebuild the visual moment index (`working/moment-index.json`) by embedding existing ingest sample frames with a local CLIP model (`Xenova/clip-vit-base-patch32`, downloaded once like Whisper). `search` and `moment_search` build a missing or stale index automatically on first call; run this to force a rebuild or pre-warm it. |

Workflow: ingest runs indexing as a non-fatal phase (a failed or missing index degrades to text-only results, never blocks ingest); older projects backfill lazily on first search. GUI: the fourth left-rail sidebar tab, **Search** (`Mod+Shift+F`), shows text and scene results as thumbnail cards with timestamps. Click a card to seek; drag it onto the preview, transcript, or open timeline drawer, or use its hover **Keep** button, to restore any cut words in that span (a logged, revertible `cut` action).

### Look & captions

| Command | What it does |
| --- | --- |
| `openklip captions <slug> <on\|off>` | Toggle burned captions for export. |
| `openklip captions-max <slug> <n>` | Words per caption line (1–12). |
| `openklip captions-style <slug> <style>` | Set the caption look preset: `boxed` (default), `clean`, `karaoke`, `bold-caps`, `minimal`. Defined once in `src/caption-styles.ts` and rendered identically by the preview and the ASS export burn-in. An unknown or missing style on `project.json` falls back to `boxed` on load; this command validates and rejects an invalid id. |
| `openklip captions-inset <slug> on\|off [--platform …]` | Toggle vertical-export caption safe-area inset (`captions.insetPlatform`). Applies on portrait exports only; uses the same inset fractions as preview safe-area guides. |
| `openklip look <slug> vignette <on\|off>` | Toggle vignette. |
| `openklip motion <slug> [--speed n] [--fade ms] [--hero-fade ms] [--slide frac]` | Global animation feel for overlay entrances (the deck's anim.tsx). `speed` scales every duration, so "make it snappier" is one number (`--speed 1.4`). Titles read it at export (ASS fade + slide). |
| `openklip look <slug> grade <name>` | Set the color grade applied to the whole picture at export: `none`, `neutral`, `warm`, `cool`, `cool_desat`, `filmic`, `punchy`. Expands to a deterministic ffmpeg filter chain. `none` is the default no-op. |
| `openklip look <slug> color [--temp n] [--tint n] [--bright n] [--contrast n] [--sat n] \| --reset` | Continuous color knobs **on top of** the base grade (the deck's "control room"): temperature/tint (colorbalance), then contrast/brightness/saturation (eq), in that order. Each knob defaults to the identity; only the ones you pass change, and an all-neutral result clears `look.color`. `--reset` returns to neutral. The GUI exposes the same knobs as live sliders previewed on a real frame; both write `look.color` through the one `look-color` action. |
| `openklip look <slug> lut <name\|none>` | Apply a named `.cube` LUT from `luts/` (the technical color transform, e.g. log to Rec.709), applied before the grade. `none` clears it. Drop `name.cube` into `luts/`; reference by name so `project.json` stays portable. `openklip luts` lists them. |
| `openklip audio <slug>` | Print current export audio quality settings (ducking, loudness, voice highpass, de-essing). |
| `openklip audio <slug> [--duck on\|off] [--duck-amount <1-30 dB>] [--duck-attack <1-500 ms>] [--duck-release <20-2000 ms>] [--loudness on\|off] [--loudness-target <-30..-10 LUFS>] [--loudness-mode single\|two-pass] [--noise-reduction on\|off] [--noise-strength <1-97>] [--highpass on\|off] [--highpass-hz <40-200>] [--deess on\|off] [--deess-intensity <0-1>]` | Patch export audio quality: ducking, loudness (single or two-pass), noise reduction, voice highpass, and de-essing (ffmpeg `deesser` filter). Export-only; preview audio is unprocessed. |
| `openklip pad <slug> <ms>` | Symmetric padding around kept ranges (0–500 ms). |
| `openklip cuts-snap <slug> [--on\|--off] [--mode off\|vad] [--max-shift <ms>] [--crossfade <ms>]` | Toggle VAD snap-to-silence on cut boundaries and set seam crossfade length. Print-only when no flags are passed. |
| `openklip brand <slug> <name>` | Apply a brand preset (`brands/<name>.json`): sets caption/vignette/pad **defaults** only. `project.json` stays the edit; words and overlays are untouched. Also available at ingest: `openklip ingest <video> --brand <name>`. |
| `openklip template list` | List edit templates (`templates/<id>/skill.md`): agent playbooks for cuts, overlays, and export. |
| `openklip template show <id>` | Print a template skill file. Same underlying lookup as the MCP-only `load_skill` tool, which returns a skill's markdown by id without touching `project.json`'s `template` field (unlike `template set`). |
| `openklip template set <slug> <id>` | Attach a template id to `project.json` (GUI template dropdown writes the same field). |

### Review & export

| Command | What it does |
| --- | --- |
| `openklip status <slug>` | Full edit summary: words, ranges, overlays, look, captions, runtime. |
| `openklip status <slug> --json` | Same data as compact JSON (preferred for agents). |
| `openklip ranges <slug> [--json]` | Kept source-time segments after cuts and pad. |
| `openklip overlays <slug> [--json]` | All b-roll, titles, zooms, stills with ids and spans. |
| `openklip cleanup <slug> [--json]` | Filler-word and dead-air cleanup candidates, categorized (`hesitation`/`hedging`/`repeat`/`dead-air`) with risk (`safe`/`review`), reason, and estimated seconds saved. Honors brief **Always cut:** / **Never cut:** lines and optional `project.cuts.cleanupPhrases`. Degrades to filler-only (with a warning) when no audio analysis is available yet. |
| `openklip cleanup <slug> --apply-safe` | Apply every `safe` candidate (cuts filler words, registers dead-air spans) and print what changed. `review` candidates are never auto-applied; apply them individually via `cut`/`dead-air-add` after a human or agent judgment call. |
| `openklip cleanup <slug> --apply-enabled` | Apply every candidate in the enabled categories (`project.cuts.cleanup.categories`) at any risk, plus every dead-air candidate at the configured `minSec` threshold; prints created vs. extended dead-air spans for undo. Iterative by design: a cut can expose new adjacent repeat candidates, so re-running may find more (converges to a fixed point). Category toggles and thresholds (`minSec`, `keepPadSec`) are set via `openklip cleanup-config` or MCP/GUI `cleanup-config`; the CLI reads them (`cleanup --json`) and applies from them. |
| `openklip dead-air-rm <slug> <id>` | Remove a registered dead-air span by id. Also exposed in the GUI Cleanup panel. |
| `openklip export-set <slug>` | Set export aspect ratio and reframe crop on `project.export` (preview/export parity). `--aspect source\|16:9\|9:16\|1:1`, `--crop-mode manual\|scene\|vision`, `--crop-focus-x`, `--crop-focus-y`, `--crop-scale`, `--layout fill\|split-vertical`, `--split-ratio`, `--split-speaker top\|bottom`. |
| `openklip asset-flags <slug> <assetId>` | Set `mustUse` or `avoid` on a registered asset (`--must-use`, `--avoid`, or `--clear`). Avoid wins if both are set. |
| `openklip vision-focus <slug>` | On macOS, sample ingest frames with Apple Vision (face, saliency fallback, OCR text) and write `focusX`/`focusY` onto speaker `sceneLog` segments. GUI: Reframe **Vision focus** button. |
| `openklip highlights <slug> [--json]` | List LLM highlight clip candidates stored on `project.highlights`. |
| `openklip highlights-detect <slug>` | Run an LLM over the timed transcript to detect short-form clip spans. `--agent`, `--max-clips` (default 5), `--target-sec` (default 45). Persists `project.highlights`. |
| `openklip export-highlight <slug> <h1|all>` | Export one or all highlight clips to `output/highlights/{id}.mp4` using `sourceSpan` (no word cuts). `--platform shorts` fills 9:16 export defaults. |
| `openklip export <slug>` | Render the current cut to `out.mp4`. `--height 1080` for max output height, `--fps <n>` for output frame rate (1–120), `--compression studio\|social\|web\|web-low` for encoder preset (default `social`), `--format mp4\|gif` for output container (default `mp4`; `gif` runs a second ffmpeg pass, drops the audio track, and is capped at 960px width / 15fps / 300s kept duration, throwing before any ffmpeg work runs if the cut's kept duration exceeds the cap), `--gif-max-width <px>` to raise the GIF width cap for this export only (integer, 1 to 1920; ignored for `mp4`), `--platform youtube\|youtube-4k\|x\|linkedin\|shorts` for a named destination preset (fills any of aspect/compression/fps/height/loudness left unset by the flags above; explicit flags always win; `maxHeight` never upscales past the source), `--aspect <id>` and `--crop-focus-x`/`--crop-focus-y`/`--crop-scale` for one-off reframe overrides, `--loudness <lufs>` (-30..-10) to set or override the export's loudness normalization target for this export only (never mutates `project.audio.loudness`). |
| `openklip verify <slug>` | The verify loop: re-transcribe `output/out.mp4` with the same Whisper path used at ingest and diff it against the EDL. Flags filler that survived, deleted words that leaked back in, and low kept-word coverage (clipped words). Exits non-zero on drift. Requires an export. Also the `verify` agent tool. |
| `openklip doctor [slug]` | Health check: ffmpeg/ffprobe binaries, Whisper script, and (with a slug) the project's `project.json`, source/proxy media, and asset proxies. Exits non-zero if any check fails. Run it when the agent loop fails deep inside a subprocess. |
| `openklip revert <slug> --to <rev>` | Restore `project.json` to an earlier logged revision (needs a snapshot in `working/history/`; snapshots are kept for the newest 100 revisions). |
| `openklip revert <slug> --task <taskId> [--force]` | Restore to just before the given task's earliest logged entry. Refuses if a foreign revision-bumping entry would also be discarded; pass `--force` to accept the loss. |
| `openklip revert <slug> --last` | Undo the most recent logged edit (the newest revision-bumping entry). |
| `openklip history <slug> [--limit N] [--task <id>] [--action <name>] [--actor <name>]` | Action history log, newest first, plus which revisions have a revert snapshot. `--limit` defaults to 50 (max 200); `--task`/`--action`/`--actor` filter to one agent task, action name, or actor (`human\|agent\|cli\|mcp\|system`), combining with AND semantics. Prints a distinct message when a filter matches nothing versus when the project genuinely has no history yet. |
| `openklip tasks <slug> [--limit N] [--status <status>] [--actor <name>]` | Agent task records, newest first: id, status, start time, request text. `--limit` defaults to 20 (max 100); `--status` filters to one of `pending\|running\|blocked\|failed\|completed\|cancelled`; `--actor` filters to `human\|agent\|cli\|mcp\|system`, combining with `--status` (AND semantics). Tasks created before the actor field existed have no recorded actor and are not matched by `--actor`. |
| `openklip ingesters` | List ingester plugins (`ingesters/<id>/ingester.json`): declarative seams for non-file media import (URL, batch, etc.). |
| `openklip features` | **Product capabilities:** human-facing feature catalog from `src/features.ts` with surfaces and links to tools/actions. `--json`; `--group <id>`; `--surface cli\|gui\|mcp`. |
| `openklip actions` | **Mutations only:** every `project.json` edit action (cut, broll, title, zoom, still, captions, look, pad, reorder). `--json` emits JSON Schema (`inputSchema` shape). |
| `openklip tools` | **Full agent surface:** query tools (`transcript_grep`, `project_status`, …), registry mutations, phrase-add helpers, and `export`. Same manifest the MCP server exposes. `--json`; `--surface mcp` filters. |
| `openklip mcp` | Start the MCP stdio server (`src/mcp-server.ts`). Cursor: `.cursor/mcp.json` in repo root. Set `OPENKLIP_PROJECTS_ROOT` in the server env if projects live outside the repo. |
| `openklip package <slug> <pass>` | Optional post-export pass on `output/out.mp4` via the HyperFrames CLI: `remove-background` (→ transparent `.webm`, the matte primitive for embed-behind-subject) or `transcribe` (→ `.srt`). Uses the local `node_modules/.bin/hyperframes` if installed (`bun add -d hyperframes`); runs Chrome + our bundled ffmpeg. Fails with install instructions if absent. |

## Recommended workflow

1. **Discover.** `openklip list` to pick a project, or `openklip ingest <video>` / `openklip ingest --blank` to create one. Re-ingest requires `--force` (wipes the project).
2. **Read first.** `openklip transcript grep <slug> "phrase"` or `transcript phrase` for spans; use full `transcript` only on short clips. `openklip status <slug> --json` for edit health.
3. **Decide cuts.** Identify filler, false starts, and tangents. Prefer cutting whole sentences, not single words.
4. **Edit.** `openklip cut <slug> w12-w20` (or `--text "the part to remove"`). Add overlays with `broll-add`, `title-add`, `zoom-add`. Patch with `*-set` commands. Toggle look with `look` and `captions`.
5. **Check.** `openklip status <slug>`: confirm runtime, overlay ids, and range count look right.
6. **Export.** `openklip export <slug>` when the cut is good.

## MCP (Cursor, Claude Desktop, Codex)

All MCP tools route through `src/agent-tools.ts` → `mutateProject` / `runAction` / query helpers. The browser GUI writes the same `project.json` and live-syncs external MCP edits via revision poll.

The tool-calling edit prompt (`buildEditPrompt` in `src/agent-driver.ts`) advertises a skill index built from `listTemplates()`: each entry's id and description (capped at 20, with a "more skills are listed by template_list" note beyond that), so the model can spot a matching skill and call `load_skill` with its id to read the full procedure, instead of needing a human to have already run `template set`. `templates/<id>/skill.md` files may carry optional YAML frontmatter (`description:`, `label:`/`name:`) to control what shows up in that index and in `template_list`/`openklip template list`; without frontmatter, the description falls back to the first non-heading body line and the label to the H1.

**Enable in Cursor:** the repo ships `.cursor/mcp.json`. Restart MCP or reload the window after pulling.

**Tool layers:**

| Layer | MCP tool names | Same as CLI |
| --- | --- | --- |
| Query | `list_projects`, `blank_ingest`, `transcript_grep`, `transcript_phrase`, `scene_log`, `highlights_list`, `highlights_detect`, `project_status`, `project_overlays`, `cleanup_report`, `moment_search`, `history_list`, `task_list`, `template_list`, `features_list`, `graphic_list`, `graphic_show`, `load_skill`, `music_bpm`, `audio_measure`, `doctor`, `broll_suggest`, `list_cams`, … | `openklip transcript grep`, `status --json`, `overlays --json`, `highlights`, `highlights-detect`, `cleanup --json`, `openklip search`, `openklip history`, `openklip tasks`, `openklip template list`, `openklip features`, `openklip ingest --blank`, `openklip graphic list`, `openklip bpm`, `openklip audio measure`, `openklip doctor`, `openklip broll-suggest`, `openklip cams` |
| Mutate | `cut`, `cut-text`, `broll-add`, `title-set`, `word-text`, `dead-air-add`, `dead-air-rm`, `audio`, `captions-style`, `captions-inset`, `cleanup-config`, `cleanup-apply`, `take_add`, `cam_add`, `cam_set`, `cam_mix`, `cam_override`, … | `openklip cut`, `broll-add`, `word-text`, `dead-air-rm`, `audio`, `captions-style`, `captions-inset`, `openklip cleanup-config`, `openklip cleanup --apply-safe`/`--apply-enabled`, `openklip take-add`, `openklip cam-add`, `openklip cam-set`, `openklip cam-mix`, `openklip cam-override`, … |
| Phrase compose | `title-add-phrase`, `zoom-add-phrase`, `broll-add-phrase`, `graphic-add-phrase` | `openklip title-add-phrase`, … |
| Brief | `brief_get`, `brief_set`, `brief_audit` | `openklip brief`, `openklip brief --set`, `openklip brief --audit` |
| Agent task progress | `task_step`, `task_complete` | no CLI equivalent: scoped to the running agent's own task via `OPENKLIP_TASK_ID` |
| Revert | `revert` | `openklip revert` |
| Render | `export` (accepts `format`, `gifMaxWidth`, `platform`, `loudnessTargetLufs`, and `loudnessNormalize`), `export_highlight` | `openklip export --format --gif-max-width --platform --loudness`, `openklip export-highlight` |

**Inspect the manifest:** `openklip tools --json --surface mcp`

**Deferred MCP surface (default):** at connect the server enables a **core** edit-loop set (~28 tools: status, transcript, cut, export, brief, tasks, revert, …) plus three meta tools: `tools_catalog` (name/summary search), `tools_load` (enable deferred tools / groups so full schemas appear), and `tools_invoke` (call any tool by name without loading its schema). Overlay/look/multicam/cleanup tools stay registered but disabled until loaded. Set `OPENKLIP_MCP_SURFACE=all` to enable every tool at connect (the in-app tool-calling agent does this automatically). Groups for `tools_load`: `overlays`, `look`, `cleanup`, `assets`, `multicam`, `export`, `search`, `core`.

**Parity rule:** every registry action with `surfaces` including `mcp` is an MCP tool with `{ slug, … }` input. Query tools use snake_case names; mutations keep registry kebab-case names (`broll-add`).

**Optional skills package:** `skills/` ships `SKILL.md` playbooks installable via `npx skills add <owner>/openklip --skill openklip-motion-canvas` (see `skills/README.md`). Same content as `templates/<id>/skill.md`; MCP `load_skill` works without installing.

**Browser integration tests:** `tests/json-graphic-browser.test.ts`, `tests/transcript-diff-browser.test.ts`, and `tests/mobile-overlays-browser.test.ts` skip unless `OPENKLIP_INTEGRATION=1` and Chrome are present. Run with `OPENKLIP_INTEGRATION=1 bun test tests/mobile-overlays-browser.test.ts` (set `OPENKLIP_CHROME_PATH` when needed). CI runs them in the `integration` job.

## External generative media (optional)

OpenKlip does **not** bundle cloud image/video/TTS APIs. Generate media with any external tool (Egaki, Runway, Kling, xAI Grok Voice, ElevenLabs, your own scripts), then import into the edit loop:

1. Save the file under `projects/<slug>/assets/` (or register from elsewhere).
2. `openklip asset-add <slug> <file> --kind broll|music|still` or `openklip broll <slug> <file>`.
3. Place with `broll-add`, `broll-add-phrase`, or a music bed with `music-add`.
4. Run `openklip bpm <slug> <musicAssetId>` when beat-syncing motion graphics (`--beats` on `graphic-add`).

The EDL stays local; external tools are optional upstream suppliers, not dependencies.

### Settings integrations (GUI)

Settings → **Integrations** stores optional provider API keys in repo-local `.openklip/integrations.json` (POSIX mode `0600`, never returned to the client). Three providers ship today:

| Provider | Settings label | Server module | Test endpoint | Details |
| --- | --- | --- | --- | --- |
| ElevenLabs | ElevenLabs | `setElevenLabsApiKey`, `testElevenLabsApiKey`, `fetchElevenLabsDetails` | `GET https://api.elevenlabs.io/v1/user` | Tier, character quota, model count, voice slots |
| Reve | Reve | `setReveApiKey`, `testReveApiKey` | Validation-order POST (no credits) | Test only today |
| xAI | Grok Voice | `setXaiApiKey`, `testXaiApiKey`, `fetchXaiVoiceDetails`, `readXaiApiKey` | `GET https://api.x.ai/v1/tts/voices` | Key name/flags, built-in voices, custom voices (403 tolerated) |

HTTP surface (Next.js, same-origin from the settings panel):

- `GET /api/integrations` → `{ elevenLabs, reve, xai }` status objects (`hasApiKey`, masked `keyPreview`, `updatedAt`)
- `PUT /api/integrations` body `{ elevenLabsApiKey? | reveApiKey? | xaiApiKey? }` → updated status
- `POST /api/integrations` body `{ provider?, …ApiKey? }` → `{ provider: IntegrationTestResult }`
- `DELETE /api/integrations?provider=elevenLabs|reve|xai` → cleared status
- `GET /api/integrations/details?provider=xai` → `{ xai: XaiVoiceDetails }` (default ElevenLabs when omitted)

**Known gap:** keys are stored and validated only. No ingest, export, or MCP tool calls TTS or Reve image generation yet. Agents should still import generated files through `asset-add` / `broll`.

## Agent loop

OpenKlip ships no LLM. An external agent (Claude Code, Codex, Cursor, Grok) drives the loop:

```
read  → openklip list / status --json / transcript grep / overlays
plan  → decide phrases, spans, overlays (agent judgment)
act   → openklip cut / broll-add / zoom-add / …
verify→ openklip status
done  → openklip export
```

**Demo scripts** (deterministic, no LLM):

`agent-demo`: cuts a phrase list and optionally exports.

```bash
bun run agent-demo <slug> --phrases scripts/example-phrases.txt
bun run agent-demo <slug> --all "you know" "sort of" --export
bun run agent-demo <slug> --phrases phrases.txt --dry-run   # preview only
```

`agent-make-short`: derives a vertical short from an existing edit (sets 9:16 reframe, exports with the shorts platform preset, verifies). Trimming to a target runtime is not auto-applied; trim with `cut` first when needed.

```bash
bun run agent-make-short <slug>
bun run agent-make-short <slug> --max-sec 60       # warn if over 60s
bun run agent-make-short <slug> --dry-run          # preview settings only
bun run agent-make-short <slug> --skip-export      # reframe only, no render
```

`agent-smoke-audit`: deterministic agent-loop smoke (no LLM). CI runs the lavfi fixture; `--real` audits `edgaras-raw` when present; `--revise` runs the revise-draft cut/title/revert loop; `--all` runs both fixtures plus revise.

```bash
bun run agent-smoke-audit
bun run agent-smoke-audit --real    # skip gracefully when edgaras-raw absent
bun run agent-smoke-audit --revise
bun run agent-smoke-audit --all
```

`cam-devex-smoke`: deterministic lavfi twin-cam mix plus locked override (`tests/cam-devex-smoke.test.ts` in the suite).

```bash
bun run cam-devex-smoke
```

## Editing guardrails

- **Cut whole sentences, not single words.** Removing one word mid-sentence usually leaves an audible jump; cut the full thought.
- **Keep b-roll spans short**: roughly 2–6 seconds. Long covers hide the speaker and feel like a different video.
- **Captions are on by default.** Only turn them off if the project explicitly shouldn't have them.
- **Never hand-edit `project.json`** when a command exists for the change. The commands validate the schema and keep the GUI in sync; manual edits can desync or corrupt the file.
- After cutting, run `openklip status` before `openklip export` so you don't render an empty or near-empty cut.
- Run `openklip assets <slug>` before `broll-add` so you have valid asset ids.
- The editor live-syncs external CLI/MCP edits via a 2s revision poll (and on focus). Prefer one writer at a time (CLI or GUI server) to avoid concurrent-process races on `project.json`.
- Server-side `project.json` writes serialize per-slug in-process (`mutateProject`). Concurrent **processes** (CLI + running server) can still race; prefer one writer at a time.

## Context at session start

When working on a project, gather state before editing:

```
openklip list                          # which projects exist
openklip status <slug>                 # current edit health + overlay ids
openklip transcript grep <slug> "phrase"  # bounded read (prefer over full dump)
openklip status <slug> --json             # edit health + overlay ids
openklip overlays <slug> --json           # structured overlay list
openklip assets <slug>                 # b-roll asset ids (if adding b-roll)
```

The agent and the GUI share the same `projects/` directory.

---

# Project rules

## No em dashes

Do **not** use the em dash character (U+2014) anywhere in this project.

This applies to:

- README, AGENTS.md, TODO.md, CHANGELOG.md, and other docs
- User-facing UI strings (labels, tooltips, errors, assistant hints)
- GitHub release notes and commit messages when writing project copy

Use instead:

- **Colon** for title: detail (`Agent-native video toolchain: CLI edit loop`)
- **Comma** or **period** for clause breaks
- **Hyphen** `-` only for compound words and flags (not as a sentence dash)

En dashes (`–`) for numeric ranges (e.g. `2-6 seconds`) are fine; em dashes are not.

## README policy

**README = what exists in code today.** Philosophy and principles should describe implemented behavior. Roadmap, aspirations, and post-MVP items belong in **TODO.md** only.

---

# Ultracite code standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

### Documentation

- Add comments for complex logic, but prefer self-documenting code
- **No em dashes** in docs, UI copy, release notes, or user-visible strings (see above)

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code
7. **No em dashes** - Do not use U+2014 in docs, UI copy, or release notes

Run `bun x ultracite fix` before committing to ensure compliance.

---

## Cursor Cloud specific instructions

Durable, non-obvious notes for cloud agents. The startup update script already runs `bun install`. Standard commands live in `package.json` scripts (`dev`, `build`, `start`, `serve`, `test`, `typecheck`, `check`, `ci`) and are documented above; only the caveats below are worth remembering.

### Runtime (node 24 must beat the default node)

- The VM ships an older `node` at `/exec-daemon/node` (v22) that sits ahead of nvm on `PATH`. OpenKlip needs `node >= 24`. A fresh login shell fixes this: `~/.bashrc` prepends the nvm node 24 bin dir so `node --version` reports v24 in new shells.
- `bun` (>= 1.3.14, matches `packageManager`) is installed at `~/.bun/bin` and is on `PATH` via `~/.bashrc`.
- If `node --version` ever shows v22 in a reused shell session, prepend node 24 yourself: `export PATH="$(dirname "$(nvm which 24)"):$PATH"`. This matters because the Whisper transcription subprocess is spawned as a bare `node` (`src/ingest.ts`, `src/verify.ts`), so ingest/verify pick up whatever `node` is first on `PATH`.

### Projects root

- On Linux the default projects dir (`~/Movies/OpenKlip`) does not exist. Set `OPENKLIP_PROJECTS_ROOT` to a writable path (e.g. `~/openklip-projects`) for any CLI command or the dev/serve server. See `README.md` "The file model" for resolution order.

### Running the web GUI

- `bun run dev` serves the Next.js editor on port 4399. Start it with `OPENKLIP_PROJECTS_ROOT` exported in its environment. Open a project editor directly at `http://localhost:4399/<slug>`; the `/home` landing page can render only the logo until a project exists, so prefer opening `/<slug>`.
- Export from the browser writes to `<projectsRoot>/<slug>/output/out.mp4`, the same path the CLI `export` uses (CLI and GUI share `project.json`).

### Media pipeline / first ingest

- `ffmpeg`/`ffprobe` come from the npm deps `ffmpeg-static`/`ffprobe-static` (no system install needed); `openklip doctor` verifies them.
- The first `openklip ingest` downloads the Whisper model `Xenova/whisper-base.en` from Hugging Face (one-time network fetch), then caches it. Ingesting a clip with no real speech yields a near-empty transcript, and `openklip verify` will report "drift"; that is expected content behavior, not an environment failure.

### Known test flake (not environment-related)

- Bun's `mock.module` leaks across test files in a shared-process run (historically 6 `syncAssetsFromFolder` failures via `tests/project-data.test.ts`; later ffmpeg-stub leakage from `tests/cams.test.ts` broke assembly/export smoke tests on CI). Fixed structurally on 2026-07-12: the `test` script and CI now run `bun test --isolate` (fresh global object per test file, ~6s overhead on a ~38s suite). If you invoke `bun test` directly without `--isolate`, cross-file mock leakage can still produce phantom failures - use `bun run test`.

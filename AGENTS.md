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

**`project.json` IS the edit.** It holds every transcribed word with a `deleted` flag, b-roll overlays, still (Ken Burns) overlays, push-in zooms, title cards, graphics (HTML/CSS template overlays), music placements, captions settings, and look flags. Everything under `working/` and `output/` is regenerated from it. The GUI editor and these CLI commands both read and write this same file; they are **equivalent (parity)**. Edit it through the CLI; the browser editor will show the same result, and vice-versa.

**Action history.** Every user-facing mutation (GUI, CLI, MCP) appends one entry to `working/actions.jsonl`: an append-only log with action name, actor (`human|agent|cli|mcp|system`), truncated input/result summaries, timestamp, and the `project.json` `revision` counter before and after (bumped inside the write lock). This covers registry actions, GUI direct-save paths, asset registration/deletion, `template set`, `brand`/`ingest --brand`, and multi-take `assemble` (which now writes through `mutateProject` instead of a raw file write, so it no longer resets the revision counter); background folder-sync prune logs `asset-prune` under the `system` actor. Read it via `GET /api/projects/<slug>/history`, the History section in the Config panel, `openklip history <slug> [--limit] [--task] [--action]`, or the MCP `history_list` tool. Set `OPENKLIP_ACTOR` in the environment to attribute GUI-spawned agent edits as `agent`. Brief saves from CLI, GUI, and MCP all write one best-effort `brief-set` history entry with the same revision before and after, because `brief.md` is not part of the EDL. Log entries carry an optional `taskId` (from `OPENKLIP_TASK_ID`) grouping an agent run's edits.

**Snapshots and revert.** Every logged mutation writes the project state from just before the change to `working/history/rev-<revisionBefore>.json` (atomic, best-effort, pruned to the newest 100 revisions). `openklip revert <slug> (--to <rev> | --task <taskId> | --last) [--force]` restores the project to an earlier snapshot as a normal logged `revert` mutation, so the revision counter stays monotonic and a revert is itself revertible. `--task` restores to just before that task's earliest entry and refuses without `--force` if a foreign revision-bumping entry (including one interleaved between the task's own) would also be discarded. A revert refuses to cross a multi-take `assemble` boundary, since the snapshot's source no longer matches the media on disk. Revert restores `project.json` only, not `brief.md`, chats, tasks, asset files, or derived media (proxy, extracted audio, transcript). Also available as the MCP `revert` tool and per-entry/per-task "Revert" in the GUI History panel.

**Agent tasks.** Every tool-calling chat edit gets a visible, persisted task in `working/tasks.json` (`src/agent-tasks.ts`): id, request, status (`pending|running|blocked|failed|completed|cancelled`), a step list with per-step status and notes, and start/complete timestamps. The running agent reports its own progress with the `task_step` and `task_complete` MCP tools, which resolve the active task from the `OPENKLIP_TASK_ID` environment variable set on the spawned process, never from tool input, so an agent can only touch the one task it was spawned for. The chat panel's task progress card polls `GET /api/projects/<slug>/tasks` every 2 seconds while a task is running; its cancel button `POST`s `{ action: "cancel", taskId }` to the same route, which best-effort kills the live process and marks the task cancelled. Tool-calling edit runs get a 900-second budget (`runClaudeEdit`'s `timeoutMs`) so a full draft (cuts, overlays, music, export, verify) doesn't get killed mid-run; a run that exits without calling `task_complete` is finalized as failed (with a distinct timeout message) or completed as a fallback. Any agent can list past task records with `openklip tasks <slug> [--limit] [--status]` or the MCP `task_list` tool, without needing the task id from context.

Time is integer audio samples at 48 kHz. The CLI takes seconds where a human number is natural (overlay spans) and converts for you.

## Capability map

| User action (GUI) | Agent command |
| --- | --- |
| List projects | `openklip list` |
| Ingest a video | `openklip ingest <video> [--force]` |
| Open editor | `openklip serve [slug]` (alias `dev`) |
| Read / write the project brief | `openklip brief <slug> [--set <text...> \| --file <path>]` |
| Read transcript (full) | `openklip transcript <slug>` |
| Grep transcript | `openklip transcript grep`, `span`, `phrase` |
| Review edit (JSON) | `openklip status <slug> --json`, `ranges`, `overlays` |
| Cut / restore words | `openklip cut`, `openklip restore` |
| Correct one word's transcript text | `openklip word-text <slug> <wordId> <text...>` |
| Read filler/dead-air cleanup candidates | `openklip cleanup <slug> [--json]` |
| Apply safe cleanup candidates | `openklip cleanup <slug> --apply-safe` |
| Remove a registered dead-air span | `openklip dead-air-rm <slug> <id>` |
| Register b-roll file | `openklip broll <slug> <file>` |
| Register a still or music asset | `openklip asset-add <slug> <file> --kind still\|music` |
| List b-roll assets | `openklip assets <slug>` |
| Describe media (subagents) | `openklip analyze <slug>` |
| Place / patch / remove b-roll | `openklip broll-add`, `broll-set`, `broll-rm`, `broll-add-phrase` |
| Place / patch / remove still (Ken Burns) | `openklip still-add`, `still-set`, `still-rm` |
| Place / patch / remove music placement | `openklip music-add`, `music-set`, `music-rm` |
| Place / patch / remove graphic (HTML/CSS template) | `openklip graphic-add`, `graphic-set`, `graphic-rm` |
| Add / patch json-render graphic (product announcement) | `openklip json-graphic-add`, `json-graphic-set` |
| Place / patch / remove title | `openklip title-add`, `title-set`, `title-rm`, `title-add-phrase` |
| Add / patch / remove zoom | `openklip zoom-add`, `zoom-set`, `zoom-rm`, `zoom-add-phrase` |
| Reorder overlay (paint order) | `openklip reorder <slug> <broll\|title\|zoom> <id> <toIndex>` |
| Ingest an alternate take | `openklip take-add <slug> <video> [--id <takeId>] [--label <text>]` |
| List ingested takes | `openklip takes <slug>` |
| Splice takes into a new source | `openklip assemble <slug> <takeId:wStart-wEnd> [more...]` |
| Apply brand preset (look defaults) | `openklip brand <slug> <name>` |
| Set edit template (agent skill) | `openklip template set <slug> <id>` |
| List / show edit templates | `openklip template list`, `openklip template show <id>` |
| Toggle captions | `openklip captions <slug> on\|off` |
| Caption line length | `openklip captions-max <slug> <n>` |
| Caption look preset | `openklip captions-style <slug> <boxed\|clean\|karaoke\|bold-caps\|minimal>` |
| Toggle vignette | `openklip look <slug> vignette on\|off` |
| Set animation feel | `openklip motion <slug> --speed <n>` |
| Set color grade | `openklip look <slug> grade <name>` |
| Fine-tune the grade (color knobs) | `openklip look <slug> color --temp 0.15 --contrast 0.96 --sat 0.84` |
| Apply a LUT (.cube) | `openklip look <slug> lut <name>` |
| List available LUTs | `openklip luts` |
| Set export audio quality (ducking / loudness / highpass) | `openklip audio <slug> [--duck on\|off] [--loudness on\|off] [--highpass on\|off]` |
| Cut boundary padding | `openklip pad <slug> <ms>` |
| Review edit | `openklip status <slug>` (`--json` for agents) |
| Kept ranges / overlays | `openklip ranges <slug>`, `openklip overlays <slug>` |
| Check environment / project health | `openklip doctor [slug]` |
| Revert to an earlier revision, a task's start, or the last edit | `openklip revert <slug> (--to <rev> \| --task <id> \| --last) [--force]` |
| Read action history (newest first) | `openklip history <slug> [--limit] [--task] [--action]` |
| List agent task records (newest first) | `openklip tasks <slug> [--limit] [--status]` |
| List ingester plugins | `openklip ingesters` |
| List the action registry (mutations only) | `openklip actions` |
| List all agent tools (query + mutate + export) | `openklip tools` |
| MCP server (stdio) | `openklip mcp` or `bun run mcp` |
| Export MP4 | `openklip export <slug>` |
| Set export aspect and reframe crop | `openklip export-set <slug> [--aspect source\|16:9\|9:16\|1:1] [--crop-mode manual\|scene] [--crop-focus-x <0-1>] [--crop-focus-y <0-1>] [--crop-scale <1-3>]` |
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
| `openklip analyze <slug> [--agent <model>]` | One "understand my media" pass: fan out one subagent per un-described asset (b-roll, stills) to write an "asset card", and (if absent) one subagent over the main video's ingest frames to write a `sceneLog` on `project.json` (what is on screen, b-roll opportunities). Idempotent: only missing work runs. |
| `openklip brief <slug>` | Print the project brief (`brief.md`), or a hint if none exists yet. |
| `openklip brief <slug> --set <text...>` | Replace the brief with the given text (empty text clears it). |
| `openklip brief <slug> --file <path>` | Replace the brief with a file's content. |

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
| `openklip graphic-add <slug> <template> <fromSec> <toSec>` | Overlay an HTML/CSS graphic template. `--param key=value` (repeatable), `--track broll\|title\|zoom` (z-layer). Text templates (`kind: "text"`) render via ASS and stay browser-free; rich templates (`kind: "rich"`) render pixel-faithfully through headless Chrome to a transparent ProRes 4444 MOV (install once: `bunx puppeteer browsers install chrome-headless-shell`). |
| `openklip graphic-set <slug> <graphicId>` | Patch a graphic: `--template`, `--from`, `--to`, `--param`, `--track`. |
| `openklip graphic-rm <slug> <graphicId>` | Remove a graphic overlay. |
| `openklip json-graphic-add <slug> product-announcement <fromSec> <toSec> --spec-file spec.json` | Add a catalog-constrained json-render graphic (only `product-announcement` today). `--spec-file` is required; `--track broll\|title\|zoom` sets the z-layer. The spec is hard-validated (accent values, size caps, graph cycles, orphans, non-scene root, missing catalog/spec fields) before it persists; the editor previews the same React render and it exports through the normal timeline. See `templates/product-announcement/skill.md`. |
| `openklip json-graphic-set <slug> <graphicId>` | Patch a json-render graphic: `--from`, `--to`, `--spec-file`, `--track`. Shares the same span + spec validation path as `json-graphic-add`. |
| `openklip reorder <slug> <broll\|title\|zoom> <id> <toIndex>` | Restack an overlay within its track. Array order is paint order: a later index paints on top (matters when b-roll covers overlap). |
| `openklip reanchor <slug> [overlayId]` | Re-resolve phrase-anchored overlays onto the current kept words. Reports each overlay as `moved`, `unchanged`, or `stale`. Runs automatically after every word-deletion path (`cut`, `cut --text`, `restore`, GUI word toggles); call it manually only to re-snap after editing the transcript out of band. |

The `*-add-phrase` helpers remember the spoken phrase as an **anchor** on the overlay, so a later cut re-snaps the overlay's window onto the words it belongs to instead of stranding it. If you manually move a phrase-placed overlay with `*-set` (`--from`/`--to`), that span may be re-moved by the next word-deletion (the anchor still wins); place anchorless overlays with the plain `*-add` if you want the span pinned. When the anchored phrase is deleted the overlay is flagged `stale` and keeps its last good span (the exporter still renders it); restoring the words clears `stale`.

### Multi-take assembly

Pick the best lines across several recordings of the same script, then splice them into one clean source the rest of the engine treats normally (single `source`/`proxy`, all overlays/look/captions apply on top).

| Command | What it does |
| --- | --- |
| `openklip take-add <slug> <video>` | Ingest one alternate take into `takes/<id>/` (probe + 720p proxy + Whisper transcript). Takes never enter `project.json`; they are raw material. `--id <takeId>` to name it, `--label <text>` for a human note. |
| `openklip takes <slug>` | List ingested takes with id, duration, and word count. |
| `openklip assemble <slug> <takeId:wStart-wEnd> [more...]` | Splice the chosen word runs end-to-end into a **new** single-source project. `--pad <ms>` is the symmetric seam pad (0–500, default 50); `--force` overwrites an existing edit. Segments are inclusive word-id ranges into each take's own transcript (read them with `take_transcript`). |

Workflow: `take-add` each recording, read `take_transcript <slug> <takeId>` to find the best read of each line, then `assemble` the runs in script order. The planner lays them end-to-end with no gap at the seam and re-ids the merged transcript `w0..` (integer-exact source-sample → output-sample re-timing, so preview and export can't drift). Provenance (where every output span came from in take samples) is written to `project.json`'s `assembly` block. Via the `assemble` agent tool you can attach a per-segment `note` recording **why** that take won the line, and it rides into the provenance for the next pass. The exporter is unchanged: it reads the one assembled `source`. Concat uses an ffmpeg **filter** (not the demuxer) so mismatched takes are normalized to the first take's geometry/fps; the takes stay parked in `takes/` alongside the new source.

### Look & captions

| Command | What it does |
| --- | --- |
| `openklip captions <slug> <on\|off>` | Toggle burned captions for export. |
| `openklip captions-max <slug> <n>` | Words per caption line (1–12). |
| `openklip captions-style <slug> <style>` | Set the caption look preset: `boxed` (default), `clean`, `karaoke`, `bold-caps`, `minimal`. Defined once in `src/caption-styles.ts` and rendered identically by the preview and the ASS export burn-in. An unknown or missing style on `project.json` falls back to `boxed` on load; this command validates and rejects an invalid id. |
| `openklip look <slug> vignette <on\|off>` | Toggle vignette. |
| `openklip motion <slug> [--speed n] [--fade ms] [--hero-fade ms] [--slide frac]` | Global animation feel for overlay entrances (the deck's anim.tsx). `speed` scales every duration, so "make it snappier" is one number (`--speed 1.4`). Titles read it at export (ASS fade + slide). |
| `openklip look <slug> grade <name>` | Set the color grade applied to the whole picture at export: `none`, `neutral`, `warm`, `cool`, `cool_desat`, `filmic`, `punchy`. Expands to a deterministic ffmpeg filter chain. `none` is the default no-op. |
| `openklip look <slug> color [--temp n] [--tint n] [--bright n] [--contrast n] [--sat n] \| --reset` | Continuous color knobs **on top of** the base grade (the deck's "control room"): temperature/tint (colorbalance), then contrast/brightness/saturation (eq), in that order. Each knob defaults to the identity; only the ones you pass change, and an all-neutral result clears `look.color`. `--reset` returns to neutral. The GUI exposes the same knobs as live sliders previewed on a real frame; both write `look.color` through the one `look-color` action. |
| `openklip look <slug> lut <name\|none>` | Apply a named `.cube` LUT from `luts/` (the technical color transform, e.g. log to Rec.709), applied before the grade. `none` clears it. Drop `name.cube` into `luts/`; reference by name so `project.json` stays portable. `openklip luts` lists them. |
| `openklip audio <slug>` | Print current export audio quality settings (ducking, loudness, voice highpass). |
| `openklip audio <slug> [--duck on\|off] [--duck-amount <1-30 dB>] [--duck-attack <1-500 ms>] [--duck-release <20-2000 ms>] [--loudness on\|off] [--loudness-target <-30..-10 LUFS>] [--highpass on\|off] [--highpass-hz <40-200>]` | Patch export audio quality: sidechain-duck the music bed under speech, apply single-pass loudness normalization toward a target LUFS, and/or highpass the voice track. Export-only; preview audio is unprocessed. |
| `openklip pad <slug> <ms>` | Symmetric padding around kept ranges (0–500 ms). |
| `openklip brand <slug> <name>` | Apply a brand preset (`brands/<name>.json`): sets caption/vignette/pad **defaults** only. `project.json` stays the edit; words and overlays are untouched. Also available at ingest: `openklip ingest <video> --brand <name>`. |
| `openklip template list` | List edit templates (`templates/<id>/skill.md`): agent playbooks for cuts, overlays, and export. |
| `openklip template show <id>` | Print a template skill file. |
| `openklip template set <slug> <id>` | Attach a template id to `project.json` (GUI template dropdown writes the same field). |

### Review & export

| Command | What it does |
| --- | --- |
| `openklip status <slug>` | Full edit summary: words, ranges, overlays, look, captions, runtime. |
| `openklip status <slug> --json` | Same data as compact JSON (preferred for agents). |
| `openklip ranges <slug> [--json]` | Kept source-time segments after cuts and pad. |
| `openklip overlays <slug> [--json]` | All b-roll, titles, zooms, stills with ids and spans. |
| `openklip cleanup <slug> [--json]` | Filler-word and dead-air cleanup candidates with risk (`safe`/`review`), reason, and estimated seconds saved. Degrades to filler-only (with a warning) when no audio analysis is available yet. |
| `openklip cleanup <slug> --apply-safe` | Apply every `safe` candidate (cuts filler words, registers dead-air spans) and print what changed. `review` candidates are never auto-applied; apply them individually via `cut`/`dead-air-add` after a human or agent judgment call. |
| `openklip dead-air-rm <slug> <id>` | Remove a registered dead-air span by id. CLI/MCP only; no GUI remove affordance yet. |
| `openklip export-set <slug>` | Set export aspect ratio and manual reframe crop on `project.export` (preview/export parity). `--aspect source\|16:9\|9:16\|1:1`, `--crop-focus-x`, `--crop-focus-y`, `--crop-scale`. |
| `openklip export <slug>` | Render the current cut to `out.mp4`. `--height 1080` for max output height, `--fps <n>` for output frame rate (1–120), `--compression studio\|social\|web\|web-low` for encoder preset (default `social`), `--platform youtube\|youtube-4k\|x\|linkedin\|shorts` for a named destination preset (fills any of aspect/compression/fps/height/loudness left unset by the flags above; explicit flags always win; `maxHeight` never upscales past the source), `--aspect <id>` and `--crop-focus-x`/`--crop-focus-y`/`--crop-scale` for one-off reframe overrides, `--loudness <lufs>` (-30..-10) to set or override the export's loudness normalization target for this export only (never mutates `project.audio.loudness`). |
| `openklip verify <slug>` | The verify loop: re-transcribe `output/out.mp4` with the same Whisper path used at ingest and diff it against the EDL. Flags filler that survived, deleted words that leaked back in, and low kept-word coverage (clipped words). Exits non-zero on drift. Requires an export. Also the `verify` agent tool. |
| `openklip doctor [slug]` | Health check: ffmpeg/ffprobe binaries, Whisper script, and (with a slug) the project's `project.json`, source/proxy media, and asset proxies. Exits non-zero if any check fails. Run it when the agent loop fails deep inside a subprocess. |
| `openklip revert <slug> --to <rev>` | Restore `project.json` to an earlier logged revision (needs a snapshot in `working/history/`; snapshots are kept for the newest 100 revisions). |
| `openklip revert <slug> --task <taskId> [--force]` | Restore to just before the given task's earliest logged entry. Refuses if a foreign revision-bumping entry would also be discarded; pass `--force` to accept the loss. |
| `openklip revert <slug> --last` | Undo the most recent logged edit (the newest revision-bumping entry). |
| `openklip history <slug> [--limit N] [--task <id>] [--action <name>]` | Action history log, newest first, plus which revisions have a revert snapshot. `--limit` defaults to 50 (max 200); `--task`/`--action` filter to one agent task or action name. Prints a distinct message when a filter matches nothing versus when the project genuinely has no history yet. |
| `openklip tasks <slug> [--limit N] [--status <status>]` | Agent task records, newest first: id, status, start time, request text. `--limit` defaults to 20 (max 100); `--status` filters to one of `pending\|running\|blocked\|failed\|completed\|cancelled`. |
| `openklip ingesters` | List ingester plugins (`ingesters/<id>/ingester.json`): declarative seams for non-file media import (URL, batch, etc.). |
| `openklip actions` | **Mutations only:** every `project.json` edit action (cut, broll, title, zoom, still, captions, look, pad, reorder). `--json` emits JSON Schema (`inputSchema` shape). |
| `openklip tools` | **Full agent surface:** query tools (`transcript_grep`, `project_status`, …), registry mutations, phrase-add helpers, and `export`. Same manifest the MCP server exposes. `--json`; `--surface mcp` filters. |
| `openklip mcp` | Start the MCP stdio server (`src/mcp-server.ts`). Cursor: `.cursor/mcp.json` in repo root. Set `OPENKLIP_PROJECTS_ROOT` in the server env if projects live outside the repo. |
| `openklip package <slug> <pass>` | Optional post-export pass on `output/out.mp4` via the HyperFrames CLI: `remove-background` (→ transparent `.webm`, the matte primitive for embed-behind-subject) or `transcribe` (→ `.srt`). Uses the local `node_modules/.bin/hyperframes` if installed (`bun add -d hyperframes`); runs Chrome + our bundled ffmpeg. Fails with install instructions if absent. |

## Recommended workflow

1. **Discover.** `openklip list` to pick a project, or `openklip ingest <video>` to create one. Re-ingest requires `--force` (wipes the project).
2. **Read first.** `openklip transcript grep <slug> "phrase"` or `transcript phrase` for spans; use full `transcript` only on short clips. `openklip status <slug> --json` for edit health.
3. **Decide cuts.** Identify filler, false starts, and tangents. Prefer cutting whole sentences, not single words.
4. **Edit.** `openklip cut <slug> w12-w20` (or `--text "the part to remove"`). Add overlays with `broll-add`, `title-add`, `zoom-add`. Patch with `*-set` commands. Toggle look with `look` and `captions`.
5. **Check.** `openklip status <slug>`: confirm runtime, overlay ids, and range count look right.
6. **Export.** `openklip export <slug>` when the cut is good.

## MCP (Cursor, Claude Desktop, Codex)

All MCP tools route through `src/agent-tools.ts` → `mutateProject` / `runAction` / query helpers. The browser GUI writes the same `project.json`; reload the editor after MCP edits.

**Enable in Cursor:** the repo ships `.cursor/mcp.json`. Restart MCP or reload the window after pulling.

**Tool layers:**

| Layer | MCP tool names | Same as CLI |
| --- | --- | --- |
| Query | `list_projects`, `transcript_grep`, `transcript_phrase`, `scene_log`, `project_status`, `project_overlays`, `cleanup_report`, `history_list`, `task_list`, … | `openklip transcript grep`, `status --json`, `overlays --json`, `cleanup --json`, `openklip history`, `openklip tasks` |
| Mutate | `cut`, `cut-text`, `broll-add`, `title-set`, `word-text`, `dead-air-add`, `dead-air-rm`, `audio`, `captions-style`, … | `openklip cut`, `broll-add`, `word-text`, `dead-air-rm`, `audio`, `captions-style`, … |
| Phrase compose | `title-add-phrase`, `zoom-add-phrase`, `broll-add-phrase` | `openklip title-add-phrase`, … |
| Brief | `brief_get`, `brief_set` | `openklip brief`, `openklip brief --set` |
| Agent task progress | `task_step`, `task_complete` | no CLI equivalent: scoped to the running agent's own task via `OPENKLIP_TASK_ID` |
| Revert | `revert` | `openklip revert` |
| Render | `export` (accepts `platform` and `loudnessTargetLufs`) | `openklip export --platform --loudness` |

**Inspect the manifest:** `openklip tools --json --surface mcp`

**Parity rule:** every registry action with `surfaces` including `mcp` is an MCP tool with `{ slug, … }` input. Query tools use snake_case names; mutations keep registry kebab-case names (`broll-add`).

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

## Editing guardrails

- **Cut whole sentences, not single words.** Removing one word mid-sentence usually leaves an audible jump; cut the full thought.
- **Keep b-roll spans short**: roughly 2–6 seconds. Long covers hide the speaker and feel like a different video.
- **Captions are on by default.** Only turn them off if the project explicitly shouldn't have them.
- **Never hand-edit `project.json`** when a command exists for the change. The commands validate the schema and keep the GUI in sync; manual edits can desync or corrupt the file.
- After cutting, run `openklip status` before `openklip export` so you don't render an empty or near-empty cut.
- Run `openklip assets <slug>` before `broll-add` so you have valid asset ids.
- Reload the browser after CLI edits to see changes in the editor.
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

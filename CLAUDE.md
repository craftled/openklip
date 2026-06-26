# OpenKlip - agent skill

OpenKlip is a local-first, agent-native video editor: you **edit video by editing text**.

## The file model (read this first)

Each project lives as plain files under `projects/<slug>/` in a layered layout:

```
projects/<slug>/
  project.json            the EDL - the edit itself (the only file you edit)
  working/                derived media + scratch: proxy.mp4, transcript.json,
                          audio16k.f32, frames/, assets/, captions.ass…
  output/out.mp4          the rendered export
```

**`project.json` IS the edit.** It holds every transcribed word with a `deleted` flag, b-roll overlays, still (Ken Burns) overlays, push-in zooms, title cards, captions settings, and look flags. Everything under `working/` and `output/` is regenerated from it. The GUI editor and these CLI commands both read and write this same file; they are **equivalent (parity)**. Edit it through the CLI; the browser editor will show the same result, and vice-versa.

Time is integer audio samples at 48 kHz. The CLI takes seconds where a human number is natural (overlay spans) and converts for you.

## Capability map

| User action (GUI) | Agent command |
| --- | --- |
| List projects | `openklip list` |
| Ingest a video | `openklip ingest <video>` |
| Open editor | `openklip serve [slug]` |
| Read transcript | `openklip transcript <slug>` |
| Cut / restore words | `openklip cut`, `openklip restore` |
| Register b-roll file | `openklip broll <slug> <file>` |
| List b-roll assets | `openklip assets <slug>` |
| Place / patch / remove b-roll | `openklip broll-add`, `broll-set`, `broll-rm` |
| Place / remove still (Ken Burns) | `openklip still-add`, `still-rm` |
| Add / patch / remove title | `openklip title-add`, `title-set`, `title-rm` |
| Add / patch / remove zoom | `openklip zoom-add`, `zoom-set`, `zoom-rm` |
| Reorder overlay (paint order) | `openklip reorder <slug> <broll\|title\|zoom> <id> <toIndex>` |
| Apply brand preset (look defaults) | `openklip brand <slug> <name>` |
| Toggle captions | `openklip captions <slug> on\|off` |
| Caption line length | `openklip captions-max <slug> <n>` |
| Toggle vignette | `openklip look <slug> vignette on\|off` |
| Cut boundary padding | `openklip pad <slug> <ms>` |
| Review edit | `openklip status <slug>` |
| Check environment / project health | `openklip doctor [slug]` |
| List ingester plugins | `openklip ingesters` |
| Export MP4 | `openklip export <slug>` |
| Post-export packaging (HyperFrames) | `openklip package <slug> <pass>` |

## Commands

Run as `bun run src/cli.ts <command>` (or the `openklip` bin).

### Discovery

| Command | What it does |
| --- | --- |
| `openklip list` | List all projects, most recent first. |
| `openklip assets <slug>` | List registered b-roll assets with ids and durations. |

### Transcript edits

| Command | What it does |
| --- | --- |
| `openklip transcript <slug>` | Print every word as `index  id  mm:ss  text  [cut]`. Read this before editing. |
| `openklip cut <slug> <tokens...>` | Mark words deleted. Tokens are word ids (`w12`) or inclusive ranges (`w12-w20`). |
| `openklip cut <slug> --text "phrase"` | Cut the first contiguous run matching the phrase (case/punctuation-insensitive). |
| `openklip cut <slug> --text "phrase" --all` | Cut **every** matching run (e.g. repeated filler words). |
| `openklip cut <slug> <tokens...> --restore` | Restore the listed words instead of cutting them. |
| `openklip restore <slug>` | Restore every word (clear all cuts). |

### Overlays

| Command | What it does |
| --- | --- |
| `openklip broll <slug> <file>` | Register a b-roll clip (builds preview proxy, returns asset id). |
| `openklip broll-add <slug> <assetId> <fromSec> <toSec>` | Cover a source-time span with a registered asset. |
| `openklip broll-set <slug> <brollId>` | Patch b-roll: `--asset`, `--from`, `--to`, `--src-in` (seconds). |
| `openklip broll-rm <slug> <brollId>` | Remove a b-roll clip. |
| `openklip title-add <slug> <fromSec> <toSec> <text>` | Burn a title card. `--position lower\|center\|hero` (default lower). Use `\n` for two lines. |
| `openklip title-set <slug> <titleId>` | Patch title: `--text`, `--position`, `--from`, `--to`. |
| `openklip title-rm <slug> <titleId>` | Remove a title card. |
| `openklip zoom-add <slug> <fromSec> <toSec>` | Push-in zoom. `--scale 1.15` (1–3), `--ramp 0.6` (0–5 sec). |
| `openklip zoom-set <slug> <zoomId>` | Patch zoom: `--scale`, `--ramp`, `--from`, `--to`. |
| `openklip zoom-rm <slug> <zoomId>` | Remove a push-in zoom. |
| `openklip still-add <slug> <assetId> <fromSec> <toSec>` | Overlay a registered **still** image with a Ken Burns push-in. `--scale 1.2` (1–3), `--focus-x 0.5` / `--focus-y 0.5` (0–1 image coords). |
| `openklip still-rm <slug> <stillId>` | Remove a still overlay. |
| `openklip reorder <slug> <broll\|title\|zoom> <id> <toIndex>` | Restack an overlay within its track. Array order is paint order — a later index paints on top (matters when b-roll covers overlap). |

### Look & captions

| Command | What it does |
| --- | --- |
| `openklip captions <slug> <on\|off>` | Toggle burned captions for export. |
| `openklip captions-max <slug> <n>` | Words per caption line (1–12). |
| `openklip look <slug> vignette <on\|off>` | Toggle vignette. |
| `openklip pad <slug> <ms>` | Symmetric padding around kept ranges (0–500 ms). |
| `openklip brand <slug> <name>` | Apply a brand preset (`brands/<name>.json`) — sets caption/vignette/pad **defaults** only. `project.json` stays the edit; words and overlays are untouched. Also available at ingest: `openklip ingest <video> --brand <name>`. |

### Review & export

| Command | What it does |
| --- | --- |
| `openklip status <slug>` | Full edit summary: words, ranges, overlays, look, captions, runtime. |
| `openklip export <slug>` | Render the current cut to `out.mp4`. `--height 1080` for max output height. |
| `openklip doctor [slug]` | Health check: ffmpeg/ffprobe binaries, Whisper script, and (with a slug) the project's `project.json`, source/proxy media, and asset proxies. Exits non-zero if any check fails. Run it when the agent loop fails deep inside a subprocess. |
| `openklip ingesters` | List ingester plugins (`ingesters/<id>/ingester.json`) — declarative seams for non-file media import (URL, batch, etc.). |
| `openklip package <slug> <pass>` | Optional post-export pass on `output/out.mp4` via the HyperFrames CLI: `remove-background` (→ transparent `.webm`, the matte primitive for embed-behind-subject) or `transcribe` (→ `.srt`). Uses the local `node_modules/.bin/hyperframes` if installed (`bun add -d hyperframes`); runs Chrome + our bundled ffmpeg. Fails with install instructions if absent. |

## Recommended workflow

1. **Discover.** `openklip list` to pick a project, or `openklip ingest <video>` to create one.
2. **Read first.** `openklip transcript <slug>`: see words, ids, times, and what's already cut.
3. **Decide cuts.** Identify filler, false starts, and tangents. Prefer cutting whole sentences, not single words.
4. **Edit.** `openklip cut <slug> w12-w20` (or `--text "the part to remove"`). Add overlays with `broll-add`, `title-add`, `zoom-add`. Patch with `*-set` commands. Toggle look with `look` and `captions`.
5. **Check.** `openklip status <slug>`: confirm runtime, overlay ids, and range count look right.
6. **Export.** `openklip export <slug>` when the cut is good.

## Agent loop

OpenKlip ships no LLM. An external agent (Claude Code, Codex, Cursor) drives the loop:

```
read  → openklip list / status / transcript
plan  → decide phrases, spans, overlays (agent judgment)
act   → openklip cut / broll-add / zoom-add / …
verify→ openklip status
done  → openklip export
```

**Demo script** (deterministic, no LLM): cuts a phrase list and optionally exports.

```bash
bun run agent-demo <slug> --phrases scripts/example-phrases.txt
bun run agent-demo <slug> --all "you know" "sort of" --export
bun run agent-demo <slug> --phrases phrases.txt --dry-run   # preview only
```

## Guardrails

- **Cut whole sentences, not single words.** Removing one word mid-sentence usually leaves an audible jump; cut the full thought.
- **Keep b-roll spans short** — roughly 2–6 seconds. Long covers hide the speaker and feel like a different video.
- **Captions are on by default.** Only turn them off if the project explicitly shouldn't have them.
- **Never hand-edit `project.json`** when a command exists for the change. The commands validate the schema and keep the GUI in sync; manual edits can desync or corrupt the file.
- After cutting, run `openklip status` before `openklip export` so you don't render an empty or near-empty cut.
- Run `openklip assets <slug>` before `broll-add` so you have valid asset ids.

## Context at session start

When working on a project, gather state before editing:

```
openklip list                          # which projects exist
openklip status <slug>                 # current edit health + overlay ids
openklip transcript <slug>             # word ids and cut state
openklip assets <slug>                 # b-roll asset ids (if adding b-roll)
```

The agent and the GUI share the same `projects/` directory. Changes through CLI appear immediately when the user refreshes the browser editor.

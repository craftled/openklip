# OpenKlip

**Edit video by editing text.**

OpenKlip is a local-first, agent-native video editor for talking-head content. You cut filler, place b-roll, add titles and zooms, and export MP4 — by clicking words in a transcript or by running CLI commands an external agent can drive. No database, no cloud, no bundled LLM.

---

## Philosophy

Most video tools treat the timeline as the source of truth. OpenKlip treats the **transcript** as truth: if you can read what was said, you can edit what was kept.

That inversion matters for two audiences:

- **Humans** get a familiar text surface — click a word to cut it, search for a phrase, skim the whole take in seconds.
- **Agents** get a deterministic file loop — read transcript, decide cuts, mutate one JSON document, verify, export. No screen scraping, no proprietary project format.

The editor is a **view** over an edit, not a walled garden. The browser and terminal are peers.

---

## Principles

**Local-first.** Projects are plain folders on disk. Your media never leaves your machine unless you put it there. Transcription runs locally (Transformers.js + Whisper). ffmpeg/ffprobe ship with the repo.

**One edit, one file.** `project.json` is the EDL — words, cuts, asset registry, overlays, captions, look flags. Everything under `working/` and `output/` is **derived** and safe to regenerate. You never hand-edit generated paths to “fix” an edit; you change `project.json` (via GUI or CLI) and re-export.

**CLI ↔ GUI parity.** Every mutation the GUI can make routes through the same action registry the CLI uses. An agent running `openklip cut` sees the same result as a click in the browser after refresh. If a command exists, use it — don’t patch JSON by hand.

**Agent-native, not agent-bundled.** OpenKlip ships no LLM. Cursor, Claude Code, Codex, or your own script drives the loop. The sidebar suggests CLI steps; you (or your agent) run them against the same project files.

**Sample-accurate time.** Edits are stored on a 48 kHz integer-sample grid. Overlays and cuts align to what was actually spoken, not approximate frame boundaries.

**Flat user surface, layered guts.** You drop files into `assets/` and edit `project.json`. Proxies, transcripts, chat history, and scratch files live under `working/`. Exports land in `output/`. No legacy layouts, no migration shims — we iterate fast toward MVP.

**Cut thoughts, not syllables.** Removing a single word mid-sentence usually sounds wrong. Prefer cutting whole phrases or sentences; the tools support word-level precision when you need it, but the workflow nudges toward clean jumps.

---

## Project layout

Each project is a directory under `projects/<slug>/` (override the root with `OPENKLIP_PROJECTS_ROOT`):

```text
projects/<slug>/
  project.json       ← the edit (words, cuts, overlays, captions, asset registry)
  assets/            ← your drop zone: drop b-roll, music, stills here (flat)
  working/           ← generated: proxy, transcript, asset proxies, chats, frames…
  output/            ← rendered export (out.mp4)
```

| Path | Role |
| --- | --- |
| `project.json` | Source of truth. The only file that *is* the edit. |
| `assets/` | Originals you add (upload, drag-drop, or copy from Finder). |
| `working/` | Regeneratable cache — preview proxy, Whisper transcript, ffmpeg proxies, `chats.json`. |
| `output/` | Final MP4 from `openklip export`. |

Chats in the agent sidebar persist to `working/chats.json`, not the browser’s localStorage.

---

## What ships in the MVP

- **Transcript editing** — click words to cut/restore; phrase search via CLI.
- **Fast preview** — all-intra proxy; player jumps across kept ranges only.
- **Cut transitions** — Glimm WebGL sweeps at preview boundaries (respects reduced motion).
- **Captions** — live preview + ASS/libass burn-in on export.
- **Assets** — b-roll, music, stills (Ken Burns); register via UI or CLI, sync from `assets/`.
- **Overlays** — b-roll covers, push-in zooms, lower-third / center / hero titles, vignette.
- **Export** — ffmpeg re-encodes kept ranges with overlays and captions.
- **Agent loop** — `openklip transcript` → `cut` / overlays → `status` → `export`; GUI stays in sync.

---

## Quick start

**Requirements:** [Bun](https://bun.sh) 1.3.14+, Node 24+. ffmpeg/ffprobe are bundled. First ingest downloads the Whisper model cache.

```bash
bun install

# Ingest: transcribe + build preview proxy + create project.json
bun run ingest /path/to/talking-head.mp4

# Open the editor (or: bun run dev)
bun run serve <slug>

# Export
bun run export <slug>
```

`bun run dev` serves the editor on port 4399 and opens the latest project. Pin one with `OPENKLIP_SLUG=<slug> bun run dev`.

---

## Agent loop

OpenKlip does not call an LLM. You (or an external agent) run:

```text
read  → openklip list / status / transcript
plan  → decide phrases, spans, overlays
act   → openklip cut / broll-add / title-add / …
verify→ openklip status
done  → openklip export
```

Deterministic demo (no LLM):

```bash
bun run agent-demo <slug> --phrases scripts/example-phrases.txt --export
```

Full command reference and guardrails: **[CLAUDE.md](./CLAUDE.md)** (agent skill). Capability manifest: `openklip actions --json`.

---

## How it works (brief)

- **Cut spine** — deleted words split the transcript into surviving source-time ranges; preview and export follow that spine.
- **Preview** — native `<video>` on the all-intra proxy; scheduler seeks across kept ranges.
- **Export** — ffmpeg selects ranges, composites b-roll/stills, applies zoom/vignette, burns captions/titles.
- **Time** — CLI accepts seconds for human-facing spans; storage uses 48 kHz samples.

---

## Development

```bash
bun run check      # lint/format (Ultracite)
bun run typecheck
bun test           # 240+ unit/integration tests
bun run build
```

CI runs the same gates on push and PR.

---

## Current limits

- Word-boundary cuts can clip phonemes; VAD snap and crossfades are on the roadmap.
- Glimm transitions are preview-only; export still hard-jumps between ranges.
- 4K export can be slow on the current ffmpeg path.
- Vertical shorts, highlight detection, and MCP server automation are post-MVP.

---

## License

MIT

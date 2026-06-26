# OpenKlip - agent skill

OpenKlip is a local-first, agent-native video editor: you **edit video by editing text**.

## The file model (read this first)

Each project lives as plain files under `projects/<slug>/`. The one that matters is:

```
projects/<slug>/project.json    the EDL - the edit itself
```

**`project.json` IS the edit.** It holds every transcribed word with a `deleted` flag, the b-roll overlays, and the captions toggle. The GUI editor and these CLI commands both read and write this same file; they are **equivalent (parity)**. Edit it through the CLI; the browser editor will show the same result, and vice-versa.

Time is integer audio samples at 48 kHz. The CLI takes seconds where a human number is natural (b-roll spans) and converts for you.

## Commands

Run as `bun run src/cli.ts <command>` (or the `openklip` bin).

| Command | What it does |
| --- | --- |
| `openklip transcript <slug>` | Print every word as `index  id  mm:ss  text  [cut]`: read this to learn word ids and timing before editing. |
| `openklip cut <slug> <tokens...>` | Mark words deleted. Tokens are word ids (`w12`) or inclusive ranges (`w12-w20`). |
| `openklip cut <slug> --text "phrase"` | Cut the first contiguous run of words matching the phrase (case/punctuation-insensitive). |
| `openklip cut <slug> <tokens...> --restore` | Restore the listed words instead of cutting them. |
| `openklip restore <slug>` | Restore every word (clear all cuts). |
| `openklip broll-add <slug> <assetId> <fromSec> <toSec>` | Cover a source-time span with a registered b-roll asset. |
| `openklip broll-rm <slug> <brollId>` | Remove a b-roll clip. |
| `openklip captions <slug> <on\|off>` | Toggle burned captions for export. |
| `openklip status <slug>` | Summarize the edit: word counts, surviving ranges, b-roll count, captions, kept runtime. |
| `openklip export <slug>` | Render the current cut to `out.mp4`. |

(`ingest`, `serve`, and `broll` register/build assets; they exist but aren't part of the edit loop below.)

## Recommended workflow

1. **Read first.** `openklip transcript <slug>`: see the words, their ids, their times, and what's already cut.
2. **Decide cuts.** Identify filler, false starts, and tangents. Prefer cutting whole sentences, not single words.
3. **Edit.** `openklip cut <slug> w12-w20` (or `--text "the part to remove"`). Add b-roll with `openklip broll-add`, toggle captions with `openklip captions`.
4. **Check.** `openklip status <slug>`: confirm the kept runtime and range count look right.
5. **Export.** `openklip export <slug>` when the cut is good.

## Guardrails

- **Cut whole sentences, not single words.** Removing one word mid-sentence usually leaves an audible jump; cut the full thought.
- **Keep b-roll spans short** - roughly 2–6 seconds. Long covers hide the speaker and feel like a different video.
- **Captions are on by default.** Only turn them off if the project explicitly shouldn't have them.
- **Never hand-edit `project.json`** when a command exists for the change. The commands validate the schema and keep the GUI in sync; manual edits can desync or corrupt the file.
- After cutting, run `openklip status` before `openklip export` so you don't render an empty or near-empty cut.

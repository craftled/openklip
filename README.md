# OpenKlip

Edit video by editing text. OpenKlip is a lean, local-first editor for talking-head videos with transcript cuts, captions, b-roll, push-in zooms, titles, and MP4 export.

## Requirements

- [Bun](https://bun.sh) 1.3.14+
- Node.js 24+

ffmpeg and ffprobe are bundled through `ffmpeg-static` / `ffprobe-static`. Transcription runs locally with Transformers.js; the first ingest downloads the Whisper model cache.

## Quick Start

```bash
bun install

# 1. Ingest a video: transcribe + create the fast-seek proxy
bun run ingest /path/to/talking-head.mp4

# 2. Open the editor for that project
bun run serve <slug>

# 3. Export from the browser, or headless:
bun run export <slug>
```

`bun run dev` also opens the editor and defaults to the latest project. Use `OPENKLIP_SLUG=<slug> bun run dev` when you want to pin a project without the CLI wrapper.

## What Ships In The MVP

- Transcript editing: click words to cut/restore them.
- Fast preview: the browser plays only surviving ranges from an all-intra proxy.
- Preview cut transitions: Glimm WebGL sweeps punctuate jumps between kept ranges.
- Captions: live preview and ASS/libass burn-in on export.
- B-roll cover clips: register assets, place them over selected word spans, preview and export them.
- Cinematic look: vignette, smooth push-in zooms, lower-third, centered, and hero card titles.
- Agent/CLI parity: terminal commands edit the same `project.json` as the GUI.
- Local-first storage: no database, no API keys, no bundled LLM.

## Project Files

Each project lives under `projects/<slug>/`:

```text
project.json      the EDL: words, cuts, assets, b-roll, zooms, titles, captions
transcript.json   words + sample-accurate timestamps
proxy.mp4         all-intra 720p preview proxy
out.mp4           exported cut
assets/           proxied b-roll assets
frames/           sampled frames for future agent workflows
```

`project.json` is the edit. The GUI and CLI both mutate this same file.

## CLI

Full reference: see [CLAUDE.md](./CLAUDE.md) (agent skill). Common commands:

```bash
bun run src/cli.ts list
bun run src/cli.ts transcript <slug>
bun run src/cli.ts cut <slug> w12-w20
bun run src/cli.ts cut <slug> --text "phrase to remove" --all
bun run src/cli.ts restore <slug>
bun run src/cli.ts broll <slug> /path/to/b-roll.mp4
bun run src/cli.ts assets <slug>
bun run src/cli.ts broll-add <slug> <assetId> <fromSec> <toSec>
bun run src/cli.ts broll-set <slug> <brollId> --asset <id> --from 1 --to 4
bun run src/cli.ts title-add <slug> <fromSec> <toSec> "Title text"
bun run src/cli.ts title-set <slug> <titleId> --text "New text"
bun run src/cli.ts zoom-add <slug> <fromSec> <toSec> --scale 1.2
bun run src/cli.ts zoom-set <slug> <zoomId> --scale 1.25
bun run src/cli.ts captions <slug> on
bun run src/cli.ts look <slug> vignette on
bun run src/cli.ts status <slug>
bun run src/cli.ts export <slug> --height 1080
```

Agent-loop demo (phrase list → cut → status → optional export):

```bash
bun run agent-demo <slug> --phrases scripts/example-phrases.txt --export
```

## How It Works

- Time base: every edit is stored on a canonical 48 kHz integer-sample grid.
- Cut spine: deleted words split the transcript into surviving source-time ranges.
- Preview: a native `<video>` scheduler jumps across those ranges on the all-intra proxy.
- Preview transitions: Glimm's framework-agnostic WebGL shader runs over the preview frame at each cut boundary; reduced-motion users get the normal hard jump.
- Export: ffmpeg re-encodes surviving ranges, overlays b-roll, applies zoom/vignette, and burns captions/titles.
- Fallbacks: export prefers original media, but can fall back to project proxies when original files moved.

## Quality Gates

```bash
bun run check
bun run typecheck
bun test
bun run build
```

GitHub Actions runs the same gates on pushes and pull requests.

## Current Limits

- Word-boundary cuts can still clip phonemes; VAD snap-to-silence and equal-power crossfades are next.
- Glimm transitions are preview-only; exported MP4 transitions need an ffmpeg-side transition graph.
- 4K export can be slow because the current ffmpeg path decodes the selected stream.
- Vertical shorts, automatic highlight detection, and MCP server automation are post-MVP work.

# OpenKlip

Edit video by editing text. A lean, local-first, agent-native editor for talking-head + b-roll content.

This is **M0**: the cut spine. Ingest a video, edit the transcript to cut it, preview the cut instantly, export an MP4. The cinematic look (M1) and the terminal-agent peer (M2) come next. See the design doc for the full plan.

## Requirements

- [Bun](https://bun.sh) and Node.js (both already needed; Node runs the transcription step).
- That's it. ffmpeg is bundled via `ffmpeg-static`; Whisper runs locally via Transformers.js (no API keys, no system installs). The first ingest downloads the Whisper model (~150 MB) once.

## Use

```bash
bun install

# 1. ingest a video (transcribe + build a fast-seek proxy)
bun run ingest /path/to/talking-head.mp4

# 2. open the editor (defaults to the most recent project)
bun run dev

# 3. in the browser: click words to strike them out -> "Play cut" -> "Export"
#    or export headless:
bun run export <slug>
```

The project lives as plain files under `projects/<slug>/`:

```
project.json      the EDL: every word with a `deleted` flag (this is the edit)
transcript.json   words + sample-accurate timestamps
proxy.mp4         all-intra 720p proxy for instant-seek preview
out.mp4           your exported cut
frames/           sampled frames (for the agent layer, later)
```

## How it works

- **Time base:** integer audio samples at 48 kHz. Preview and export derive seconds from the same grid, so what you scrub is what you export.
- **Cut:** deleting words marks them `deleted`; consecutive kept words merge into ranges (padded slightly), and the preview plays those ranges back to back by seeking the all-intra proxy.
- **Export:** ffmpeg re-encodes the surviving ranges from the original source (not the proxy) with a `select`/`aselect` filter, frame-accurate.

## Known M0 limitations (next iteration)

- Cuts land on whisper word boundaries; no VAD snap-to-silence yet, so tight cuts can clip a phoneme. A short gain duck masks the audio click at boundaries; a true equal-power crossfade is the next step.
- No cinematic look yet (vignette, push-ins, lower-thirds, captions): that is M1.
- No terminal-agent peer yet: that is M2.

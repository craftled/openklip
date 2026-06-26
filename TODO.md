# OpenKlip - Roadmap

## Status

OpenKlip is a lean, local-first, **agent-native** video editor: you **edit video by editing text** (Descript-style). The stack is Bun + TypeScript + React 19 + Next.js 16, with `ffmpeg-static` invoked as a subprocess and local Whisper running via Transformers.js. The project is files-on-disk: `project.json` **is** the edit (an EDL of every word with a `deleted` flag): no database. There are no API keys and no bundled LLM; the "agent" is Claude Code / Codex driven from the terminal, reading and writing the same project files the GUI does, so GUI and agent stay at full parity. Primary output is full-screen YouTube (16:9); the secondary target is vertical shorts (9:16, for TikTok / LinkedIn / X). Public on GitHub at `craftled/openklip` (MIT).

**Current state:** working local editor; cut → captions → b-roll → vignette → push-in zoom → titles → export all functional; open-sourced MIT.

## Completed

- [x] **M0 cut spine - ingest** (ffmpeg all-intra 720p proxy + local Whisper word-level transcript via Transformers.js, no API keys)
- [x] **M0 cut spine - edit-by-text** (Descript-style: delete transcript words → trims the cut on the shared `project.json` EDL)
- [x] **M0 cut spine - preview scheduler** (native `<video>` playback gap-skips deleted ranges on the all-intra proxy for instant seeks)
- [x] **M0 cut spine - export** (ffmpeg re-encodes surviving ranges from the original source, frame-accurate)
- [x] **Canonical time base** (48 kHz integer-sample grid shared by preview + export: what you scrub is what you export)
- [x] **Word-level captions - preview** (live overlay with karaoke active-word highlight)
- [x] **Word-level captions - export** (burned-in via libass ASS, `captions.ts`)
- [x] **B-roll insert (cover mode)** (register a proxied b-roll asset, cover a word span; preview overlay + export via ffmpeg `filter_complex`)
- [x] **Bug fix: 8-bit `yuv420p` on every encode** (10-bit HEVC source had produced 10-bit H.264 → black frame in browsers)
- [x] **Bug fix: stale-proxy cache** (media served `no-store` + versioned `?v=` URLs)
- [x] **Cinematic look - vignette** (global toggle)
- [x] **Cinematic look - animated push-in zoom** (`zoom-ramp.ts` smoothstep ramp via ffmpeg `zoompan`)
- [x] **Cinematic look - 1080p export option**
- [x] **Title cards** (lower-third + centered, slide-up/fade entrance; ASS builder `titles.ts` + preview overlay + burn-in)
- [x] **MVP reliability pass** (proxy media route, save/export sequencing, source/proxy export fallback, b-roll gap splitting, caption/title collision handling, ASS timestamp rounding)
- [x] **Agent peer (M2 foundation) - CLI primitives** (`transcript`, `cut`, `cut --text`, `restore`, `broll-add`, `broll-rm`, `captions`, `status`, `export`)
- [x] **Agent peer - CLAUDE.md agent skill + pure `actions.ts`** (full GUI/agent parity on the same `project.json`)
- [x] **Design system: Geist (Vercel)** (light theme + light/dark toggle; dark mode shipped alongside this roadmap)
- [x] **TDD test suite** (`bun test`: actions, captions, EDL, exporter, range streaming, titles, zoom-ramp)
- [x] **GitHub Actions CI** (`check`, `typecheck`, `test`, `build`)
- [x] **Open-sourced** (public GitHub repo, MIT license, source media gitignored + purged from history)

## Architecture & Key Decisions

- Files-on-disk `project.json` EDL; no database; GUI and terminal agent edit the same file (parity is the core agent-native bet).
- The agent is Claude Code / Codex via terminal subscription; OpenKlip ships **no** LLM, no API keys, no cloud.
- Whisper via Transformers.js, picked over native whisper.cpp (no cmake / build toolchain needed).
- ffmpeg via `ffmpeg-static`: GPL binary invoked as a subprocess, so it does **not** bind OpenKlip's MIT license.
- Remotion deliberately **not** used (commercial license at 4+ employees); preview is a native `<video>` scheduler, export is ffmpeg `filter_complex`.
- All-intra 720p proxy for instant seeks; 8-bit `yuv420p` everywhere; export re-encodes from original source on the same 48 kHz sample grid as preview.
- ffmpeg `crop` can't vary size per-frame → animated zoom uses `zoompan` (per-frame `z`); static effects use `split` + `overlay`.

## Roadmap / Pending

### Export

- [ ] Fast 4K export via per-segment input seeking (avoid full-stream `select` decode of the whole source).
- [x] Export-from-proxy fallback when the original source file is missing.

### Look & Effects

- [ ] Page transitions between shots (shader / whoosh cut).
- [x] Match the preview zoom curve to the export smoothstep ramp.
- [x] Fix title/caption overlap when both are active on the same span.
- [ ] B-roll PiP mode (not just full-cover) + b-roll audio ducking; more title styles.

### Editing Intelligence

- [ ] VAD snap-to-silence + equal-power crossfade at cut boundaries (kill audio clicks; tighten the ~100 ms-loose Whisper word boundaries).
- [ ] Filler-word / dead-air auto-removal (Descript-style).
- [ ] LLM highlight detection (long video → short clips).

### Shorts (9:16)

- [ ] Vertical reframe / derivation with auto-crop / subject tracking.
- [ ] Optional macOS Apple Vision sidecar for saliency-based reframe + OCR.
- [ ] OpenCLIP semantic b-roll matching (deferred - heavy dependency).

### Agent

- [ ] End-to-end agent-loop demo (point Claude Code at a project, cut from a prompt).
- [ ] Optional MCP server exposing the editing tools.

### Infra

- [x] GitHub Actions CI (check + typecheck + tests + build).
- [ ] Demo gif + repo topics.

## Known Limitations

- 4K export re-decodes the whole source (slow) even for a short cut.
- Whisper word timestamps are ~100 ms loose; cuts can clip a phoneme until VAD-snapping lands.

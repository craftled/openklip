# OpenKlip - Roadmap

## Status

OpenKlip is a lean, local-first **agent-native video toolchain**: external agents drive the edit loop via CLI; humans review in the browser. Both read/write the same `project.json` on disk.

**Current release:** v0.8.5.0 (2026-06-28). Working local editor: cut → captions → b-roll → vignette → push-in zoom → titles → export; cinema player; resizable right chat sidebar with Claude MCP edits; asset cards (`openklip analyze` + **Describe assets**); skills slash menu; MCP agent tools (35 tools); edit templates; Linear-style UI (Inter Variable + OKLCH, Phosphor fill icons); export dialog; macOS workspace folder picker; multi-agent filler cuts; sidebar asset bin with folder sync; 411 tests; MIT.

Preview cuts get a Glimm WebGL sweep in the browser; exported MP4s still hard-cut until the ffmpeg transition graph lands.

## Completed

- [x] **M0 cut spine - ingest** (ffmpeg all-intra 720p proxy + local Whisper word-level transcript via Transformers.js, no API keys)
- [x] **M0 cut spine - edit-by-text** (word-level `deleted` flags on `project.json` → preview + export follow kept ranges)
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
- [x] **Title cards** (lower-third + centered + hero, slide-up/fade entrance; ASS builder `titles.ts` + preview overlay + burn-in)
- [x] **MVP reliability pass** (proxy media route, save/export sequencing, source/proxy export fallback, b-roll gap splitting, caption/title collision handling, ASS timestamp rounding)
- [x] **Agent peer - CLI primitives** (`transcript`, `cut`, `cut --text`, `restore`, `broll-add`, `broll-rm`, `captions`, `status`, `export`)
- [x] **Agent peer - full GUI parity CLI** (`list`, `assets`, zoom/title/broll set commands, look, pad, captions-max)
- [x] **Agent peer - agent-loop demo** (`bun run agent-demo`, composes primitives from a phrase list)
- [x] **Agent peer - AGENTS.md agent skill + pure `actions.ts`** (full GUI/agent parity on the same `project.json`)
- [x] **Unified action registry** (`src/registry.ts`: one Zod-schema'd definition per `project.json` mutation; CLI routes every edit command through `runAction`; `openklip actions [--json] [--surface]` prints the capability manifest)
- [x] **Multi-agent driver** (Claude Code, Codex, Cursor, Grok via `src/agent-driver.ts`; "Find filler" in the editor)
- [x] **Cinema player + Linear-parity transport bar** (`cinema-player.tsx`, `player-controls.tsx`)
- [x] **Editor shell refresh** (sidebar asset bin, project switcher, persisted chats, theme engine, keyboard shortcuts)
- [x] **Project write serialization** (`src/project-lock.ts`, `mutateProject()`; in-process per-slug locks for `project.json` and `chats.json`)
- [x] **Chats + asset hardening** (atomic `chats.json` writes, POST folder sync, re-ingest guard with `--force`, external still copy-in)
- [x] **Design system: Inter Variable + OKLCH** ([DESIGN.md](./DESIGN.md): Linear-style surfaces, semantic tokens, blue-only-when-it-matters CTA hierarchy; swappable theme presets)
- [x] **TDD test suite** (`bun test`: 387 tests across actions, captions, EDL, exporter, project lock, chats, assets, workspace, agent-tools, templates, and more)
- [x] **GitHub Actions CI** (`check`, `typecheck`, `test`, `build`)
- [x] **Open-sourced** (public GitHub repo, MIT license, source media gitignored + purged from history)
- [x] **Center chat panel** (agent threads + prompt input in center column; chat list in left sidebar; PR #12)
- [x] **Export options dialog** (720p / 1080p / 4K max height from toolbar; PR #13)
- [x] **Workspace folder picker** (macOS `osascript`, `.openklip/projects-root`, `GET/POST /api/workspace`; PR #13)
- [x] **Timeline drawer + compact preview** (bottom drawer timeline, `max-w-2xl` center column; PR #12)
- [x] **Agent query layer + MCP** (bounded `transcript grep/span/phrase`, `openklip tools`, stdio MCP server, phrase placement helpers; PR #14)
- [x] **Skills chat UX** (`/` slash menu, inline skill tokens, skills catalog; PR #14)
- [x] **Edit templates + brand presets** (`templates/`, `openklip template set`, `openklip brand`; PR #14)
- [x] **Empty workspace + project create flow** (folder picker landing, new-project dialog, Sonner toasts; PR #14)
- [x] **Linear UI refactor v0.8.1–v0.8.2** (DESIGN.md, semantic `text-tertiary`/`bg-surface-*` tokens, timeline track colors, CTA hierarchy)
- [x] **Agentic chat edits (Claude)** (MCP-loaded chat applies cut/zoom/b-roll/title/export; non-Claude agents stay read-only or CLI-answer; v0.8.5)
- [x] **Resizable chat sidebar** (full-height right column, drag handle 340–760px, localStorage persistence; v0.8.5)
- [x] **Asset cards / analyze assets** (`src/asset-cards.ts`, `openklip analyze`, GUI **Describe assets** button; v0.8.5)
- [x] **Phosphor fill icons** (`@phosphor-icons/react` via `web/lib/icon.tsx`; v0.8.5)

## Architecture & Key Decisions

- Files-on-disk `project.json` EDL; no database; GUI and terminal agent edit the same file (parity is the core agent-native bet).
- The agent is Claude Code / Codex / Cursor / Grok via the user's own subscription CLI; OpenKlip ships **no** bundled LLM, no API keys, no cloud.
- Whisper via Transformers.js, picked over native whisper.cpp (no cmake / build toolchain needed).
- ffmpeg via `ffmpeg-static`: GPL binary invoked as a subprocess, so it does **not** bind OpenKlip's MIT license.
- Remotion deliberately **not** used (commercial license at 4+ employees); preview is a native `<video>` scheduler, export is ffmpeg `filter_complex`.
- All-intra 720p proxy for instant seeks; 8-bit `yuv420p` everywhere; export re-encodes from original source on the same 48 kHz sample grid as preview.
- ffmpeg `crop` can't vary size per-frame → animated zoom uses `zoompan` (per-frame `z`); static effects use `split` + `overlay`.
- Server-side `project.json` mutations serialize per-slug in-process (`withProjectLock` / `mutateProject`). Concurrent **processes** (CLI + server, two CLI invocations) still need OS-level file locking (not implemented).

## Roadmap / Pending

### Export

- [ ] Wire export dialog compression, frame rate, and clipboard destination through to ffmpeg (UI exists but disabled).
- [ ] Fast 4K export via per-segment input seeking (avoid full-stream `select` decode of the whole source).
- [x] Export-from-proxy fallback when the original source file is missing.

### Look & Effects

- [x] Preview cut transitions via Glimm WebGL sweep.
- [ ] Exported MP4 transitions between shots (ffmpeg shader / whoosh cut).
- [x] Match the preview zoom curve to the export smoothstep ramp.
- [x] Fix title/caption overlap when both are active on the same span.
- [ ] B-roll PiP mode (not just full-cover) + b-roll audio ducking; more title styles.

### Editing Intelligence

- [ ] VAD snap-to-silence + equal-power crossfade at cut boundaries (kill audio clicks; tighten the ~100 ms-loose Whisper word boundaries).
- [ ] Filler-word / dead-air auto-removal beyond the current "Find filler" agent action (Descript-style batch pipeline).
- [ ] LLM highlight detection (long video → short clips).

### Shorts (9:16)

- [ ] Vertical reframe / derivation with auto-crop / subject tracking.
- [ ] Optional macOS Apple Vision sidecar for saliency-based reframe + OCR.
- [ ] OpenCLIP semantic b-roll matching (deferred - heavy dependency).

### Agent

- [x] End-to-end agent-loop demo (`bun run agent-demo`: phrase list → cut → status → export).
- [x] `openklip doctor` env/project health check (ffmpeg, Whisper, proxy/source/asset media).
- [x] Multi-agent filler-cut driver (Claude, Codex, Cursor, Grok).
- [x] MCP server exposing the unified agent tool manifest (`src/agent-tools.ts`, `openklip mcp`, `.cursor/mcp.json`).

### Infra

- [x] Slug validation guard on every path join (`assertValidSlug` in `paths.ts`): closes a path-traversal hole on the `[slug]` API routes.
- [x] Configurable projects root (env → `.openklip/projects-root` → `./projects`).
- [x] Export API route (`POST /api/projects/[slug]/export`, Zod-validated body, empty-cut + traversal guarded).
- [x] Layered project folders (`project.json` at root; derived media under `working/`, render under `output/`).
- [x] Ken Burns **still** overlays (`still-add`/`still-rm`, `zoompan` push-in in exporter, focus point).
- [x] Ingester plugin manifest (`ingesters/<id>/ingester.json` + loader + `openklip ingesters`).
- [x] Post-export HyperFrames seam (`openklip package <slug> remove-background|transcribe`): opt-in `hyperframes` CLI, verified end-to-end.
- [x] Agent skill router (intent → CLI command sequences) feeding the sidebar.
- [x] GUI: orientation toggle (16:9/9:16/1:1 preview), rebuilding/saving overlay, `@dnd-kit` drag-reorder of b-roll paint order, replace-from-bin, in/out loop region.
- [x] Brand presets (`brands/*.json` + `applyBrand`): caption/vignette/pad defaults at `ingest --brand` or `openklip brand`.
- [x] Overlay reorder (`reorderBroll/Title/Zoom` + `openklip reorder`): paint-order control for the b-roll/title/zoom tracks.
- [x] Derived `CompiledTimeline` (`src/compiledTimeline.ts`): never-persisted authoring→preview view.
- [x] `safeAction` dev-mode stack traces in server actions; `serve` runs a health gate (`runDoctor`) before opening the editor.
- [x] GitHub Actions CI (check + typecheck + tests + build).
- [ ] OS-level file locking for concurrent CLI + server writes on the same project.
- [ ] Demo gif + repo topics.

## Known Limitations

Single list of current gaps (code is truth). README and release notes point here for detail.

### Export & media

- 4K export re-decodes the whole source (slow) even for a short cut.
- Export dialog shows compression, frame rate, and clipboard options but only **resolution** affects export today.
- Glimm cut transitions are preview-only; exported MP4 hard-jumps between kept ranges.
- B-roll is full-cover only (no PiP mode or b-roll audio ducking yet).
- HyperFrames post-export (`openklip package`) is opt-in: requires separate `hyperframes` npm install and Chrome; not bundled.

### Editing & transcript

- Phrase-based cutting (`openklip cut --text`, `transcript grep`) is CLI/MCP-only; transcript UI uses per-word click, not phrase search.
- Whisper word timestamps are ~100 ms loose; cuts can clip a phoneme until VAD-snapping lands.
- Cuts are word-boundary based; no VAD snap-to-silence or equal-power audio crossfade at boundaries yet.

### Workspace & platform

- Workspace folder picker is **macOS-only**; Linux/Windows need `OPENKLIP_PROJECTS_ROOT` or CLI ingest. Empty landing does not upload video from the browser.
- Ingester plugins are manifest + CLI discovery only (`openklip ingesters`); no GUI URL/batch ingest flow.

### Agent & chat

- OpenKlip ships **no bundled LLM** for the core edit loop; external agent, MCP, or manual CLI drives mutations.
- **Claude chat edits** load the openklip MCP server and mutate `project.json` in-process. Other agents answer via CLI or return read-only hints; skills slash menu still routes to suggested command sequences.
- **Find filler** and **Describe assets** shell out to the selected agent CLI; needs that CLI on PATH and signed in. Cursor requires one-time `cursor-agent login`.

### Design & UI (non-blocking polish)

- Hero title inspector uses a hand-rolled `<textarea>` instead of the shared `Textarea` primitive (`web/app.tsx`).
- Delete confirmation microcopy uses `text-[11px]` instead of the `text-caption` token (asset bin, project delete, chat preview).
- Audio waveform visualizers use hard-coded hex (`#1FD5F9`, `#FA954C`) instead of theme tokens (`media-audio-visualizer-wave.tsx`, `agent-audio-visualizer-wave.tsx`).
- Video player layer stays black/white by design (Linear cinema parity); not tokenized to the editor chrome.

### Architecture & parity

- GUI server actions do not dispatch through `runAction()`: CLI uses `src/registry.ts`; GUI uses `app/actions.ts` + `projectMutations` (same `project.json`, separate code paths).
- Project write locks are in-process only. Two concurrent **processes** writing the same slug (e.g. CLI agent + running editor server) can still race.
- Reload the browser after CLI edits to see changes in the editor.
- A local `.openklip/projects-root` affects `projectsRoot()` for CLI and server started from that cwd (intentional; isolate tests with a clean temp cwd).

### Not implemented (see Roadmap / Pending)

- Vertical shorts (9:16 reframe) and LLM highlight detection.
- Filler/dead-air batch pipeline beyond the current Find filler action.
- OpenCLIP semantic b-roll matching.
- OS-level file locking for concurrent CLI + server writes.
- Demo gif + repo topics.

## README policy

See **AGENTS.md** (Project rules → README policy). Roadmap items stay in this file only.

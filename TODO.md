# OpenKlip - Roadmap

## Status

OpenKlip is a lean, local-first **agent-native video toolchain**: external agents drive the edit loop via CLI; humans review in the browser. Both read/write the same `project.json` on disk.

**Current release:** v0.10.0.1 (2026-07-01); main has unreleased work since. Working local editor: cut → captions → b-roll → vignette → push-in zoom → titles → grade/LUT → rich graphics → json-render product announcement graphics → music placement → export; browser project creation (upload or drop a video onto the empty workspace); transcript phrase search with batch cuts and restore; real export settings (compression presets + output frame rate); append-only action history; cinema player with live graphics/titles/captions overlays; resizable right chat sidebar with Claude MCP edits; right-side Config shell with color temperature controls; smaller-screen Chat and Config overlays; asset cards (`openklip analyze` + **Describe assets**); skills slash menu; MCP agent tools (58 tools); 34 registry actions; edit templates; native HTML/CSS graphics templates (pixel-faithful headless-Chrome export to ProRes 4444 alpha); default shadcn neutral theme with Base UI primitives; export dialog; macOS workspace folder picker; multi-agent filler cuts; sidebar asset bin with folder sync; written rationale notes on cuts/overlays; phrase-anchored cues that re-snap after a re-cut; multi-take assembly; 745 tests; MIT.

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
- [x] **Editor shell refresh** (sidebar asset bin, project switcher, persisted chats, color scheme toggle, keyboard shortcuts)
- [x] **Project write serialization** (`src/project-lock.ts`, `mutateProject()`; in-process per-slug locks for `project.json` and `chats.json`)
- [x] **Chats + asset hardening** (atomic `chats.json` writes, POST folder sync, re-ingest guard with `--force`, external still copy-in)
- [x] **Design system: default shadcn theme + Base UI primitives** (`components.json` + `app/globals.css`: stock neutral tokens, light/dark color scheme)
- [x] **TDD test suite** (`bun test`: 745 tests across actions, captions, EDL, exporter, project lock, chats, assets, workspace, agent-tools, templates, graphics, headless render, reanchor, multi-take assembly, product announcement, and more)
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
- [x] **shadcn theme parity cleanup** (default neutral tokens and direct shadcn color utilities)
- [x] **Base UI primitive migration** (app-owned drawers, commands, selects, menus, dialogs, tooltips, sidebars, and toggles use Base UI-compatible wrappers)
- [x] **Agentic chat edits (Claude)** (MCP-loaded chat applies cut/zoom/b-roll/title/export; non-Claude agents stay read-only or CLI-answer; v0.8.5)
- [x] **Resizable chat sidebar** (full-height right column, drag handle 340–760px, localStorage persistence; v0.8.5)
- [x] **Asset cards / analyze assets** (`src/asset-cards.ts`, `openklip analyze`, GUI **Describe assets** button; v0.8.5)
- [x] **Tabler icons** (`@tabler/icons-react` via `web/lib/icon.tsx`; v0.8.5)
- [x] **Written rationale (`note`)** (v0.8.10.0): optional `note` on cuts and overlays records the *why* of a pick; surfaces in CLI / query / transcript / MCP; metadata only, never reaches ffmpeg (`--note ""` clears it; pinned by an exporter no-op test)
- [x] **Phrase-anchored cues** (`src/reanchor.ts`; v0.8.10.0): `*-add-phrase` overlays remember the spoken phrase and re-resolve onto the kept words after a re-cut (CLI + GUI via `applyProjectEdits`); flag `stale` and keep the last good span when the phrase is deleted; follow a surviving instance on duplicates; `openklip reanchor`
- [x] **Multi-take assembly** (`src/assembly-plan.ts` pure planner + `src/assembly.ts`; v0.8.10.0): `take-add` / `takes` / `assemble` ingest alternate takes into `takes/<id>/` and splice the best line per take into one single-source `project.json` (integer-exact re-timing, provenance block) the cut/overlay/export engine edits unchanged
- [x] **Product announcement json-render graphics** (v0.10.0.0): validated catalog-constrained announcement specs render in preview and export, route through CLI / GUI / MCP actions, and include hard guards for graph cycles, orphans, oversized specs, and missing json-render catalog/spec fields.
- [x] **Config shell and responsive right panels** (v0.10.0.0): right-side Config panel carries color temperature, captions, and timing controls; Chat and Config stay reachable below the desktop breakpoint through overlay buttons.
- [x] **UI phrase search and batch cuts** (unreleased, 2026-07-02): transcript panel search bar (Mod+F, Kept/Cut scopes) built on the same `findPhraseRuns` engine as the CLI (`web/lib/phrase-search.ts`, parity pinned against `grepTranscript`); match list with click-to-seek and select-as-span; batch Cut first / Cut all and Restore / Restore all with affected-word counts and optional note (`web/components/transcript-search.tsx`); the `cut-text` action gained the `gui` surface.
- [x] **Music placement** (unreleased, 2026-07-02): `music` array on `project.json` (`MusicPlacementSchema` in `src/edl.ts`; legacy projects parse unchanged); `music-add` / `music-set` / `music-rm` registry actions on cli+gui+mcp; exporter mixes each placement as one continuous window (aloop/atrim/volume/afade/adelay + amix); preview plays the bed via a synced hidden audio element with a mute toggle; Config panel Music section + placed-music timeline track.
- [x] **Real export settings** (unreleased, 2026-07-02): compression presets studio / social / web / web-low (`encoderArgsFor`) and output frame rate (`resolveOutputFps`) in `src/exporter.ts`, wired through the export dialog (live size/time estimate), `POST /api/projects/[slug]/export`, `openklip export --fps --compression`, and the MCP export tool.
- [x] **Append-only action history** (unreleased, 2026-07-02): `src/action-log.ts` writes `working/actions.jsonl` (action, actor, input/result summaries, timestamp, revision before/after) for every registry mutation across GUI/CLI/MCP plus GUI direct-save paths, via `mutateProject` meta; optional `revision` counter on `project.json` bumped inside the write lock; `GET /api/projects/[slug]/history` + History section in the Config panel; `OPENKLIP_ACTOR` attributes GUI-spawned agent edits.
- [x] **Browser project creation hardening** (unreleased, 2026-07-02): shared format validation on client + server (`src/video-formats.ts`); the uploaded source persists to the project root and `project.json` `source` points at it; drag-drop onto the empty workspace; explicit overwrite confirm on 409 that re-invokes with `?force=1`.
- [x] **Bundle-safe script paths** (unreleased, 2026-07-02): `src/script-paths.ts` anchors the transcribe script and graphic runtime entry at `repoPath` instead of `import.meta.dir` (compiled to undefined by Turbopack), fixing browser-triggered ingest, GUI verify, doctor, and rich-graphic export through Next server routes.

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

- [x] Wire export dialog compression and frame rate through to ffmpeg (presets studio / social / web / web-low + output fps on dialog, CLI, MCP, API).
- [ ] Wire export format (GIF) and destination (file picker / clipboard) controls (UI exists but disabled).
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
- [x] First-party rich-graphics export (`src/headless-render.ts`): `kind: "rich"` templates render through headless Chrome (`chrome-headless-shell` via `puppeteer-core`) driving the same `web/lib/graphic-runtime.ts` as the preview, captured to a transparent ProRes 4444 alpha MOV and composited by ffmpeg. Replaced `@hyperframes/producer` (and its `next.config.ts` esbuild workaround); Chrome is an optional one-time download.
- [x] Fullscreen overlay parity (`web/components/preview-overlays.tsx`): the graphics/titles/captions overlay stack is shared by the inline preview and the cinema player, aligned to the letterboxed video box and synced to playback.
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
- Export dialog format (MP4/GIF) and destination (file/clipboard) controls remain disabled; resolution, compression preset, and frame rate are real. The dialog's size/time estimate is approximate.
- Glimm cut transitions are preview-only; exported MP4 hard-jumps between kept ranges.
- B-roll is full-cover only (no PiP mode or b-roll audio ducking yet).
- HyperFrames post-export (`openklip package`) is opt-in: requires separate `hyperframes` npm install and Chrome; not bundled.
- `product-announcement` is the only json-render graphic catalog today; `json-graphic-add` / `json-graphic-set` accept no other type. An invalid json-render spec now shows an "Invalid graphic spec" card in the editor preview, but still degrades silently on export (the graphic is skipped).
- json-render timeline interactions (select / trim / reload) and the smaller-screen Chat/Config overlay flows are wired and unit-covered but not yet verified end to end in a browser.

### Audio & music

- Music placements have no timeline drag-trim (adjust from/to in the Config panel Music section), no voice-aware ducking, and no loudness normalization.
- Preview caps music gain at 1.0; export honors gains up to 2.0.

### Editing & transcript

- Whisper word timestamps are ~100 ms loose; cuts can clip a phoneme until VAD-snapping lands.
- Cuts are word-boundary based; no VAD snap-to-silence or equal-power audio crossfade at boundaries yet.
- Phrase-anchored overlays re-snap to their anchor on every cut: a manual `*-set` span on a phrase-placed overlay can be re-moved by the next word deletion (place a plain `*-add` overlay to pin a span). A deleted anchor phrase leaves the overlay `stale` with its last good span until the words are restored.
- Multi-take assembly is CLI/MCP-only (`take-add` / `takes` / `assemble`): no GUI take browser. Each take is ingested with the full ffmpeg + Whisper path and parked in `takes/<id>/`; `assemble` writes a new single-source project and needs `--force` to overwrite an existing edit.

### Workspace & platform

- Workspace folder picker is **macOS-only**; Linux/Windows need `OPENKLIP_PROJECTS_ROOT` or CLI ingest. Empty landing uploads or accepts a single dropped video; folder drop, multi-file intake, and primary-footage detection are not implemented.
- Ingester plugins are manifest + CLI discovery only (`openklip ingesters`); no GUI URL/batch ingest flow.
- Browser uploads buffer the whole video file in memory before the temp write; streaming the body and a size limit are a follow-up.
- `actions.jsonl` has no rotation, and history reads parse the whole file before applying the 200-entry response limit; tail-reading and rotation are a follow-up.
- A persist-source failure after a successful ingest marks the job errored even though the project exists on disk (it opens fine, but exports fall back to the proxy); partial-success surfacing is a follow-up.

### Agent & chat

- OpenKlip ships **no bundled LLM** for the core edit loop; external agent, MCP, or manual CLI drives mutations.
- **Claude chat edits** load the openklip MCP server and mutate `project.json` in-process. Other agents answer via CLI or return read-only hints; skills slash menu still routes to suggested command sequences.
- **Find filler** and **Describe assets** shell out to the selected agent CLI; needs that CLI on PATH and signed in. Cursor requires one-time `cursor-agent login`.

### Design & UI (non-blocking polish)

- Hero title inspector uses a hand-rolled `<textarea>` instead of the shared `Textarea` primitive (`web/app.tsx`).
- Delete confirmation microcopy uses `text-[11px]` in asset bin, project delete, and chat preview.
- Video player layer stays black/white by design (Linear cinema parity); not tokenized to the editor chrome.

### Architecture & parity

- GUI server actions do not dispatch through `runAction()`: CLI uses `src/registry.ts`; GUI uses `app/actions.ts` + `projectMutations` (same `project.json`, separate code paths).
- Project write locks are in-process only. Two concurrent **processes** writing the same slug (e.g. CLI agent + running editor server) can still race; the `revision` counter shares the same limit, so cross-process revision bumps can race.
- Action history logs registry and GUI mutations only: non-registry CLI paths (asset registration, template set, assembly) do not log yet. History has no filters and no undo. Multi-take `assemble` also rewrites `project.json` outside `mutateProject`, resetting the revision counter without a history entry.
- `ProjectSchema` strips unknown keys on parse: an older OpenKlip build that saves a project created here would silently drop newer fields (for example `music`, `revision`). Adopt a forward-compat policy (passthrough or version gating) before the next schema addition.
- Batch phrase cuts persist the phrase (`cut-text`), not the resolved word ids: if an external agent edits the transcript between render and save, the server can cut different words than the optimistic UI showed. The serialized save chain makes this unlikely; reload after external CLI edits (already the rule below).
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

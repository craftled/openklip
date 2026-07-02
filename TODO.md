# OpenKlip - Roadmap

## Status

OpenKlip is a lean, local-first **agent-native video toolchain**: external agents drive the edit loop via CLI; humans review in the browser. Both read/write the same `project.json` on disk.

**Current release:** v0.15.0.0 (2026-07-02 in `VERSION`, `package.json`, and `CHANGELOG.md`). Working local editor: cut → captions (five style presets: boxed, clean, karaoke, bold-caps, minimal) → cleanup review (filler/dead-air candidates) → b-roll → vignette → push-in zoom → titles → grade/LUT → rich graphics → json-render product announcement graphics → music placement → export audio quality (VAD snap, seam crossfades, ducking, loudness) → export; browser project creation (upload or drop a video onto the empty workspace); transcript phrase search with batch cuts and restore; real export settings (compression presets + output frame rate); append-only action history covering every user-facing mutation, with pre-mutation snapshots, task-level revert (`openklip revert`, MCP `revert`, GUI History panel), and agent-queryable history/task lookups (`openklip history`/`tasks`, MCP `history_list`/`task_list`); project brief with CLI/MCP/GUI parity; agent tasks with visible progress and cancel; `make-draft` and `revise-draft` one-prompt playbooks; cinema player with live graphics/titles/captions overlays; resizable right chat sidebar with Claude MCP edits; right-side Config shell with color temperature controls; smaller-screen Chat and Config overlays; asset cards (`openklip analyze` + **Describe assets**); skills slash menu; MCP agent tools (71 tools); 39 registry actions; edit templates; native HTML/CSS graphics templates (pixel-faithful headless-Chrome export to ProRes 4444 alpha); default shadcn neutral theme with Base UI primitives; export dialog; macOS workspace folder picker; multi-agent filler cuts; sidebar asset bin with folder sync; written rationale notes on cuts/overlays; phrase-anchored cues that re-snap after a re-cut; multi-take assembly; 1187 tests; MIT.

Preview cuts get a Glimm WebGL sweep in the browser. Exported MP4s can use VAD-snapped audio seam crossfades when cut snap is enabled; visual transition shaders and whoosh-style cut transitions are still pending.

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
- [x] **TDD test suite** (`bun test`: 1131 tests across actions, captions, EDL, exporter, project lock, chats, assets, workspace, agent-tools, templates, graphics, headless render, reanchor, multi-take assembly, product announcement, audio analysis, cleanup, cut snap, revert, and more)
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
- [x] **UI phrase search and batch cuts** (v0.11.0.0): transcript panel search bar (Mod+F, Kept/Cut scopes) built on the same `findPhraseRuns` engine as the CLI (`web/lib/phrase-search.ts`, parity pinned against `grepTranscript`); match list with click-to-seek and select-as-span; batch Cut first / Cut all and Restore / Restore all with affected-word counts and optional note (`web/components/transcript-search.tsx`); the `cut-text` action gained the `gui` surface.
- [x] **Music placement** (v0.11.0.0): `music` array on `project.json` (`MusicPlacementSchema` in `src/edl.ts`; legacy projects parse unchanged); `music-add` / `music-set` / `music-rm` registry actions on cli+gui+mcp; exporter mixes each placement as one continuous window (aloop/atrim/volume/afade/adelay + amix); preview plays the bed via a synced hidden audio element with a mute toggle; Config panel Music section + placed-music timeline track.
- [x] **Real export settings** (v0.11.0.0): compression presets studio / social / web / web-low (`encoderArgsFor`) and output frame rate (`resolveOutputFps`) in `src/exporter.ts`, wired through the export dialog (live size/time estimate), `POST /api/projects/[slug]/export`, `openklip export --fps --compression`, and the MCP export tool.
- [x] **Append-only action history** (v0.11.0.0): `src/action-log.ts` writes `working/actions.jsonl` (action, actor, input/result summaries, timestamp, revision before/after) for every registry mutation across GUI/CLI/MCP plus GUI direct-save paths, via `mutateProject` meta; optional `revision` counter on `project.json` bumped inside the write lock; `GET /api/projects/[slug]/history` + History section in the Config panel; `OPENKLIP_ACTOR` attributes GUI-spawned agent edits.
- [x] **Browser project creation hardening** (v0.11.0.0): shared format validation on client + server (`src/video-formats.ts`); the uploaded source persists to the project root and `project.json` `source` points at it; drag-drop onto the empty workspace; explicit overwrite confirm on 409 that re-invokes with `?force=1`.
- [x] **Bundle-safe script paths** (v0.11.0.0): `src/script-paths.ts` anchors the transcribe script and graphic runtime entry at `repoPath` instead of `import.meta.dir` (compiled to undefined by Turbopack), fixing browser-triggered ingest, GUI verify, doctor, and rich-graphic export through Next server routes.
- [x] **Project brief artifact** (v0.12.0.0): `brief.md` at the project root (`src/brief.ts`: atomic tmp+rename save, 100KB cap, empty text clears the file); `openklip brief <slug> [--set <text...> | --file <path>]`; MCP `brief_get` / `brief_set` (20k char cap); `buildChatPrompt` / `buildEditPrompt` render a bounded "Project brief" section (2000-char truncation); GUI Brief section in the Config panel (`web/components/brief-editor.tsx`, `saveBrief` server action); brief loads server-side on page load. MCP `brief_set` writes a best-effort `brief-set` history entry with no EDL revision bump; GUI and CLI brief saves are not logged yet.
- [x] **Agent task model + progress UI** (v0.12.0.0): `working/tasks.json` store (`src/agent-tasks.ts` + pure `src/agent-task-types.ts`); `AgentTask` tracks id, request, chat id, status (pending/running/blocked/failed/completed/cancelled), per-step status/notes, and timestamps; persists across reload; `TaskProgressPanel` in the chat panel live-polls every 2s while a task runs, with a cancel button that POSTs cancel and kills the spawned CLI process via `src/agent-run-registry.ts`; MCP tools `task_step` / `task_complete` resolve the active task from the `OPENKLIP_TASK_ID` env var (an agent can only report on its own task); `chatWithAgent` creates the task, threads the id through `runClaudeEdit`'s MCP env, and finalizes it (failed on error, including a distinct timeout message, completed fallback) when the agent does not signal completion itself.
- [x] **Make-a-draft playbook** (v0.12.0.0): `templates/make-draft/skill.md` (auto-listed in the skills slash catalog) walks an agent through status/brief/transcript/assets, filler cuts, titles/captions, b-roll or stills, an optional music bed, export, and self-verify, reporting progress via `task_step`/`task_complete`; the edit-run timeout was raised to 900s (was 240s) so a full draft run does not get killed mid-verify.
- [x] **Smoke fixture project** (v0.12.0.0): a full smoke project (talking-head source, 3 b-roll clips, 2 stills, 1 music track, `brief.md`, `talking-head` template) now exists for end-to-end verification of the done-for-you draft loop.
- [x] **Audio analysis engine** (v0.13.0.0): `src/audio-analysis-core.ts` (pure) + `src/audio-analysis.ts` (Node IO) run RMS silence detection over the ingest-time `working/audio16k.f32` PCM (20ms windows, -38dBFS threshold, 300ms minimum span) and cache the result at `working/audio-analysis.json`, keyed on the source file's mtime and the analysis options, zod-validated on read, written atomically (tmp + rename).
- [x] **Cleanup candidates (filler + dead-air, with review)** (v0.13.0.0): `src/cleanup.ts` finds deterministic filler-word candidates (isolated core disfluencies like "um"/"uh"/"er" are safe; repeated "like"/"so" and multi-word phrases like "you know"/"sort of"/"kind of"/"i mean" are review) and dead-air candidates from real audio analysis (silences over 0.7s inside kept ranges; safe above a 1.2s raw gap; idempotent against already-applied dead-air spans; candidates within 0.3s of an overlay are forced to review with a warning). Surfaces: Cleanup section in the Config panel (apply per-row or all-safe), `openklip cleanup <slug> [--json] [--apply-safe]`, and the MCP `cleanup_report` tool. Safe candidates apply via the `cut` action (filler) and `dead-air-add` (spans), both logged to action history.
- [x] **VAD cut snapping goes live** (v0.13.0.0): `cuts.snap` (already in the schema, previously unused by any range computation) now drives `effectiveRanges(project, silences)` in `src/edl.ts`: kept ranges minus dead air, then snapped onto nearby silence when `snap.enabled && mode === "vad"`. Wired through the exporter, preview scheduler, `compiledTimeline`, CLI/MCP `status`/`ranges`/`overlays`, the project summary, and the hover-card context, so every surface agrees on the same ranges; the GUI refreshes the loaded silence data (`router.refresh()`) the moment snap is turned on, no full page reload needed.
- [x] **Seam crossfades** (v0.13.0.0): when snap is enabled with `crossfadeMs > 0` and more than one surviving range, `buildSeamedVoiceParts` (`src/exporter.ts`) joins per-range voice segments with equal-power (`qsin`) `acrossfade`s that borrow up to `crossfadeMs / 2` of already-removed source audio on each side; each seam's duration is clamped to the available gap and both neighboring segment lengths, falling back to an 8ms fade-in/fade-out butt join under 4ms. Total output duration matches the plain (unsnapped) path exactly, proven by skip-gated ffmpeg smoke tests and a live E2E export where the snapped+crossfaded duration byte-matched the plain export at 64.5s.
- [x] **Ducking, loudness normalization, and voice highpass** (v0.13.0.0): `project.audio` (`src/edl.ts` `AudioSchema`) adds voice-aware music ducking (`sidechaincompress`, amount/attack/release), single-pass loudness normalization (`loudnorm` pinned back to 48kHz via `aformat` after ffmpeg's internal 192kHz upsample), and a voice highpass filter, all export-only (preview audio is unprocessed; the Config panel Audio section captions say so). `openklip audio <slug> [--duck ...] [--loudness ...] [--highpass ...]` and the Audio section in the Config panel. Live E2E on a real 4K export: a -16 LUFS target produced -16.6 LUFS integrated (single-pass loudnorm lands near, not exactly at, target).
- [x] **Dead-air spans** (v0.13.0.0): `cuts.deadAir` on `project.json` (`DeadAirSpanSchema`) registers source-time spans to drop from otherwise-kept ranges, applied by `effectiveRanges` regardless of snap. `dead-air-add` (cli/gui/mcp, up to 50 spans per call, coalesced against adjacent/overlapping spans, capped at 200 total) and `dead-air-rm` (cli/mcp only; no GUI remove/undo affordance yet) round-trip through action history.
- [x] **Transcript correction parity** (v0.13.0.0): `setWordText` (`src/actions.ts`) corrects one word's text without touching its timing, preserving the pre-correction text once in `word.originalText` on the first real edit; the GUI's bulk edit-words path shares the same preservation logic. `openklip word-text <slug> <wordId> <text...>` and the `word-text` action (cli/gui/mcp). Embedded whitespace (newlines, tabs) collapses to single spaces so a correction can't break the one-line ASS caption format.
- [x] **Assembly regenerates audio analysis inputs** (v0.13.0.0): `assembleFromSelection` (`src/assembly.ts`) re-extracts `working/audio16k.f32` from the newly assembled source (or removes the stale PCM if extraction fails) and drops the stale `working/audio-analysis.json` cache, so VAD snap and dead-air cleanup never analyze the previous recording's audio after a multi-take assembly.
- [x] **Caption robustness against boundary shifts** (v0.13.0.0): `keptWordsInOutputTime` moved into `src/captions.ts` as one shared implementation for the exporter and `compiledTimeline` (previously two copies); it now matches a word to a kept range by overlap rather than requiring the word's start to fall inside the range, so a VAD-snapped or dead-air-shifted boundary can no longer silently drop a caption for a word whose audio still plays.
- [x] **Task-level undo/revert** (Milestone 9.1, v0.14.0.0): action history now covers every user-facing mutation, not just registry actions, including previously-unlogged asset registration/deletion, `template set`, `brand`/`ingest --brand`, and multi-take `assemble` (which now writes through `mutateProject` instead of a raw file write, so it stops resetting the revision counter); brief saves from CLI/GUI/MCP share one best-effort `brief-set` entry; background folder-sync prune logs `asset-prune` under a new `system` actor. Every logged mutation writes a pre-mutation snapshot to `working/history/rev-<n>.json` (pruned to the newest 100). `src/revert.ts` restores a project to an earlier revision via a normal logged `revert` mutation (append-only, so a revert is itself revertible): CLI `openklip revert <slug> (--to <rev> | --task <id> | --last) [--force]`, MCP tool `revert` (manual tool, not a registry action), and a GUI History panel with per-entry and per-task revert, disabled when no snapshot exists or the entry crosses a multi-take assembly boundary. `ProjectSchema` is now `.passthrough()` so unknown top-level keys survive a load/save round-trip. Verification 2026-07-02: `tests/revert.test.ts`, `tests/project-forward-compat.test.ts`, `tests/history-panel.test.tsx`, and the wider `bun test` run (1117 tests, all green) exercise resolution/guards/snapshot pruning and the GUI revert flow.
- [x] **Transcript reconcile data-loss fix** (v0.14.1.0): `reconcileTranscriptText` (`web/lib/transcript-edit.ts`) marks a word deleted only when its token is absent from the edited text; a match or replace op preserves the word's existing `deleted` flag instead of clearing it, so restoring a cut word stays an explicit action (timeline toggle, search restore, cleanup, revert). Inserted text anchors only to non-deleted words (forward to the next kept match, else backward to the nearest preceding kept word), and `EditorTranscriptPanel`'s blur handler (`transcriptTextUnchanged`) skips the save entirely when the extracted text is token-identical to the current words. Behavior change: typing a deleted word's text back into the transcript no longer restores it. Verification 2026-07-02: `tests/transcript-edit.test.ts` and the wider `bun test` run (1131 tests, all green).
- [x] **`revise-draft` playbook** (v0.14.1.0): `templates/revise-draft/skill.md` (auto-listed in the skills slash catalog alongside `make-draft`) interprets a revision request against an existing draft: targeted edits (title, zoom, b-roll, music, caption changes) or a whole-task revert via `openklip revert`, with safety rails (never `--force` unprompted, re-read status after a revert, re-export after changes that affect the rendered output). Verification 2026-07-02: `tests/templates.test.ts` (listing + skill-content assertions alongside `make-draft`); not yet exercised end to end on a real project (no live run recorded).
- [x] **Caption style presets** (v0.15.0.0): five named presets (`boxed`, `clean`, `karaoke`, `bold-caps`, `minimal`) defined once in `src/caption-styles.ts`, consumed by both the cinema preview (`web/lib/caption-style-css.ts` + the shared `web/components/caption-line.tsx`, used by both the inline preview and the fullscreen player) and the export burn-in (`buildAss` in `src/captions.ts` maps the preset to an ASS style line). `captions.style` on `project.json` is read-tolerant (`z.enum(...).catch(DEFAULT_CAPTION_STYLE)`): an unknown or missing id resolves to `boxed` on load instead of throwing, so a project from a newer or older build never bricks; the `captions-style` action (cli/gui/mcp) stays strict on write. CLI `openklip captions-style <slug> <style>`, a "Caption style" picker in the Config sidebar with a live per-preset sample, and `project_status`/`status --json` report the active style. Two export bugs fixed alongside: ASS `WrapStyle` changed from `2` (no wrap, could clip a long line off-frame in portrait/narrow exports) to `0` (wraps), and `box.alpha`/outline alpha now actually reach the burned-in ASS colors for non-default presets instead of rendering fully opaque. The `boxed` default is pinned byte-for-byte identical to the pre-preset hardcoded look in both preview and export. Verification 2026-07-02: `tests/captions.test.ts`, `tests/caption-style-css.test.ts`, `tests/caption-style.test.tsx`, `tests/registry.test.ts`, `tests/project-forward-compat.test.ts` (tolerant-reader cases), and the wider `bun test` run (1187 tests, all green); live checks on an isolated copy of the `edgaras-raw` project: a real 4K source exported at `bold-caps` showed the correct all-caps tight-box look with dimmed inactive words, and a synthetic 1080x1920 libass render of a 16-word `bold-caps` line confirmed the `WrapStyle: 0` fix wraps instead of clipping; the Config sidebar picker was confirmed live in the browser (all five presets render with correct labels/samples and the current selection shows `pressed`).
- [x] **Agent history and task query tools** (v0.15.0.0): MCP `history_list` (`{slug, limit<=200, task?, action?}` to `{entries, snapshotRevisions}`) and `task_list` (`{slug, limit<=100, status?}` to `{tasks}`); CLI `openklip history <slug> [--limit] [--task] [--action]` and `openklip tasks <slug> [--limit] [--status]`, both printing a distinct message for "filter matched nothing" versus "genuinely empty." `templates/revise-draft/skill.md` now calls `task_list` to find candidate task ids and `history_list` to confirm which revisions a task touched (and whether a snapshot exists) before a whole-task revert, instead of only being able to reuse a task id already seen in the same conversation. Closes the "agents cannot query action history or task ids" gap (see Known Limitations history). Verification 2026-07-02: `tests/agent-tools.test.ts`, `tests/cli-tasks-history.test.ts`, and the wider `bun test` run (1187 tests, all green).

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

- [x] VAD snap-to-silence + equal-power crossfade at cut boundaries on export (tighten the ~100 ms-loose Whisper word boundaries; declick the seam). Preview stays unsnapped-audio/uncrossfaded; snap resolution is a 20ms window, not sample-accurate. See Completed.
- [x] Filler-word / dead-air auto-removal beyond the previous "Find filler" agent action (Descript-style batch pipeline with safe/review risk grading). See Completed.
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
- Glimm cut transitions are preview-only. Exported MP4s can crossfade audio seams when cut snap is enabled, but visual transition shaders and whoosh-style cut transitions are not implemented.
- B-roll is full-cover only (no PiP mode or b-roll audio ducking yet).
- HyperFrames post-export (`openklip package`) is opt-in: requires separate `hyperframes` npm install and Chrome; not bundled.
- `product-announcement` is the only json-render graphic catalog today; `json-graphic-add` / `json-graphic-set` accept no other type. An invalid json-render spec now shows an "Invalid graphic spec" card in the editor preview, but still degrades silently on export (the graphic is skipped).
- json-render timeline interactions (select / trim / reload) and the smaller-screen Chat/Config overlay flows are wired and unit-covered but not yet verified end to end in a browser.

### Audio & music

- Music placements have no timeline drag-trim (adjust from/to in the Config panel Music section).
- Preview caps music gain at 1.0; export honors gains up to 2.0.
- All export audio quality processing (ducking, loudness normalization, voice highpass, seam crossfades) is export-only; preview audio is always unprocessed.
- Single-pass loudnorm lands near, not exactly at, the target (a live 4K export measured -16.6 LUFS integrated against a -16 LUFS target); two-pass loudnorm for exact targeting is a future upgrade.
- Seam crossfades borrow up to half their duration from already-removed audio on each side of a cut; very short kept ranges clamp the crossfade down to a duration-preserving butt join instead.
- `dead-air-rm` is still CLI/MCP only: the Cleanup panel adds spans but has no button to remove a registered one. The GUI History panel's revert (see Architecture & parity) can undo an unwanted `dead-air-add` after the fact, but that is not the same as a dedicated remove affordance.
- `src/audio-analysis.ts` reads the whole ingest-time PCM (`working/audio16k.f32`) into memory for silence detection; fine for typical footage, unbounded for hours-long sources.
- Noise reduction and de-essing are not implemented.

### Editing & transcript

- Whisper word timestamps are ~100 ms loose. VAD snap-to-silence (`cuts.snap`, GUI Config panel Audio section / MCP `cuts-snap` action) tightens cut boundaries onto detected silence when enabled, and seam crossfades reuse a few ms of removed audio to declick the join; snap resolution is bounded by the 20ms audio-analysis window (not sample-accurate), and there is no dedicated CLI subcommand for `cuts.snap` yet (GUI/MCP only).
- Cleanup candidates (filler words, dead air) split "safe" (fine to auto-apply) from "review" (ambiguous fillers, multi-word phrases, anything within 0.3s of an overlay); only "safe" candidates are meant for unattended auto-apply, review candidates need a human or explicit agent judgment call. The filler token/phrase list is fixed in code; no surface lets a user configure it yet.
- Phrase-anchored overlays re-snap to their anchor on every cut: a manual `*-set` span on a phrase-placed overlay can be re-moved by the next word deletion (place a plain `*-add` overlay to pin a span). A deleted anchor phrase leaves the overlay `stale` with its last good span until the words are restored.
- Multi-take assembly is CLI/MCP-only (`take-add` / `takes` / `assemble`): no GUI take browser. Each take is ingested with the full ffmpeg + Whisper path and parked in `takes/<id>/`; `assemble` writes a new single-source project and needs `--force` to overwrite an existing edit.
- Phrase search (UI and CLI/MCP `transcript grep`/`phrase`) can miss a cut phrase when Whisper's tokenization of the spoken audio differs from the phrase text a user or agent types; the search returns an honest empty result rather than a fuzzy guess.
- The transcript contentEditable does not restore a cut word when you type its text back into place (behavior change, 2026-07-02): deleted words stay visible, struck through, in the editable text, so a word's text merely reappearing is not treated as evidence of restoration and the word keeps its `deleted` flag. Restoring a cut word is always an explicit action: the timeline toggle, transcript search Restore/Restore all, Cleanup revert, or `openklip revert`.
- Caption style presets (v1, 2026-07-02) are five fixed definitions in `src/caption-styles.ts`: all Arial, no custom fonts, no custom per-project colors, and no way to add a sixth preset without a code change. Preview and export emphasize the active word identically by contract (same `accentColor`/opacity rules), but the two renderers are still separate implementations (CSS vs libass), so font rendering (antialiasing, glyph metrics, exact pixel size) differs browser-vs-libass even for the same preset. Per-platform caption safe areas are still not implemented (see Milestone 8).

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
- Agent tasks (`working/tasks.json`) are cross-process safe (an advisory lockfile serializes the Next server and the spawned MCP process, so a stale step report cannot resurrect a cancelled task) and cancel kills the run's whole process group. Remaining gap: the run registry (`src/agent-run-registry.ts`) is in-process memory, so a dev-server restart mid-run orphans the spawned process group and leaves the task record `running` with no live cancel target.
- `make-draft` and `revise-draft` (Milestone 2.2) playbooks are written; `make-short` (vertical reframe) does not exist yet.
- Agents can now query action history and past task ids (`openklip history`/`tasks`, MCP `history_list`/`task_list`, 2026-07-02); `revise-draft` uses `task_list` plus `history_list` to find the task that produced a draft instead of only reusing a task id already seen in the same conversation. Neither query tool supports filtering by actor; `history_list`/`openklip history` cap at 200 entries and `task_list`/`openklip tasks` at 100, same limits as the underlying stores.

### Design & UI (non-blocking polish)

- Hero title inspector uses a hand-rolled `<textarea>` instead of the shared `Textarea` primitive (`web/app.tsx`).
- Delete confirmation microcopy uses `text-[11px]` in asset bin, project delete, and chat preview.
- Video player layer stays black/white by design (Linear cinema parity); not tokenized to the editor chrome.

### Architecture & parity

- GUI server actions do not dispatch through `runAction()`: CLI uses `src/registry.ts`; GUI uses `app/actions.ts` + `projectMutations` (same `project.json`, separate code paths).
- Project write locks are in-process only. Two concurrent **processes** writing the same slug (e.g. CLI agent + running editor server) can still race; the `revision` counter shares the same limit, so cross-process revision bumps can race.
- Action history now covers every user-facing mutation: registry actions, GUI direct-save paths, asset registration/deletion, `template set`, `brand`/`ingest --brand`, multi-take `assemble` (through `mutateProject`, revision counter preserved), background folder-sync prune (`asset-prune`, actor `system`), and brief saves from CLI/GUI/MCP (one best-effort `brief-set` entry, no EDL revision bump). Revert (`openklip revert`, MCP `revert`, GUI History panel) undoes to a revision, a task's start, or the last edit. Agents can filter history by task id or action name (`openklip history`/MCP `history_list`, 2026-07-02), but there is still no actor filter, and the GUI History panel itself has no filter UI. Revert restores `project.json` only: `brief.md`, chats, tasks, asset files, and derived media (proxy, extracted audio, transcript) are not restored, snapshots are capped at the newest 100 revisions, and a revert cannot cross a multi-take `assemble` boundary (refused, since the on-disk media no longer matches). A CLI/MCP revert while the editor is open in a browser leaves the client stale until the next reload, the same pre-existing class as any external edit; GUI-initiated reverts reseed the open editor's state directly.
- `ProjectSchema` is now `.passthrough()`: unknown top-level keys survive a load/save round-trip instead of being silently dropped by an older build, closing the previous forward-compat gap.
- Revert only touches `project.json`, not the files an edit created or removed. Reverting an `asset-add` while the file is still in the `assets/` folder does not stick: the next folder sync re-registers it (folder contents win; delete the file too if you want the revert to hold). Reverting an `asset-rm` cannot bring back a deleted file; the restored registration itself gets pruned by the next folder sync (logged as `asset-prune`).
- Batch phrase cuts persist the phrase (`cut-text`), not the resolved word ids: if an external agent edits the transcript between render and save, the server can cut different words than the optimistic UI showed. The serialized save chain makes this unlikely; reload after external CLI edits (already the rule below).
- Reload the browser after CLI edits to see changes in the editor.
- A local `.openklip/projects-root` affects `projectsRoot()` for CLI and server started from that cwd (intentional; isolate tests with a clean temp cwd).

### Not implemented (see Roadmap / Pending)

- Vertical shorts (9:16 reframe) and LLM highlight detection.
- Noise reduction and de-essing (basic audio cleanup); two-pass loudness normalization for exact-target loudness.
- OpenCLIP semantic b-roll matching.
- OS-level file locking for concurrent CLI + server writes.
- Demo gif + repo topics.

## README policy

See **AGENTS.md** (Project rules → README policy). Roadmap items stay in this file only.

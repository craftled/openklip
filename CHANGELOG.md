# Changelog

## 0.27.0.0 - 2026-07-03

Safe-area preview guides, vertical split export layout, and asset must-use/avoid flags.

### Added
- **Safe-area guides** (`src/safe-areas.ts`, `web/components/safe-area-guides.tsx`): portrait preview overlays for TikTok, Reels, YouTube Shorts, and a generic vertical preset; toggle stored in local preferences (not `project.json`).
- **Vertical split export layout**: `project.export.layout` (`fill` | `split-vertical`) with `splitVertical.ratio` and `speakerPosition` (`top` | `bottom`); ffmpeg `buildVerticalSplitFilter` stacks speaker and content panes after reframe; GUI Fill / Split vertical controls in Reframe (9:16); CLI `export-set --layout`, `--split-ratio`, `--split-speaker`.
- **Asset must-use / avoid flags**: optional `mustUse` and `avoid` on registered assets; `asset-flags` registry action, `openklip asset-flags <slug> <assetId> [--must-use|--avoid|--clear]`, GUI badges in the asset bin; `list_assets` and `project_status` expose flags; `make-draft` skill respects them.

### Changed
- **Version**: bumped OpenKlip to `0.27.0.0`.

## 0.26.0.0 - 2026-07-03

Multi-clip highlight export and Highlights GUI panel.

### Added
- **Multi-clip export**: `exportCut` accepts `sourceSpan` and `outPath`; clips render to `output/highlights/{id}.mp4` without mutating `project.json`.
- **CLI**: `openklip export-highlight <slug> <h1|all> [--platform shorts]`.
- **`bun run agent-make-highlights`**: exports every stored highlight with the shorts preset (`--ids`, `--dry-run`, `--skip-export`, `--skip-verify`).
- **GUI Highlights panel**: Config section lists clip candidates, seeks preview on row click, **Detect clips** runs LLM highlight detection (`runHighlightsDetect` server action).

### Changed
- **Version**: bumped OpenKlip to `0.26.0.0`.

## 0.25.0.0 - 2026-07-03

LLM highlight detection, Vision saliency/OCR, and GUI Vision focus.

### Added
- **LLM highlight detection** (`src/highlights.ts`): `openklip highlights <slug>` lists clip candidates; `openklip highlights-detect <slug>` runs an LLM over the timed transcript and stores `project.highlights`. MCP `highlights_list`; `project_status` reports clip count when present.
- **Vision saliency + OCR**: `tools/vision-focus.swift` falls back from face to attention saliency and attaches on-frame OCR text in the JSON sidecar (`source: face|saliency|ocr`).
- **GUI Vision focus**: Reframe controls show a macOS-only "Vision focus" button (`runVisionFocus` server action) that enriches speaker sceneLog segments and switches to scene crop mode.

### Changed
- **Version**: bumped OpenKlip to `0.25.0.0`.

## 0.24.0.0 - 2026-07-03

macOS Vision face detection for vertical reframe focus.

### Added
- **Vision sidecar** (`tools/vision-focus.swift`, `src/vision-focus.ts`): on macOS, detects the largest face in ingest frames via Apple Vision and returns normalized `focusX`/`focusY` for reframe crop.
- **`openklip vision-focus <slug>`**: enriches speaker `sceneLog` segments with Vision-derived focus coords (logged as `vision-focus`).
- **`cropMode: vision`** on `project.export`: `export-set --crop-mode vision` samples ingest frames and stores face-derived crop (CLI computes focus before the registry write).
- **`agent-make-short`**: on macOS with ingest frames, runs `vision-focus` enrichment before export-set; falls back to direct `vision` crop when no sceneLog exists.

### Changed
- **Version**: bumped OpenKlip to `0.24.0.0`.

## 0.23.0.0 - 2026-07-03

Scene-log focus coordinates and a deterministic make-short agent loop.

### Added
- **Scene segment focus coords**: optional `focusX`/`focusY` (0-1) on `SceneSegment`; scene-log prompt asks the vision model for speaker face center; `parseSceneLog` clamps and stores them; `suggestCropFromSceneLog` duration-weights per-segment focus.
- **`agent-make-short` script**: `bun run agent-make-short <slug>` sets 9:16 + scene/manual crop mode, exports with the `shorts` preset, and verifies. Flags: `--max-sec`, `--dry-run`, `--skip-export`, `--skip-verify`.

### Changed
- **Version**: bumped OpenKlip to `0.23.0.0`.

## 0.22.0.0 - 2026-07-03

Scene crop mode, revise-draft convert-to-short, and make-short loop verification.

### Added
- **Scene crop mode** (`cropMode: manual|scene` on `project.export`): when `scene`, `export-set` derives crop focus from `sceneLog` speaker spans via `src/auto-crop.ts`. GUI Manual/Scene toggle in Reframe controls when a scene log exists. CLI `--crop-mode manual|scene` on `export-set`.
- **`revise-draft` convert-to-short path**: section 3b routes Shorts/Reels/TikTok requests through `export-set` + `shorts` export without reverting the draft.
- **`make-short` loop test** (`tests/make-short-loop.test.ts`): documents export-set 9:16 + shorts preset resolution.

### Changed
- **Version**: bumped OpenKlip to `0.22.0.0`.

## 0.21.0.0 - 2026-07-03

The vertical export reframe release: landscape talking-head edits can export to 9:16 Shorts/Reels/TikTok with a manual pan/zoom crop shared by preview and ffmpeg.

### Added
- **Export aspect and reframe crop** (Track F): `project.export` on `project.json` stores `aspect` (`source`, `16:9`, `9:16`, `1:1`) and `crop` (`focusX`, `focusY`, `scale` 1–3). `src/export-aspect.ts` shares dimension math, crop box calculation, ffmpeg `crop`+`scale` filter construction, and preview `object-position` between the GUI and exporter.
- **`export-set` action** (cli/gui/mcp): patch aspect and crop for preview/export parity. CLI `openklip export-set <slug>` plus one-off `openklip export --aspect` / `--crop-focus-x` / `--crop-focus-y` / `--crop-scale` overrides.
- **`shorts` platform preset**: 9:16 vertical, 30fps, 1920 height cap, social compression, -14 LUFS. Platform picker in the GUI export dialog; MCP `export` tool and HTTP export route accept `aspect` and `crop`.
- **GUI reframe controls**: Config sidebar Reframe section (focus X/Y, zoom); editor orientation toggle (16:9 / 9:16 / 1:1) persists `project.export.aspect`; preview applies the same crop when a fixed aspect is active.
- **`project_status` reports export settings**: aspect and crop appear in `status --json` / MCP `project_status`.

### Changed
- **Version**: bumped OpenKlip to `0.21.0.0`.

## 0.20.0.0 - 2026-07-03

The richer title styles release: three new editorial title positions beyond lower, center, and hero.

### Added
- **Title style presets** (Milestone 5.2): `position` on title cards now accepts `quote` (centered italic quote + optional attribution line), `divider` (centered section label wrapped as `- LABEL -`), and `callout` (compact top-left label). ASS export adds matching styles in `buildTitlesAss`; preview renders them in `PreviewOverlays`. CLI/MCP/registry/GUI position picker parity.

### Changed
- **Version**: bumped OpenKlip to `0.20.0.0`.

## 0.19.0.0 - 2026-07-03

The b-roll split-screen release: a third display mode places the speaker on the left and b-roll on the right.

### Added
- **B-roll split display** (Milestone 5.2): `display: "split"` on b-roll placements composites a 50/50 landscape split (speaker cropped left, b-roll right) at preview and export via `hstack` in `buildBrollOverlayFilters`. CLI/MCP/registry/GUI Cover/PiP/Split toggle parity.

### Changed
- **Version**: bumped OpenKlip to `0.19.0.0`.

## 0.18.0.0 - 2026-07-03

The b-roll audio modes release: a placed b-roll clip can mix its soundtrack with the voice at export, not only swap the picture.

### Added
- **B-roll audio modes** (Milestone 5.2): each b-roll placement gets an `audioMode` field: `silent` (default, voice only), `broll` (b-roll audio only during the span), `mix` (mix with voice), `duck-voice` (duck voice under b-roll), `duck-broll` (duck b-roll under voice). Shared helpers in `src/broll-audio.ts` trim and delay b-roll audio from the same `-i` inputs as the video overlays, then mix through `buildAudioParts`. Surfaces: CLI `openklip broll-add` / `broll-set --audio-mode`, registry / MCP, `listOverlays`, and an Audio picker in the GUI b-roll inspector. Preview audio stays voice-only for now.

### Changed
- **Version**: bumped OpenKlip to `0.18.0.0`.

## 0.17.0.0 - 2026-07-03

The b-roll PiP release: a placed b-roll clip can keep the speaker on screen instead of always swapping the full frame.

### Added
- **B-roll display modes** (Milestone 5.2): each b-roll placement gets a `display` field: `cover` (default, full-frame swap) or `pip` (bottom-right inset at ~28% frame width, speaker stays visible). Shared helpers in `src/broll-display.ts` drive preview and export: cover scales/crops to the output frame; pip scales to an inset box with transparent pad and composites with `overlay=W-w-M:H-h-M`. Legacy projects without `display` parse as `cover`. Surfaces: CLI `openklip broll-add` / `broll-set --display cover|pip`, registry `broll-add` / `broll-set`, MCP tools, `listOverlays` / `project_overlays`, and a Cover/PiP toggle in the GUI inspector with matching preview (push-in zoom still applies under cover b-roll only).

### Changed
- **Version**: bumped OpenKlip to `0.17.0.0`.

## 0.16.0.0 - 2026-07-03

The export platform presets release: exporting for a destination is now one pick instead of four separate flags to remember.

### Added
- **Export platform presets** (Milestone 8.1): four named presets in `src/export-platforms.ts`: `youtube` (1080p, social compression, -14 LUFS), `youtube-4k` (2160p, studio compression, -14 LUFS), `x` (1080p, 30fps, web compression, -14 LUFS), `linkedin` (1080p, 30fps, web compression, -14 LUFS). A preset supplies defaults only: `resolvePlatformOptions` fills any of compression/fps/maxHeight/loudnessTargetLufs the caller left unset, and any explicitly passed option always wins (`--platform youtube --fps 24` exports at 24fps). `maxHeight` is a source-capped ceiling, never an upscale (`youtube-4k` on 1080p footage exports 1080p). A preset's loudness target applies `loudnorm` for that export invocation only and never mutates the project's saved `audio.loudness`. All four surfaces get it from one resolution point in `exportCut`: CLI `openklip export --platform <id>` plus a new `--loudness <lufs>` override flag, the export API route, the `exportProject` server action, the MCP `export` tool (all accept `{ platform, loudnessTargetLufs }`), and a Platform picker in the GUI export dialog that sets the visible compression/fps/resolution controls to the preset's values and shows a "-14 LUFS" note when a target applies. `project_status` is unaffected. v1 ships landscape-honest presets only; vertical destinations (TikTok, Reels, Shorts) need the 9:16 reframe milestone before a preset for them would do what its name promises.

### Fixed
- **Export dialog 4K resolution mismatch**: the dialog's "4K" resolution control could submit the source height instead of the intended ceiling, so the displayed dimensions, the size/time estimate, and the actual rendered output could disagree. `outputDimensionsForMaxHeight` and `effectiveMaxHeight` (`web/components/export-dialog.tsx`) now compute one shared maxHeight for display, estimates, and the submitted export request, and `web/lib/export-max-height.ts`'s `resolveExportMaxHeight` stops the legacy `export1080` toggle from silently overriding a dialog-supplied maxHeight (including `undefined` for Manual + Source) on the first export of a session.

### Changed
- **Version**: bumped OpenKlip to `0.16.0.0`.

## 0.15.0.0 - 2026-07-02

The caption style presets release: captions have a real look system instead of one hardcoded box, and agents can finally query action history and past task ids instead of only reverting blind.

### Added
- **Caption style presets**: five named presets (`boxed`, `clean`, `karaoke`, `bold-caps`, `minimal`) defined once in `src/caption-styles.ts` and consumed by both renderers, the cinema preview (`web/lib/caption-style-css.ts` maps a preset to CSS for the shared `CaptionLine` component used by both the inline preview and the fullscreen player) and the export burn-in (`buildAss` maps the same preset to an ASS style line). `captions.style` on `project.json` is read-tolerant: an unknown or missing id parses to `boxed` so a project written by a newer or older build never bricks on load; the writer side (the `captions-style` action) stays strict and rejects an unrecognized id. New registry action `captions-style` (cli/gui/mcp), CLI `openklip captions-style <slug> <style>`, and a "Caption style" picker section in the Config sidebar with a live per-preset sample. The `boxed` default reproduces the previous hardcoded look byte-for-byte in export and preview.
- **Agent history and task query tools**: MCP `history_list` (`{slug, limit<=200, task?, action?}` to `{entries, snapshotRevisions}`) and `task_list` (`{slug, limit<=100, status?}` to `{tasks}`), plus CLI `openklip history <slug> [--limit] [--task] [--action]` and `openklip tasks <slug> [--limit] [--status]` (status validated, filtered-empty and genuinely-empty results print distinct messages). `templates/revise-draft/skill.md` now calls these tools to find the task that produced a draft before a whole-task revert, instead of only being able to reuse a task id already seen in the same conversation. This closes the "agents cannot query action history or task ids" gap in Known Limitations.
- **`project_status` reports caption style**: `captions.style` is now part of the `project_status` JSON (CLI `status --json` and MCP `project_status`).

### Fixed
- **Caption export clipping in portrait/narrow frames**: the ASS header now emits `WrapStyle: 0` (libass smart wrapping) instead of `WrapStyle: 2` (no wrap) for every preset, so a long caption line wraps onto multiple lines instead of running off the right edge of the frame. This was a pre-existing bug, not new behavior from the presets.
- **Box and outline alpha now reach the burn-in**: non-default presets' `box.alpha` previously had no effect on the exported ASS `OutlineColour`; it now sets the alpha byte correctly, so `clean`/`karaoke`/`bold-caps`/`minimal` render with their intended translucency instead of full opacity.
- **Active-word emphasis follows the preset contract**: the active word now uses the preset's `accentColor` when defined (`karaoke`), or relies on opacity dimming of the other words to read as emphasized when it is not (matching the preview); `boxed` keeps its legacy accent-color behavior unchanged.

### Changed
- **Version**: bumped OpenKlip to `0.15.0.0`.

## 0.14.1.0 - 2026-07-02

A trust-completion patch: the transcript editor no longer risks resurrecting cut words on a stray edit, and a new `revise-draft` playbook lets an agent make targeted edits or a whole-task revert to an existing draft.

### Fixed
- **Transcript reconcile no longer resurrects cut words**: `reconcileTranscriptText` (`web/lib/transcript-edit.ts`) now marks a word deleted only when its token is absent from the edited text; a match or replace op preserves the word's existing `deleted` flag instead of clearing it. Restoring a cut word stays an explicit action (timeline toggle, search restore, cleanup, revert): typing a deleted word's text back into the transcript no longer restores it. Inserted text anchors only to non-deleted words (forward to the next kept match, or backward to the nearest preceding kept word when none follows), and a blur that extracts token-identical text no longer triggers a redundant `edit-words` save.

### Added
- **`revise-draft` playbook**: `templates/revise-draft/skill.md` (auto-listed in the skills slash catalog alongside `make-draft`) interprets a revision request against an existing draft: targeted edits (title, zoom, b-roll, music, caption changes) or a whole-task revert via `openklip revert`, with honest safety rails (never `--force` unprompted, re-read status after a revert, re-export after changes that affect the rendered output). Covered by `tests/templates.test.ts` alongside `make-draft`.

### Changed
- **Version**: bumped OpenKlip to `0.14.1.0`.

## 0.14.0.0 - 2026-07-02

The task-level undo/revert release: OpenKlip now logs every user-facing edit and can roll a project back to any of them. Previously-unlogged paths (asset registration and deletion, template/brand CLI commands, multi-take assembly, brief saves) now write to the same action history as everything else, every logged mutation keeps a pre-mutation snapshot on disk, and a new `revert` capability restores a project to an earlier revision, an agent task's starting point, or the last edit, from the CLI, MCP, or the History panel.

### Added
- **Full history coverage**: asset registration (`asset-add`), asset deletion (`asset-rm`), `openklip template set` (`template-set`), `openklip brand` and `ingest --brand` (`brand`), and multi-take `assemble` now log to `working/actions.jsonl` through `mutateProject`, the same path every other mutation uses. `assemble` also stopped resetting the revision counter: it continues the project's existing revision sequence instead of silently starting over. Background folder-sync prune logs `asset-prune` under a new `system` actor. Brief saves from CLI, GUI, and MCP share one best-effort `brief-set` entry (`src/brief-log.ts`), still with no EDL revision bump. Log entries carry an optional `taskId` (from `OPENKLIP_TASK_ID`) so an agent run's edits can be grouped and reverted together.
- **Pre-mutation snapshots**: every logged mutation now writes the project state from just before the change to `working/history/rev-<revisionBefore>.json` (atomic write, best-effort, pruned to the newest 100 revisions). `working/history/` joins `actions.jsonl`, `chats.json`, and `tasks.json` as user-edit-class state that is never regenerated.
- **Revert (task-level undo/redo)**: `src/revert.ts` restores a project to an earlier revision as a normal logged `revert` mutation, so the revision counter stays monotonic and a revert is itself revertible. Targets: `--to <rev>` (a specific revision), `--task <taskId>` (restores to just before the task's earliest entry; refuses without `--force` when a foreign revision-bumping entry, including one interleaved between the task's own entries, would also be discarded), `--last` (the newest revision-bumping entry). Guards: log-vs-revision consistency check before resolving `--task`/`--last`, an in-lock revision re-check that aborts cleanly on a concurrent edit, and a refusal to revert across a multi-take `assemble` boundary (the snapshot's source no longer matches the media on disk).
- **Revert surfaces**: CLI `openklip revert <slug> (--to <rev> | --task <id> | --last) [--force]`; MCP tool `revert` (a manual tool like `brief_set`, not a registry action, since it needs a disk read before it can mutate); GUI History panel gets per-entry "Revert to before this" with a two-step inline confirm, a task-group "Revert task" with a force second-confirm, and disabled affordances when no snapshot exists, an entry crosses an assemble boundary, or the history view is truncated at its 200-entry page limit. `GET /api/projects/[slug]/history` now also returns `snapshotRevisions` so the panel knows which entries are actually revertible. A GUI-initiated revert reseeds the open editor's client state from the returned project with no reload needed.
- **Forward-compatible project schema**: `ProjectSchema` (`src/edl.ts`) is now `.passthrough()`, so unknown top-level keys survive a load/save round-trip instead of being silently dropped by an older build.

### Changed
- **Version**: bumped OpenKlip to `0.14.0.0`.

## 0.13.0.0 - 2026-07-02

The cut and sound quality release: OpenKlip drafts now sound edited, not just cut. A Cleanup panel finds leftover filler words and dead-air pauses from real audio analysis and applies them with one click (agents get the same report as a tool); cut boundaries can snap to nearby silence with short crossfades so edits stop clicking; and music beds duck under speech while the whole mix normalizes to a loudness target.

### Added
- **Cleanup review**: deterministic filler detection (isolated "um"/"uh" style tokens are safe to auto-apply; phrases like "you know" are flagged for review) plus dead-air detection from the project's own audio (silences inside kept ranges), with risk levels, estimated time saved, and overlay-collision warnings. Review and apply per candidate or all-safe in the Config panel's Cleanup section, from `openklip cleanup <slug> [--json] [--apply-safe]`, or as the `cleanup_report` agent tool. Applying is idempotent: candidates you have already applied do not come back.
- **Silence-snapped cuts with seam crossfades**: the existing cut-snap setting now works. With snap enabled, cut edges move onto detected silence (up to a configurable shift), and exports join cuts with short equal-power crossfades clamped so total duration exactly matches the plain cut. Preview, export, CLI, and agent tools all compute the same snapped ranges.
- **Music ducking, loudness, and voice highpass**: per-project audio settings (Config panel Audio section, `openklip audio`, and the `audio` action) duck music under speech via sidechain compression, normalize export loudness to a LUFS target, and optionally high-pass the voice. All applied at export; captions in the UI say so honestly.
- **Dead-air spans**: explicit source-time spans removable from kept ranges (`dead-air-add`/`dead-air-rm` actions, coalesced and capped at the store layer).
- **Transcript correction parity**: `word-text` action and `openklip word-text` let agents and the CLI fix a misheard word the way the editor already could; the first correction preserves the original text.

### Fixed
- **Caption robustness**: captions are matched to output ranges by overlap, so a snapped or dead-air-shifted boundary can no longer silently drop a caption whose audio still plays.
- **Loudness sample rate**: loudness normalization pins the export back to 48 kHz (single-pass loudnorm otherwise upsamples the file to 96 kHz).
- **Crossfade safety**: per-seam fades clamp to what both sides can afford and fall back to a click-free butt join, so a very short kept range can never produce silent or truncated audio.
- **Assembly analysis freshness**: multi-take assembly regenerates the project's analysis audio from the assembled source, so snap and cleanup can never run against the previous recording.
- **Analysis cache integrity**: the audio-analysis cache validates its shape on read, recomputes when analysis options change, and survives concurrent writers.

### Changed
- **Version**: bumped OpenKlip to `0.13.0.0`.

## 0.12.0.0 - 2026-07-02

The Beta gate release: done-for-you agent drafts. Write a short brief for a project and every agent request follows it; watch the agent work step by step in a live task panel with a cancel button that actually stops the run; and turn one prompt into a finished draft with the make-a-draft playbook: cuts, captions, a title, b-roll or stills, a music bed, an export, and a self-check, all in one go.

### Added
- **Project brief**: a per-project `brief.md` (audience, goal, tone, must-use assets, avoid list, target length, export formats as free-form guidance) editable in the Config panel, via `openklip brief <slug> [--set | --file]`, and via MCP `brief_get` / `brief_set`; agents receive it in every chat and edit prompt, bounded and marked as user-editable configuration. MCP/agent writes to the brief are recorded in action history without bumping the EDL revision.
- **Agent tasks with live progress**: every tool-editing chat run is a persistent task (`working/tasks.json`) with the request, status, per-step progress the agent reports as it works, and an explicit completion signal (completed, partial with remaining work, or blocked with a question); the chat panel shows recent tasks live while a run is active, survives page reload, and its cancel button kills the running agent's whole process tree; a run that dies or times out is finalized honestly instead of hanging.
- **Make-a-draft playbook**: a `make-draft` entry in the skills slash menu walks the agent from brief and transcript straight through cuts, captions, a title, b-roll or stills, an optional music bed, export, and verify; the edit-run budget was raised to 15 minutes so a full draft with verification completes.

### Changed
- **Agent runs are cancellable and attributable**: cancel now terminates the spawned agent CLI and its ffmpeg/whisper children (process-group kill), a deliberate cancel reads as "Cancelled" in the chat instead of an error, and each run's MCP session is scoped to its own task id so concurrent runs cannot cross-report.
- **Version**: bumped OpenKlip to `0.12.0.0`.

### Fixed
- **Task store integrity**: task updates are cross-process safe (an in-flight step report can no longer resurrect a task you just cancelled), a corrupt `tasks.json` self-heals with a backup instead of wedging the panel, per-task steps are capped, and all agent-supplied task fields are clamped at the store layer.
- **Cancel safety**: cancelling a task now verifies the task belongs to the project before killing anything, so a cancel request can never terminate another project's run.
- **Export integrity**: exports write to a temporary file and move into place on success, so two exports racing (for example a manual export during an agent draft) can no longer corrupt `output/out.mp4`.
- **Brief saves are serialized** per project like every other project file, and the brief editor gained proper guidance text and save-state labels.
- **Task panel efficiency**: the progress panel polls on its intended 2-second cadence (a dependency bug made it poll as fast as the network allowed), hides itself when there is nothing to show, and caps its height so long step lists cannot push the composer off screen.

## 0.11.0.0 - 2026-07-02

The Alpha gate release: OpenKlip is now a capable local editor end to end. You can create a project from the browser by uploading or dropping a video, search the transcript and batch-cut phrases without touching the CLI, lay a music bed under the voice track that plays in preview and mixes into the export, pick real compression and frame-rate settings in the export dialog, and see every edit any surface made in a per-project action history.

### Added
- **Browser project creation**: upload or drag-drop a video onto the empty workspace or the New Project dialog; the source file is copied into the project folder (full-quality exports survive moved downloads), ingest progress is shown live, and re-uploading an existing project asks before replacing it.
- **Transcript search and batch cuts**: a search bar above the transcript (Cmd+F) finds phrases punctuation-insensitively across kept or cut words, seeks to matches, selects them as spans, and cuts or restores the first or every match with an optional note; matches are identical to `openklip transcript grep`.
- **Music placement**: register a music asset and place a bed with gain, fade in/out, source offset, and trim or loop mode; the bed plays under the voice in preview (with its own mute toggle) and exports through ffmpeg as one continuous mix that never restarts at cuts. New `music-add`, `music-set`, `music-rm` actions on CLI, GUI, and MCP, with placements shown in overlays, status, and the timeline.
- **Real export settings**: the export dialog's compression presets (Studio, Social Media, Web, Web Low) and frame rate (source, 24, 25, 30, 48, 60 fps) now change the rendered file; the same options are available as `openklip export --compression --fps`, in the export API route, and in the MCP export tool, and the size/time estimate follows the selection.
- **Action history**: every registry mutation from the GUI, CLI, or MCP appends to a per-project `working/actions.jsonl` with the action, actor, input and result summaries, and a revision counter; a History section in the Config panel and `GET /api/projects/<slug>/history` expose it.

### Changed
- **Upload validation**: the upload endpoint and both drop surfaces now reject non-video files up front with the supported-format list (MP4, MOV, M4V, WebM, MKV, AVI) instead of failing minutes later inside ffprobe, and concurrent uploads of the same project are refused while an ingest is in flight.
- **Export defaults**: the default export is byte-identical to previous releases (Social Media preset, source frame rate); settings only change the output when you change them.
- **Version**: bumped OpenKlip to `0.11.0.0`.

### Fixed
- **Browser-triggered engine paths**: transcription, verify, doctor, and rich-graphic export resolved helper scripts through a Bun-only API that the Next server bundle compiles to `undefined`, so ingest started from the browser failed mid-transcription; all four now resolve from the repo root.
- **Uploaded source persistence**: browser-created projects previously pointed at a deleted temp file, silently degrading exports to proxy quality; the upload is now kept inside the project folder under the project write lock.
- **Music mix correctness**: music chains resample to the 48 kHz grid before looping (non-48 kHz files looped the wrong span) and delay all channels (5.1 beds no longer smear across the cut); a missing music file now names the right asset kind in the export error.
- **Editor churn**: the music gain slider commits once per drag instead of dozens of times, timing fields commit on blur, the preview music element follows the playback-rate control, and invalid music timing is clamped client-side instead of surfacing a save error.

## 0.10.0.1 - 2026-07-01

Hardening follow-up to the json-render product announcement graphics. The reviewed hardening from the alternate json-render branch was ported onto the shipped v0.10.0.0 implementation; the branch's frame-to-`src/` refactor and its `accent`-on-`HeroStatement` change were intentionally not taken (they would have reverted the v0.10.0.0 accent-on-scene fix).

### Changed
- **Scoped MCP tools require an explicit slug**: a project-scoped session now rejects a slug-bearing tool called with no slug instead of silently running against the pinned project; genuinely slug-less tools still pass.
- **JSON graphic actions validate the spec**: `json-graphic-add` and `json-graphic-set` run full product-announcement spec validation inside the action schema, so invalid specs are rejected at the action boundary (CLI, GUI, MCP), not only at persistence.

### Fixed
- **EDL graphic ambiguity**: a graphic carrying `catalog` or `spec` fields without `type: "json-render"` is now rejected instead of parsed ambiguously.
- **Invalid json-render preview**: the editor overlay shows an "Invalid graphic spec" card with the first validation issue instead of rendering nothing.
- **Toggle group selection**: pressing the active item in a single-select toggle group no longer clears the selection; grouped multi-select removal is unchanged.

## 0.10.0.0 - 2026-07-01

OpenKlip can now build product announcement videos from a validated json-render spec, preview that same graphic in the editor, and export it through the normal project timeline. The editor also gains a cleaner right-side Config shell, smaller-screen Chat and Config access, and stronger agent tool guardrails.

### Added
- **Product announcement graphics**: added a catalog-constrained `product-announcement` json-render graphic type with static React rendering, preview overlays, and export support.
- **JSON graphic actions**: added `json-graphic-add` and `json-graphic-set` across CLI, GUI, MCP, and registry surfaces, plus overlay summaries for json-render graphics.
- **Product announcement playbook**: added a bundled `templates/product-announcement/skill.md` and pinned slash-catalog entry so agents can attach the playbook and create validated announcement graphics.
- **Chat trail and action states**: added chat thread history rendering, action status buttons, product announcement skill prompts, and focused tests for the new chat and action UI.
- **Config controls**: added the right-side Config shell, a color temperature pad, and small-screen Chat and Config overlay buttons.

### Changed
- **Agent edit tools**: Claude edit mode now allows the full OpenKlip MCP tool namespace while scoped sessions only expose the active project through project-listing tools.
- **Graphic ids and timing**: graphic overlays now use collision-resistant ids, share the json-render span validation path between add and patch, and render rich graphics for the clipped output duration after cuts.
- **Editor layout**: chat and config panels now behave as desktop sidebars and smaller-screen overlays, keeping controls reachable without adding a new route.
- **Version**: bumped OpenKlip to `0.10.0.0`.

### Fixed
- **Spec hardening**: product announcement specs now reject invalid accent values, oversized graph shapes, cyclic child graphs, orphaned elements, non-scene roots, and missing json-render catalog/spec fields before they reach preview or export.
- **Local tool hardening**: scoped MCP sessions no longer enumerate sibling projects.
- **Small-screen panels**: the Chat and Config sidebars no longer disappear below the desktop breakpoint.
- **Toggle group disabled state**: grouped toggle items now inherit the disabled state from their parent group.

## 0.9.0.0 - 2026-06-30

OpenKlip now uses the default shadcn theme as its UI baseline with Base UI primitives underneath app-owned wrappers. The editor keeps the familiar local-first workflow while removing the old custom theme layer, so future visual work can start from clean shadcn parity.

### Added
- **Static chat mockups**: added shadcn-style message, marker, attachment, empty, field, label, tabs, and message-scroller primitives for local testing of the chat UI examples.

### Changed
- **Default shadcn theme**: replaced the custom OpenKlip theme engine and palette JSON files with shadcn default CSS variables, dark-mode class handling, and shadcn registry-aligned primitives.
- **Base UI primitive layer**: migrated app-owned drawer and command wrappers to Base UI while preserving OpenKlip component exports and prompt menu behavior.
- **Editor chrome**: normalized buttons, sidebars, dialogs, selects, menus, sheets, tooltips, and timeline surfaces to use default shadcn tokens instead of bespoke success, info, sidebar-active, and foreground variants.
- **Agent chat empty state**: static marker and attachment examples now appear only in the empty mockup state, so existing chat threads stay focused on real messages.
- **Version**: bumped OpenKlip to `0.9.0.0`.

### Fixed
- **Sidebar shortcuts**: nested editor sidebars no longer compete for the same global keyboard shortcut, preserving the existing transcript and inspector toggles.
- **Theme boot**: added coverage for the no-flash color scheme script and dark-class application.

### Removed
- **Old theme code**: removed the custom theme catalog, theme schema, theme engine, bundled theme JSON presets, obsolete motion tests, and unused legacy UI wrappers.
- **Legacy primitive dependencies**: removed the old drawer and command packages now covered by Base UI wrappers.

## 0.8.10.0 - 2026-06-29

The edit carries more of itself as plain text: a written rationale on every decision, overlays that re-anchor to the spoken word after a re-cut, and multi-take assembly that stitches the best take per line into one editable source. Researched against four open editors (OpenCut, VibeFrame, Monet, craft-agents) and built red-green TDD (411 → 585 tests).

### Added
- **Written rationale (`note`)**: `openklip cut <slug> w5 --note "filler restart"` and an optional `note` on every overlay record the *why* of a pick. It surfaces in `openklip overlays`, the query/transcript views, and the MCP tools, but is metadata only and never reaches ffmpeg (pinned by an exporter no-op test). `--note ""` clears it.
- **Phrase-anchored cues**: `title-add-phrase` / `zoom-add-phrase` / `broll-add-phrase` now **remember** the spoken phrase on the overlay instead of forgetting it. After a re-cut, anchored overlays re-resolve their span to the current kept words automatically (on `cut` / `cut --text` / `restore`, CLI and GUI alike); if the phrase is deleted they flag `stale` and preserve the last good span; if it appears more than once the anchor follows a surviving instance. New `openklip reanchor <slug> [overlayId]` re-resolves on demand. New pure module `src/reanchor.ts`.
- **Multi-take assembly**: `openklip take-add <slug> <video>` ingests alternate takes into `takes/<id>/`; `openklip takes <slug>` lists them; the agent reads each take's transcript and picks the best line, then `openklip assemble <slug> <takeId:wStart-wEnd> ...` ffmpeg-concats the chosen segments into one `source.mp4` + a spliced, re-timed transcript: a normal single-source `project.json` the cut/overlay/export engine edits unchanged. Pure planner `src/assembly-plan.ts` (integer-exact splice) + `src/assembly.ts` (ffmpeg/Whisper shell); `assemble`/`list_takes`/`take_transcript` are agent query tools.

### Changed
- The EDL schema (`src/edl.ts`) gains `note?` on words and overlays, `PhraseAnchor` + `anchor?` on overlays, and `Take` / `AssemblySelection` / `AssemblyProvenance` + `Project.assembly?`. All optional/defaulted; `version` stays `1`, every legacy `project.json` parses unchanged. `src/exporter.ts` is untouched.

## 0.8.9.0 - 2026-06-28

Native graphics templates now export pixel-for-pixel and render in fullscreen. The rich render path is first-party (headless Chrome, no third-party engine), so an HTML/CSS template looks identical in the editor preview and the exported video.

### Added
- **Pixel-faithful rich graphics export**: `kind: "rich"` templates render through headless Chrome (`chrome-headless-shell` via `puppeteer-core`), driven by the SAME `web/lib/graphic-runtime.ts` the live preview uses, so export matches preview frame-for-frame. Frames are captured with a transparent background and encoded to a ProRes 4444 alpha MOV (`src/headless-render.ts`), then composited by ffmpeg as a timed overlay. ffmpeg stays the master compositor. Verified by hand end-to-end: the `title-card` template composites over the source video with real transparency (the automated test covers the missing-Chrome error path and skips real rendering when Chrome is absent).
- **Graphics, titles, and captions in the fullscreen player**: the overlay stack (`web/components/preview-overlays.tsx`) is now shared by the inline preview and the fullscreen cinema player, aligned to the letterboxed video box and synced to the player's own playback. Previously the cinema player showed the bare video with no live overlays.

### Changed
- The rich-graphics render seam (`src/graphic-render.ts`) emits a transparent ProRes MOV via the first-party headless renderer instead of a third-party producer. Chrome is an optional, one-time download (`bunx puppeteer browsers install chrome-headless-shell`); the default text/ASS path still needs no browser and runs fully offline.

### Removed
- **`@hyperframes/producer`** (and its `esbuild` bundling workaround in `next.config.ts`): the rich path no longer depends on it. `puppeteer-core` replaces it as a lightweight dependency; the Chrome binary is downloaded on demand, not bundled.

## 0.8.8.0 - 2026-06-28

Two features land together, both with full CLI / GUI / MCP parity: a live color grade "control room" and native HTML/CSS graphics templates. This release also unbreaks the editor bundle and carries the v0.8.7.1 typecheck hotfix onto `main` (which had been sitting on the broken v0.8.7.0 build).

### Added

**Grade control room (color grading)**
- **Color adjust (`look.color`)**: five continuous knobs layered on the named grade: temperature, tint, brightness, contrast, saturation. Maps to a deterministic ffmpeg chain: colorbalance (temp/tint), then eq (contrast/brightness/saturation), in the export filtergraph order. Absent or all-neutral emits no filter and is dropped from the EDL.
- **`openklip look <slug> color`**: set any subset of knobs (`--temp`, `--tint`, `--bright`, `--contrast`, `--sat`) or `--reset`. Only the passed knobs change. Mirrored as the `look-color` registry action, so the GUI and an MCP agent drive the same mutation.
- **Grade control room (GUI)**: a dialog with the five knobs as live sliders, a base-grade picker, and hold-to-compare. Each slider previews on a real frame and writes `project.json` on release: no "copy a prompt" round trip, unlike the source deck. The agent can set the look from chat; the human nudges here.
- **Preview-frame endpoint** (`GET /api/projects/<slug>/preview-frame`): renders one graded frame (LUT then grade then color, the exact export order) so tuning is instant. Query overrides let the GUI preview unsaved values; with no overrides it shows the committed look.

**Native graphics templates**
- **Graphic overlays (`project.graphics`)**: native HTML/CSS graphic templates composited over a source-time span, keyed to a sample range and a track. ffmpeg stays the master compositor via the render seam (`src/graphic-render.ts`); the HTML engine only emits an overlay asset.
- **Built-in templates** (under `graphics/`): `title-card`, `lower-third`, `kinetic-caption`, each with a declared param manifest (caller params win; unset params fall back to the manifest defaults).
- **`openklip graphic-add | graphic-set | graphic-rm`**: add, patch, or remove a graphic overlay with `--param key=value`, a span, and `--track broll|title|zoom`. Mirrored as the `graphic-add` / `graphic-set` / `graphic-rm` registry actions (CLI / GUI / MCP), with a GUI overlay renderer and runtime.

### Fixed
- **Editor rendered blank** under the graphics track: the pure `summarize` / `ProjectSummary` were split into a client-safe `src/summary.ts`, so the browser bundle no longer drags `src/actions.ts` → `src/graphics.ts` (`node:fs`) into the client.
- **Turbopack could not bundle the graphics renderer**: `@hyperframes/producer` (which ships an `esbuild` native binary and non-JS assets) and `esbuild` are now in `serverExternalPackages`, so they load at runtime on the server instead of being traced.
- Carries the **v0.8.7.1 typecheck hotfix** (`web/lib/timeline-zoom.ts` `sampleToPx`) onto `main`, which had shipped broken in the v0.8.7.0 merge.

## 0.8.7.1 - 2026-06-28

Hotfix the 0.8.7.0 release: green up typecheck/CI, sync the version, and refine the player transport bar.

### Fixed
- **Typecheck**: `web/lib/timeline-zoom.ts` `sampleToPx` was missing `zoom` in its parameter type, so `tsc --noEmit` (and CI) failed on the 0.8.7.0 release.
- **Version drift**: `package.json` was left at 0.8.6.0 while `VERSION` read 0.8.7.0; both now read 0.8.7.1.

### Changed
- **Player controls**: smaller transport icons and tighter spacing, bold tabular timecodes, slimmer scrubber handle.

## 0.8.7 - 2026-06-28

Editable timeline with CLI parity, export verify loop, color grade/LUT, and inbox ingest.

### Added
- **Timeline editor**: drag overlay clips, trim edges, click words to cut/restore (shift for range select). Toolbar snap toggle and zoom (25%-400%). Snaps to word edges, overlay boundaries, and playhead.
- **`still-set`**: patch still overlays on CLI and registry (GUI timeline writes the same mutations).
- **Verify cut**: `openklip verify <slug>` re-transcribes `output/out.mp4` and diffs against the EDL (filler survivors, leaked cuts, coverage). **Verify cut** button in the editor runs the same loop locally.
- **Color grade + LUT**: `openklip look <slug> grade <name>` and `openklip look <slug> lut <name>`; bundled `luts/` for portable `.cube` references.
- **Motion feel**: `openklip motion <slug> --speed` scales overlay animation durations at export.
- **Inbox ingest**: loose videos in the projects root auto-ingest via folder watch (`scan-inbox` API + GUI hook).

### Changed
- **Properties panel**: removed duplicate app settings (export height, theme, default agent); left sidebar Settings is the single source.
- **Agent chat**: removed the `working/chats.json` footer under the chatbox (documented in README).

### Tests
- Timeline clip edit, snap, and zoom unit tests; verify, grade, LUT, inbox, and ingest-jobs coverage.

## 0.8.6 - 2026-06-28

**Describe media** now logs the main video's scenes, not just b-roll cards.

### Added
- **Scene log**: `openklip analyze` and **Describe media** run a subagent over ingest frames (`working/frames/`) to write `sceneLog` on `project.json`: what is on screen per span, optional `onScreen` type, and `brollOpportunity` flags. Chat and MCP edit prompts include the log so the agent targets cover opportunities.
- **MCP query `scene_log`**: agents can read the persisted scene log without dumping `project.json`.

### Changed
- **Describe media** button always visible (scene log can run even with no b-roll in the bin). Label copy: "reading your media" / "Describe media".

## 0.8.5 - 2026-06-28

Chat does edits, not advice; editor layout puts chat in a resizable right column; plus asset cards and an icon pass.

### Added
- **Agentic chat edits**: for Claude, free-text chat now loads the openklip MCP server and calls the edit tools (cut, zoom, b-roll, title, template, export) to DO the edit, replying with a one-line confirmation instead of CLI instructions. Verified end-to-end (a chat "add a push-in zoom on hello world" wrote the zoom to project.json). Non-Claude agents fall back to a read-only answer.
- **Resizable chat sidebar**: chat lives in a full-height right column; drag the edge handle to resize (340–760px), width persists in localStorage, keyboard-accessible.
- **Asset cards / Analyze assets**: click **Describe assets** in the asset bin or run `openklip analyze <slug>` to fan out per-asset subagents that write summary, tags, and bestFor onto each b-roll/still so the editing agent places media by meaning.
- **Phosphor fill icons**: replaced Lucide stroke icons with `@phosphor-icons/react` (fill weight) via a shared `web/lib/icon.tsx` wrapper across the editor shell.

### Changed
- **Editor layout**: chat moved from below the video to the right sidebar; Settings + Inspector ("Properties") moved below the video, toggled with the transcript. More vertical room for reading chat.
- **Icon chrome**: default UI icon color uses `--icon-foreground` (55% foreground mix) so fill icons sit softer on grey chrome; icons inside buttons still inherit parent color.
- **Prompts**: the chat assistant no longer emits CLI commands or how-to text.

### Fixed
- **Invisible chat text**: assistant messages used `text-secondary` (the 5%-opacity fill token); switched to `text-foreground`.

## 0.8.4 - 2026-06-28

Free-text chat now drives the selected agent CLI for real, instead of replying with a canned hint.

### Added
- **Live chat replies**: typing in the agent chat spawns the selected agent (`claude -p`, etc.) with the project transcript as context and shows its real answer. `chatWithAgent` server action + `runAgentText`/`buildChatPrompt` in the agent driver. Verified end-to-end against the live Claude CLI (`--output-format json` → `.result`).
- **Graceful fallback**: when no agent is installed/connected, chat still returns the deterministic "run this CLI loop" hint.
- **Conversation UI**: chat transcript uses the AI SDK `Conversation` element (`@ai-elements/conversation`) for auto-scroll-to-bottom and a scroll-to-latest button, replacing the manual `ScrollArea`.

### Changed
- **Agent driver generalized**: `runFillerAgent` now composes `runAgentText` (the generic headless runner); filler-cut behavior is unchanged. Spawns close stdin so a headless CLI never blocks on input.
- **Removed template picker** from the player header (templates are applied via the skills selector).

### Fixed
- **Invisible chat text**: assistant messages used `text-secondary`, which resolves to the 5%-opacity `--secondary` fill token, not the `--text-secondary` text token. Switched to `text-foreground`.
- **Path tests**: `withDefaultProjectsRoot` now pins `OPENKLIP_PROJECTS_ROOT` to a temp `projects/` dir, decoupling the layered-layout assertions from the projects-root default (which moved to `~/Movies/OpenKlip` in 0.8.3).

## 0.8.3 - 2026-06-28

Workspace folder is user-chosen; the repo is no longer used as scratch.

### Changed
- **Projects root fallback**: defaults to `~/Movies/OpenKlip` (macOS video convention, matching iMovie/Final Cut) instead of `./projects` inside the repo. Resolution order unchanged: `OPENKLIP_PROJECTS_ROOT` → GUI-picked folder (`.openklip/projects-root`) → `~/Movies/OpenKlip`.

### Removed
- **In-repo `projects/` folder**: deleted the bundled scratch directory and dropped its `.gitignore` entry; project data now lives outside the repo.

## 0.8.2 - 2026-06-28

Full Linear-style UI refactor: semantic tokens wired through components, CTA hierarchy enforced, timeline colors aligned.

### Changed
- **CTA hierarchy**: Export and Choose video use primary blue; skill tokens stay grey (blue only when it matters).
- **Semantic tokens**: `text-tertiary`, `text-quaternary`, `bg-surface-*` adopted across editor shell; `text-muted-foreground` removed from `web/`.
- **Timeline tracks**: music, stills, and titles use theme tokens (`info`, `zoom`, `title`); violet and arbitrary Tailwind hues removed.
- **Primitives**: inputs use `text-ui`, placeholders `text-quaternary`, focus rings normalized to 1px, hover-card and skills menu use `popover-styled`.
- **Typography**: transcript and chat panels use `text-ui` / `text-section-label`; caption inactive words use `text-white/70` on player.

### Fixed
- **Typecheck**: `defineQueryTool` generics, MCP `ZodRawShapeCompat`, and `StepPill` boolean props (`agent-tools.ts`, `mcp-server.ts`, `new-project-dialog.tsx`).
- **Asset folder sync loop**: `AssetBin` stores `onAssetsUpdated` in a ref so parent re-renders no longer retrigger hundreds of sync polls per second.

## 0.8.1 - 2026-06-28

Linear-style design system: OKLCH surfaces, Inter Variable typography, and light/dark parity.

### Added
- **DESIGN.md**: design source of truth for typography, color, spacing, and motion.
- **CLAUDE.md**: points agents at DESIGN.md before any UI work.
- **JetBrains Mono**: mono font for timestamps, paths, and CLI snippets.
- **Surface ladder**: `--surface-0` through `--surface-3` and text hierarchy tokens (`--text-primary` through `--text-quaternary`).

### Changed
- **Inter Variable**: smooth 400-900 weights with Linear recipe (510/590/680, cv01+ss03, opsz auto).
- **OpenKlip preset**: light/dark foreground and background tuned for parity (~#fff / ~#08090a).
- **OKLCH mixes**: foreground shades and semantic text colors use oklch instead of srgb/oklab.
- **Modal overlays**: dialog, sheet, drawer, and alert-dialog use `bg-overlay` token.

## 0.8.0 - 2026-06-28

Agent query layer, MCP server, edit templates, and Codex-style skills in chat.

### Added
- **Bounded query reads**: `openklip transcript grep/span/phrase`, `ranges --json`, `overlays --json`, `status --json` for agent discovery without loading full transcripts.
- **Phrase placement helpers**: `title-add-phrase`, `zoom-add-phrase`, `broll-add-phrase` locate spoken spans and place overlays in one step.
- **MCP server**: `openklip mcp` (stdio) exposes 35 tools with CLI/GUI parity on `project.json`; `.cursor/mcp.json` wired for Cursor.
- **Edit templates**: `templates/` playbooks (e.g. talking-head), `openklip brand` / ingest `--brand`, template API route, and template skills in chat.
- **Skills chat UX**: `/` slash menu, Skills dropdown, and Codex-style inline skill tokens with follow-up text before send.
- **Empty workspace flow**: folder picker landing, new-project dialog, project create overlay, and Sonner toasts for uploads and actions.
- **84 new tests**: query, phrase-match, cli-query, agent-tools, skills-catalog, templates, motion, and toast coverage (387 total).

### Changed
- **AGENTS.md**: capability map for query commands, MCP, and phrase helpers.
- **Theme polish**: OpenKlip preset refresh, sidebar/chat motion, relative timestamps on chat list.
- **Project switcher**: inline create flow replaces `no-projects.tsx` empty state.

### Fixed
- **`projectMutations.ts`**: restore `edl.ts` schema imports broken when template support landed.

## 0.7.0 - 2026-06-28

Editor layout refresh, export options dialog, and configurable projects root (PR #12, PR #13).

### Added
- **Center chat panel**: agent threads and prompt input in the center column (`AgentChatPanel`, AI Elements `prompt-input`); chat list stays in the left sidebar.
- **Chat / Transcript toggle**: switch the center panel between agent chat and word-level transcript editing.
- **Timeline drawer**: edit timeline opens in a bottom drawer instead of a fixed footer strip.
- **Compact preview**: preview and chat capped at `max-w-2xl` with a shorter portrait height for readability on wide screens.
- **Find filler** above the preview (moved out of the sidebar footer).
- **Export options dialog** on the toolbar: pick 720p / 1080p / 4K before render; shows pixel dimensions and rough size/time estimates.
- **Workspace folder picker**: empty-state landing chooses a macOS folder via `POST /api/workspace`; path persists in `.openklip/projects-root`.
- **`GET /api/workspace`**: returns `{ root, pickerSupported }` for the active projects root.
- **Collapsible sidebar sections**: chats, assets, and settings use shadcn collapsible panels; settings moved to left sidebar (`SidebarSettingsPanel`).
- **Shared asset upload helpers** (`web/lib/asset-upload.ts`) used by the asset bin and chat `+` upload.

### Changed
- **Agent sidebar slimmed**: thread messages, model picker, find-filler, and send form removed from the footer; chat UX lives in the center panel.
- **Projects root resolution**: `OPENKLIP_PROJECTS_ROOT` env wins, then `.openklip/projects-root`, then `./projects` (`src/paths.ts`, `src/workspace-config.ts`).
- **Empty projects landing**: browser video upload replaced with folder picker + CLI ingest hint (`openklip ingest <video>`).

### Fixed
- **Nested-button hydration** in project switcher folder action (`ProjectInlineFolderAction` moved outside the dropdown trigger).
- **`paths.test.ts`** isolates default `./projects` layout from a local `.openklip/projects-root` file.

### Notes
- Export dialog **compression**, **frame rate**, and **clipboard** controls are visible but disabled until the ffmpeg pipeline supports them; only **resolution** (`maxHeight`) is wired today.
- Folder picker requires **macOS** (`osascript`); other platforms should set `OPENKLIP_PROJECTS_ROOT` or ingest from the CLI.

## 0.6.2 - 2026-06-28

Sidebar UX pass: asset bin fidelity, project lifecycle in the switcher, chat previews, and polish from PR #11.

### Added
- **Chat preview cards** on hover (`ChatPreviewRow`): title, project path, source video, edit stats, and message count.
- **In-progress chat indicator**: subtle spinner before the title while an agent run is active.
- **Project and assets folder actions**: reveal `projects/<slug>/` or `assets/` in Finder from the switcher and Assets heading (`POST /api/projects/:slug/reveal`).
- **Asset delete in sidebar**: hover trash with double confirmation; `DELETE /api/projects/:slug/assets/:assetId` prunes timeline overlays.
- **Project delete in switcher**: hover trash with double confirmation; `DELETE /api/projects/:slug` removes the project folder and switches to the next project.
- **Empty projects landing** when no projects exist, with **Create new project** (video picker) instead of "Ingest video".

### Fixed
- **Asset bin matches the drop folder.** Folder sync and page load prune registrations whose `src` is outside `projects/<slug>/assets/` or no longer exists on disk, and drop b-roll/still overlays that referenced them. Sync API returns updated `broll`/`stills` so client state stays in sync.
- **Page load survives sync errors.** `loadEditorProject` treats folder sync as best-effort so a bad drop or proxy build does not break the editor.
- **Find filler while chats load.** Button shows "Loading chats…" and disabled state; auto-ensures a thread if none is active when clicked.
- **SSR keyboard hints**: `useModShortcut` avoids hydration mismatch for ⌘ vs Ctrl labels.

## 0.6.1 - 2026-06-28

Reliability pass after the 0.6.0 editor shell refresh: serialize server-side writes, harden chats persistence, and fix sidebar layout.

### Changed
- **Project-wide write serialization.** All `project.json` mutations from the server (server actions, agent-driven filler cuts, asset sync, upload) go through one per-slug lock (`src/project-lock.ts`) via `mutateProject(slug, fn)`, so concurrent tabs or agent sessions cannot race the read-modify-write and lose an edit. `chats.json` mutations use a separate per-slug lock (`withChatsLock`) so chat writes stay responsive while an agent run holds the project lock. Replaces the narrower asset-only lock from early 0.6.0. Scope: in-process (one running server); concurrent processes still need OS file locking.

### Fixed
- **Sidebar asset overflow.** Long filenames in the asset bin no longer force horizontal scroll (`flex flex-col` + `min-w-0 overflow-hidden` on section rows).
- **`chats.json` no longer silently wipes on corruption.** `saveProjectChats` writes atomically (tmp + rename); `loadProjectChats` moves a corrupt file to `chats.json.bad-<ts>` and throws instead of returning empty.
- **Chats API returns 404 for unknown threads.** `append`/`rename`/`archive` respond 404 when `threadId` does not exist; `setActive` validates the thread before pinning.
- **Stills from outside `assets/` are copied in.** External still originals copy into `assets/` instead of storing a fragile `../../…` relative proxy.
- **Re-ingest no longer silently wipes an existing project.** `ingest` refuses when `project.json` already exists unless `--force` (CLI) or `?force=1` (upload API returns 409 Conflict).
- **Folder sync is POST, not a mutating GET.** `POST /api/projects/:slug/assets/sync` registers files dropped into `assets/`; `GET /assets` is read-only.

## 0.6.0 - 2026-06-26

Editor shell refresh: the asset bin, project chats, and theme picker now live in the left sidebar; the center column is preview, transcript, and timeline only.

### Added
- **Asset bin in sidebar**: drag-and-drop upload, grouped b-roll/music/stills, folder sync poll, and hover previews (`AssetBin`, `AssetPreviewRow`).
- **Project switcher**: switch projects, ingest video from the sidebar, ⌘1–⌘9 shortcuts.
- **Persisted chats API**: threads stored in `working/chats.json` with archive/rename/delete (`src/chats.ts`, `/api/projects/:slug/chats`).
- **Theme engine**: swappable presets (OpenKlip, Catppuccin, GitHub, Nord, Dracula, Tokyo Night) with light/dark scheme and no-flash boot script.
- **Keyboard shortcuts**: ⌘B toggles agent sidebar, ⌘I toggles inspector (`EditorSidebarShortcuts`).
- **Asset folder scanner**: CLI/GUI parity when files land in `projects/<slug>/assets/` (`src/asset-scanner.ts`).

### Changed
- Removed the asset strip below the timeline; assets render only under **Assets** in the agent sidebar.
- Agent threads moved from browser localStorage to per-project disk via the chats API.
- Inspector settings grouped under a Paper-style right sidebar with theme and default-agent pickers.
- Unified `registerAsset` path for b-roll, music, and stills; dropped standalone `src/broll.ts`.

### Fixed
- Lint/test hygiene for theme re-exports, vendored agents-ui shader component, and `AgentModelSelect` extraction.

## 0.5.0 - 2026-06-26

Linear-parity video player: the editor preview and a new fullscreen "cinema" mode share one transport bar that matches Linear's player chrome: white-on-dark controls over a gradient scrim, a hairline scrubber with a dot handle, and play, volume, time, remaining, speed, captions, picture-in-picture, and fullscreen.

### Added
- **Cinema player** (`web/components/cinema-player.tsx`): fullscreen overlay with the project name top-left, Export top-right, auto-hiding controls, keyboard shortcuts (space/k, arrows, f, m, c, Esc), real fullscreen + picture-in-picture, and a center play affordance.
- **Shared transport bar** (`web/components/player-controls.tsx`): the Linear control row, used by both the cinema overlay and the inline preview. Custom hairline scrubber with buffered fill, drag-to-seek, and a dot handle.

### Changed
- The inline preview renders the shared transport bar overlaid on the video (revealed on hover) instead of the old gray control row. Fullscreen opens the cinema overlay; volume, speed, and PiP drive the preview `<video>` directly; scrubbing seeks in cut-space via `sourceAtOutput()`. Loop in/out and the vignette toggle move to a slim secondary row.

## 0.4.0 - 2026-06-26

Agent selector: drive AI edits with your existing coding-agent subscription. No API keys, no bundled LLM. Pick Claude Code, Codex, Cursor, or Grok in the editor; OpenKlip shells out to that CLI headless, hands it the transcript, and applies the structured answer to the same `project.json`.

### Added
- **Multi-agent driver** (`src/agent-driver.ts`): adapters for `claude -p`, `codex exec`, `cursor-agent -p`, `grok -p`, each reading its cleanest structured-output channel (Claude/Cursor JSON envelope, Codex `--output-last-message` file, Grok stdout). Codex runs in a `--sandbox read-only` jail.
- **"Find filler with <agent>"**: the selected agent reads the transcript and cuts filler words via a server action, applied to the live `project.json`. Verified end-to-end against all four real CLIs.
- **Connection detection + badges**: `detectAgents()` reports installed (PATH) + signed-in (per-CLI status subcommand / auth file / host) with a compact "Signed in / Sign in / Not installed" badge per provider.
- Provider logos via the svgl shadcn registry; single-logo selector trigger.

### Fixed
- Strip `--bun` from `NODE_OPTIONS` when spawning agent CLIs so their bundled Node does not crash under the `bun --bun` dev server.
- Unique agent-thread message ids (`nextId`) + composite render keys: eliminates duplicate React key warnings.

### Notes
- OpenKlip bundles no LLM; agents run on the user's own subscription via their installed CLI. Cursor needs a one-time `cursor-agent login`.

## 0.3.0 - 2026-06-26

Unified action registry (`src/registry.ts`): one Zod-schema'd definition per `project.json` mutation, dispatched through a single `runAction(name, project, input)`. The CLI routes all ~20 edit commands through it instead of importing the mutation primitives directly, so what the registry advertises is exactly what the CLI executes. Schemas are shape-only; the primitives in `actions.ts` stay the single owner of value bounds (no duplicated rules to drift).

New `openklip actions [--json] [--surface cli|gui|mcp]` prints the capability manifest: the Zod schemas render to JSON Schema (the MCP `inputSchema` shape), so an external agent can read every editing action from one place without bespoke wiring. Schema failures surface as one concise, field-tagged line instead of a raw validation dump.

## 0.2.0 - 2026-06-26

External-inspiration buildout: a security fix, a layered project layout, several new editing primitives, and the GUI/agent surfaces to drive them. Distilled from the [External Inspiration steal list](docs/EXTERNAL-INSPIRATION.md) (Videofy Minimal + HyperFrames).

### Security
- Validate project slugs (`assertValidSlug`) at the `projectDir` chokepoint, closing a path-traversal hole on the `[slug]` API/media routes (a hostile slug could write outside `projects/`).

### Added
- **Ken Burns still overlays**: a `stills` EDL type with an animated `zoompan` push-in (focus point + ramp); `openklip still-add`/`still-rm`, exporter + compiled-timeline support. Verified with a real ffmpeg render.
- **Brand presets**: `brands/<name>.json` defaults (captions/vignette/pad) applied at `openklip ingest --brand` or `openklip brand <slug> <name>`; `project.json` stays the edit.
- **Overlay reorder**: `reorderBroll/Title/Zoom` + `openklip reorder`, plus `@dnd-kit` drag-to-restack of b-roll paint order in the inspector.
- **`openklip doctor`**: ffmpeg/whisper/project health check; also gates `serve`.
- **Export API route**: `POST /api/projects/[slug]/export` (Zod body, empty-cut + traversal guards).
- **Ingester plugin manifests**: `ingesters/<id>/ingester.json` + loader + `openklip ingesters`.
- **HyperFrames post-export seam**: `openklip package <slug> remove-background|transcribe` against the (opt-in, unbundled) `hyperframes` CLI; verified end-to-end.
- **Derived `CompiledTimeline`**: never-persisted authoring→preview view (kept ranges, overlays in output time, caption groups).
- **Agent skill router**: maps sidebar intent to CLI command sequences.
- **GUI**: orientation toggle (16:9/9:16/1:1 preview), rebuilding/saving overlay, in/out loop region, replace-from-bin source dropdown.

### Changed
- **Layered project folders**: `project.json` stays at the project root; derived media (proxy, transcript, audio, frames, asset proxies, export scratch) live under `working/`, renders under `output/`. Big-bang, no back-compat.
- `safeAction` failures now carry a dev-only stack trace.

### Notes
- Glimm preview transitions remain browser-only; exported MP4s still hard-cut until an ffmpeg transition graph lands.
- HyperFrames is **not** bundled (needs Chrome + the `hyperframes` npm CLI); `openklip package` preflights and prints install instructions when absent.

## 0.1.0 - 2026-06-26

Migrated the web editor to a Next.js + Tailwind + shadcn stack and gave it a clean, Paper-inspired look.

### Changed
- Migrated the editor from a custom `Bun.serve` SPA to Next.js 16 (App Router), run on the Bun runtime.
- Rebuilt the UI on Tailwind v4 + shadcn/ui with the olive/emerald preset: a light, Paper-inspired editor (left sources/effects sidebar, center preview + transcript, right property-row inspector, hairline borders, one accent).
- Ported every API and media route to Next Route Handlers, including HTTP 206 byte-range video streaming.
- Rebranded to "OpenKlip" across the UI and docs; removed em dashes.

### Added
- shadcn/ui components (button, slider, select, toggle-group, badge, switch, scroll-area, separator, tooltip, input, label).
- Inspector controls wired to the `project.json` EDL: zoom scale/ramp + presets, captions per-line, pad.
- `src/projectStore.ts` (project resolution) and `src/serveRange.ts` (byte-range streamer), shared by the route handlers and CLI.

### Removed
- The old `Bun.serve` server (`src/server.ts`) and SPA entry (`web/index.html`, `web/main.tsx`, `web/styles.css`).

### Dev
- `openklip serve` now launches the Next.js dev server (pinned to a project via `OPENKLIP_SLUG`); React upgraded 18 → 19.
- Updated core dependencies: zod 4 (4.4.3), Transformers.js 4 (4.2.0, onnxruntime-node 1.24.3), TypeScript 6 (6.0.3), shadcn 4.11.1. TS 6 deprecates `baseUrl`, removed from tsconfig (path aliases still resolve).

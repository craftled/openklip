# GitHub release notes (draft)

Use these bodies when publishing releases. Each section matches a tag in `CHANGELOG.md` without duplicating the full changelog. **Known gaps:** always link to [TODO.md](../TODO.md#known-limitations); do not duplicate the list here.

Publishing status checked on 2026-07-04 (`gh release list`): GitHub releases are published through `v0.40.0.0` (the `v0.29.0.0`–`v0.40.0.0` backlog was published 2026-07-04 from these bodies, each tagged at its version's own commit).

---

## v0.40.0.0

**History transcript diff, edit provenance, and loading polish.**

### Highlights
- **Transcript diff in History**: per-entry **Show transcript diff** on transcript mutations compares kept words before and after each edit, with Inline (default) and Classic layouts via `@pierre/diffs`. Review-only; the main transcript editor is unchanged.
- **Edit provenance**: action history records optional `authorId`, `model`, and `agentSurface` on every logged mutation. GUI human edits stamp `human:local`; chat MCP runs derive model-specific author ids. Transcript words carry `authoredBy` / `authoredRevision` with hover tooltips and author-toned underlines.
- **Provenance queries**: History panel Author filter; `openklip history --author`; MCP `history_list` `author` and `model` filters; `openklip tasks` shows task `authorId` / `model`.
- **View in history from transcript**: provenance tooltips include a **View in history** link that opens Config History, clears filters, scrolls to the matching revision row, and briefly highlights it.
- **Hello loading**: project and chat loading states use a compact hello animation instead of plain placeholder text.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#04000---2026-07-04)

---

## v0.39.0.0

**Motion text pack for graphic overlays.**

### Highlights
- **Eight motion templates**: `motion-typewriter`, `motion-blur-reveal`, `motion-shimmer`, `motion-glitch`, `motion-kinetic-build`, `motion-roll-number`, `motion-word-cascade`, and `motion-highlight-pop` ship as ready-to-use `kind: "rich"` graphic templates, added through the existing `graphic-add`/`graphic-set` flow like any other template.
- **New `data-anim` runtime effects**: six new animation effects plus split/stagger support on the existing `fade`/`slideUp` effects, all seeded and frame-pure in the shared `web/lib/graphic-runtime.ts`, so the browser preview and the headless-Chrome export render identically.
- **Agent authoring contract**: `graphics/AUTHORING.md` documents the manifest schema, the full `data-anim`/split/stagger attribute reference, and frame-purity rules, so an agent can drop a new `graphics/<id>/` folder and have it auto-discovered with no code changes.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#03900---2026-07-04)

---

## v0.38.0.0

**Keyframe animation for graphic overlays.**

### Highlights
- **Simple declarative keyframes**: graphic overlays animate opacity, scale, and x/y position over time via a `keyframes` array — seven easings (`linear`, `easeIn`, `easeOut`, `easeInOut`, `spring`, `backOut`, `anticipate`), stored as data, not code.
- **Preview/export parity by construction**: keyframes are evaluated frame-pure in the shared graphic runtime, so the browser preview and the headless export raster run the same code path.
- **Editor UI**: diamond markers on graphic timeline clips plus a Keyframes inspector section (add at playhead, edit value/easing, delete).
- **Agent surface**: `graphic-set` accepts keyframes, the CLI gains `--keyframes-file` / `--clear-keyframes`, and query views expose keyframes; undo/history cover keyframe edits automatically.
- **Verification**: PRs #60/#61/#62/#65 CI passed; current codebase verification is 1661 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#03800---2026-07-04)

---

## v0.37.0.0

**Full Paper Shaders template set.**

### Highlights
- **21 new shader templates**: every non-image shader in `@paper-design/shaders@0.0.77` ships as a bundled rich graphic template (metaballs, god rays, liquid metal, voronoi, water, waves, and more).
- **Centralized shader specs**: all 24 shader ids live in `web/lib/paper-shader-specs.ts` with uniform mapping aligned to the React wrapper defaults, shared by preview and export.
- **Template generator**: `scripts/generate-shader-templates.ts` regenerates manifest + composition pairs from one config list.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#03700---2026-07-04)

---

## v0.36.0.1

**UI-audit remediation batch.**

### Highlights
- **Chat panel width fix**: chat content no longer paints under the config sidebar at narrow widths.
- **Slash-skills menu focus fix**: the skills popup keeps focus in the prompt textarea, restoring type-to-filter and Escape-to-close.
- **shadcn primitive adoption**: hand-rolled toggles, selects, overlays, and focus rings across the editor replaced with stock primitives; typography, list-row spacing, z-index, and motion tokens standardized.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#03601---2026-07-04)

---

## v0.36.0.0

**Agent-native skills with progressive disclosure.**

### Highlights
- **Skill index in the edit prompt**: the edit agent sees every skill as `id: description` up front (capped at 20 with an overflow note) instead of discovering templates by chance.
- **`load_skill` agent tool**: read-only tool that returns a skill's full markdown by id, decoupling "read the procedure" from "set the project template".
- **YAML frontmatter in `skill.md`**: optional frontmatter (`description:`, `label:`/`name:`) keeps skills portable with the wider SKILL.md convention; existing files parse unchanged.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#03600---2026-07-04)

---

## v0.35.0.0

**Paper Shaders as first-class rich graphics.**

### Highlights
- **Three shader templates**: `shader-mesh-gradient`, `shader-grain-gradient`, and `shader-dithering` ship as `kind: "rich"` graphic templates with manifest-driven params through the existing `graphic-add` / `graphic-set` flow.
- **Deterministic shader animation**: `data-shader` hosts in the shared graphic runtime are frame-driven by `setFrame()` from the timeline frame, keeping preview and export in sync.
- **Headless WebGL export**: the export renderer's Chrome launch enables SwiftShader WebGL so shader templates render in headless export.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#03500---2026-07-03)

---

## v0.34.0.0

**Browser upload for multi-take ingest.**

### Highlights
- **Add take from the browser**: the Takes panel can upload a new take with a file picker and optional label.
- **Durable take ingest**: uploads are copied into the project's `takes/` directory before `ingestTake`, so recorded source paths do not point at temporary upload files.
- **Shared ingest jobs**: take uploads reuse `startIngestJob`, `getIngestJob`, and `/api/projects/ingest/[jobId]`; composite job keys keep take uploads from colliding with whole-project ingest for the same slug.
- **Verification**: PR #52 CI passed; current codebase verification is 1590 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#03400---2026-07-03)

---

## v0.33.0.1

**CLI actor validation, GUI GIF cap control, and a History truncation-warning fix.**

### Highlights
- **Validated `--actor` flags**: `openklip history` and `openklip tasks` now reject invalid actors instead of silently returning no matches.
- **GIF max-width input**: the export dialog exposes the existing per-export GIF width override, clamped to the 1920px hard ceiling.
- **History warning fix**: task revert warnings now read the raw fetched history count, not the filtered visible count.
- **Verification**: PR #51 CI passed.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#03301---2026-07-03)

---

## v0.33.0.0

**Task actor filtering, GIF width override, multi-take browser, and GUI History filters.**

### Highlights
- **Task actor filter**: `task_list` and `openklip tasks --actor` mirror history actor filtering; tasks now record an optional actor.
- **GIF width override**: CLI, MCP, route, and server action callers can raise GIF width above the 960px default up to 1920px for one export.
- **Takes panel**: the GUI can browse ingested takes, select word ranges, build a multi-segment assembly, and overwrite with confirmation.
- **History filters**: the GUI History panel gained actor, action, and task filters with a distinct filtered-empty state.
- **Verification**: PR #50 CI passed.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#03300---2026-07-03)

---

## v0.32.0.0

**Cinema preview cut-skip fix, GIF caps, audio de-essing, and history actor filtering.**

### Highlights
- **CinemaPlayer cut-skip**: fullscreen playback now uses its own `CutScheduler`, so it skips deleted ranges like the inline preview and keeps overlays aligned to cut-space time.
- **GIF guardrails**: GIF exports are capped at 960px width, 15fps, and 300 seconds kept duration; MP4 export is unchanged.
- **Audio de-essing**: ffmpeg's `deesser` filter runs on the voice bus after highpass and noise reduction, wired through CLI, MCP, GUI, and export paths.
- **History actor filter**: `openklip history --actor` and MCP `history_list.actor` filter by `human`, `agent`, `cli`, `mcp`, or `system`.
- **Verification**: PR #49 CI passed.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#03200---2026-07-03)

---

## v0.31.0.0

**Real Glimm preview cut transitions.**

### Highlights
- **Preview sweep**: `CutScheduler` fires a cut-boundary callback only on auto-advance, not manual seeking.
- **Transition plans**: `project.look.transition` maps to Glimm sweep options for crossfade-like and dip-like preview cues.
- **Graceful fallback**: reduced-motion and unavailable WebGL both degrade to no visual effect.
- **Verification**: PR #48 CI passed.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#03100---2026-07-03)

---

## v0.30.0.0

**Exported cut transitions and GUI dead-air removal, plus visible transition fallback reporting.**

### Highlights
- **Export cut transitions**: `project.look.transition` supports `crossfade` and `dip` for voice-only segment exports.
- **Dead-air remove in GUI**: the Cleanup panel can remove registered dead-air spans instead of relying on CLI/MCP or revert.
- **Fallback reporting**: export results, CLI output, and GUI toasts now say when a requested transition falls back to a hard cut.
- **Verification**: PR #46 and PR #47 CI passed.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#03000---2026-07-03)

---

## v0.29.0.1

**CLI/MCP export format parity.**

### Highlights
- **CLI `--format`**: `openklip export <slug> --format mp4|gif` uses the same guard style as `--platform` and `--loudness`.
- **MCP `format` input**: the `export` tool accepts the same `mp4`/`gif` choice as the GUI and server route.
- **Destination boundary**: clipboard remains GUI-only because it is a client-side browser API call.
- **Verification**: PR #45 CI passed.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02901---2026-07-03)

---

## v0.29.0.0

**Export format and destination controls.**

### Highlights
- **MP4/GIF export format**: GUI, server action, and export route can render GIF by running a second ffmpeg palette pass over the MP4 render and dropping audio.
- **File/clipboard destination**: the GUI can copy the exported file's absolute path to the OS clipboard as text after export.
- **MP4 regression guard**: omitted or explicit `mp4` format keeps the existing MP4 path unchanged.
- **Verification**: PR #44 CI passed.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02900---2026-07-03)

---

## v0.28.0.0

**Export performance, two-pass loudnorm, noise reduction, OS file locking, and demo GIF.**

### Highlights
- **Segment export seeking**: per-range input seeks when exporting a short cut from a long source (voice-only; no b-roll/music).
- **Two-pass loudnorm** and **noise reduction**: exact loudness targeting and light afftdn cleanup on the voice bus.
- **OS file lock**: `project.json.lock` advisory lock inside `mutateProject` for CLI + server safety.
- **Demo GIF**: `bun run demo-gif` → `docs/demo.gif` in README.
- Release-time verification: 1389 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02800---2026-07-03)

---

## v0.27.0.0

**Safe-area preview guides, vertical split export layout, and asset must-use/avoid flags.**

### Highlights
- **Safe-area guides**: portrait preview overlays for TikTok, Reels, YouTube Shorts, and generic vertical; preference toggle in the editor (not stored on `project.json`).
- **Split vertical layout**: export `fill` or `split-vertical` with configurable speaker pane ratio and top/bottom position; GUI Reframe controls and `export-set --layout`.
- **Asset flags**: `mustUse` / `avoid` on assets; `openklip asset-flags`, GUI badges, agents respect flags in `make-draft`.
- Release-time verification: 1368 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02700---2026-07-03)

---

## v0.26.0.0

**Multi-clip highlight export and Highlights GUI panel.**

### Highlights
- **`openklip export-highlight`**: renders one or all stored clips to `output/highlights/{id}.mp4` via `sourceSpan` (no word cuts on `project.json`).
- **`bun run agent-make-highlights`**: batch export with the `shorts` preset.
- **GUI**: Config **Highlights** section lists candidates, seeks on click, **Detect clips** runs LLM detection.
- Release-time verification: 1348 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02600---2026-07-03)

---

## v0.25.0.0

**LLM highlight detection, Vision saliency/OCR, and GUI Vision focus.**

### Highlights
- **Highlight clips**: `openklip highlights-detect` finds short-form clip spans from the timed transcript; MCP `highlights_list` reads them back.
- **Vision saliency + OCR**: face detection falls back to attention saliency; OCR text rides in the sidecar JSON for on-screen labels.
- **GUI**: macOS Reframe panel gets a one-click Vision focus button.
- Release-time verification: 1334 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02500---2026-07-03)

---

## v0.24.0.0

**macOS Vision face detection for vertical reframe focus.**

### Highlights
- **Vision sidecar**: `tools/vision-focus.swift` detects the largest face in ingest frames; `src/vision-focus.ts` compiles it on first use and averages focus across samples.
- **`openklip vision-focus <slug>`**: writes `focusX`/`focusY` onto speaker sceneLog segments before scene crop mode runs.
- **`cropMode: vision`**: CLI `export-set --crop-mode vision` samples frames directly when no sceneLog exists.
- **`agent-make-short`**: on macOS, enriches sceneLog via Vision before export-set.
- Release-time verification was not recorded in this draft.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02400---2026-07-03)

---

## v0.23.0.0

**Scene-log focus coordinates and a deterministic make-short agent loop.**

### Highlights
- **Speaker focus in scene log**: analyze can now persist `focusX`/`focusY` per speaker span; scene crop mode duration-weights them into export reframe.
- **`bun run agent-make-short`**: one command to set 9:16, pick scene/manual crop, export with the `shorts` preset, and verify.
- **Live check**: `edgaras-raw` via `agent-make-short` produced 1080x1920, `cropMode: scene`, verify passed.
- Release-time verification: 1318 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02300---2026-07-03)

---

## v0.22.0.0

**Scene crop mode for vertical reframe, revise-draft convert-to-short, and verified make-short export loop.**

### Highlights
- **`cropMode: scene`**: after `openklip analyze`, export-set can derive crop focus from the scene log's speaker spans (GUI Manual/Scene toggle, MCP `export-set`, CLI `--crop-mode`).
- **`revise-draft`**: new "Convert to short" path (section 3b) reframes and exports with the `shorts` preset without undoing the draft.
- **Live verification**: `edgaras-raw` exported at 1080x1920 via `export-set --aspect 9:16` + `export --platform shorts`; verify passed.
- Release-time verification: 1303 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02200---2026-07-03)

---

## v0.21.0.0

**Vertical export reframe: 9:16 Shorts/Reels/TikTok with manual pan/zoom crop, preview/export parity, and a `shorts` platform preset on every surface.**

### Highlights
- **`project.export`**: aspect (`source`, `16:9`, `9:16`, `1:1`) and manual crop (focus X/Y, zoom) persist on `project.json` and drive the same math in the GUI preview and ffmpeg export (`src/export-aspect.ts`).
- **`export-set` + `shorts` preset**: `openklip export-set`, MCP `export-set`, and `openklip export --platform shorts` (or GUI Platform picker) land a vertical export without hand-rolling four separate flags. One-off `--aspect` / `--crop-*` flags override for a single export only.
- **GUI**: Reframe sliders in Config, orientation toggle writes aspect, export dialog shows correct vertical dimensions when Shorts is selected.
- Release-time verification: 1294 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02100---2026-07-03)

---

## v0.20.0.0

**Richer title styles: quote, divider, and callout positions beyond lower, center, and hero.**

### Highlights
- **Title positions**: `quote` (centered italic quote + attribution), `divider` (centered section label), and `callout` (compact top-left label) on title cards.
- **Parity**: ASS export (`buildTitlesAss`), preview overlays, CLI/MCP/registry, and GUI position picker all share the same positions.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02000---2026-07-03)

---

## v0.19.0.0

**B-roll split-screen display: speaker left, b-roll right in a 50/50 landscape composite.**

### Highlights
- **`display: split`**: third b-roll display mode alongside `cover` and `pip`; `hstack` in `buildBrollOverlayFilters` at preview and export.
- **Surfaces**: CLI `broll-add` / `broll-set --display`, registry/MCP, GUI Cover/PiP/Split toggle.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01900---2026-07-03)

---

## v0.18.0.0

**B-roll audio modes: mix b-roll soundtrack with voice at export, not only swap the picture.**

### Highlights
- **`audioMode`**: `silent` (default), `broll`, `mix`, `duck-voice`, `duck-broll` on each b-roll placement.
- **Export mix**: `src/broll-audio.ts` trims and delays b-roll audio from the same inputs as video overlays; preview audio stays voice-only.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01800---2026-07-03)

---

## v0.17.0.0

**B-roll PiP display: keep the speaker on screen with a bottom-right inset instead of full-frame cover.**

### Highlights
- **`display: pip`**: inset at ~28% frame width; speaker stays visible under transparent pad + `overlay` composite.
- **Surfaces**: CLI `broll-add` / `broll-set --display cover|pip`, registry/MCP, GUI Cover/PiP toggle; legacy projects without `display` parse as `cover`.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01700---2026-07-03)

---

## v0.16.0.0

**Export platform presets: one named pick (YouTube, YouTube 4K, X, LinkedIn) sets compression, frame rate, resolution ceiling, and loudness target together, on CLI, API, MCP, and the GUI export dialog.**

### Highlights
- **Export platform presets**: `youtube` (1080p, -14 LUFS), `youtube-4k` (2160p, -14 LUFS), `x` (1080p/30fps, -14 LUFS), and `linkedin` (1080p/30fps, -14 LUFS), defined once in `src/export-platforms.ts`. A preset fills in defaults only: any compression/fps/maxHeight/loudness value passed explicitly still wins, and `maxHeight` never upscales past the source. `openklip export --platform <id>` (plus a new `--loudness <lufs>` override), the export API route, the `exportProject` server action, and the MCP `export` tool all share the same resolution logic; a Platform picker in the GUI export dialog sets the visible controls to match.
- **Export dialog resolution fix**: the dialog's "4K" control could previously submit the source height instead of the intended output ceiling; the displayed dimensions, size/time estimate, and the actual export now always agree.
- Release-time verification: 1243 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01600---2026-07-03)

---

## v0.15.0.0

**Caption style presets: five named looks shared by preview and export, plus agent tools to query action history and past task ids.**

### Highlights
- **Caption style presets**: `boxed`, `clean`, `karaoke`, `bold-caps`, and `minimal`, defined once in `src/caption-styles.ts` and rendered identically by the cinema preview and the ASS export burn-in. A "Caption style" picker in the Config sidebar switches presets live; `openklip captions-style <slug> <style>` and the `captions-style` action (cli/gui/mcp) do the same from the terminal or an agent. Unknown or missing style ids fall back to `boxed` on read, so older or newer projects never fail to load.
- **Portrait caption clipping fix**: export now wraps long caption lines (`WrapStyle: 0`) instead of letting them run off-frame, most visible in portrait/narrow exports.
- **Agent history and task query tools**: MCP `history_list` / `task_list` and CLI `openklip history` / `openklip tasks` let an agent read action history and past task records instead of only being able to revert blind. `templates/revise-draft/skill.md` uses them to find the task that produced a draft before reverting it.
- Release-time verification: 1187 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01500---2026-07-02)

---

## v0.14.1.0

**Trust completion: the transcript editor stops resurrecting cut words, and a new `revise-draft` playbook edits or reverts an existing draft.**

### Highlights
- **Transcript reconcile fix**: the contentEditable transcript editor no longer risks restoring a cut word on a stray edit. A word only comes back through an explicit action (timeline toggle, search restore, cleanup, revert); typing its text back into the transcript no longer restores it.
- **`revise-draft` playbook**: a new skill (`templates/revise-draft/skill.md`, auto-listed alongside `make-draft`) lets an agent apply targeted edits or a whole-task revert to an existing draft, with safety rails around `--force` and re-export.
- Release-time verification: 1131 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01410---2026-07-02)

---

## v0.14.0.0

**Task-level undo/revert: full action history coverage, pre-mutation snapshots, and a revert command on CLI, MCP, and the GUI History panel.**

### Highlights
- **Full history coverage**: action history now logs every user-facing mutation, not just registry actions: asset registration and deletion, `openklip template set`, `openklip brand` / `ingest --brand`, and multi-take `assemble` (which now writes through the same locked, logged path instead of a raw file write, so it no longer resets the revision counter). Background folder-sync prune logs under a new `system` actor. Brief saves from CLI, GUI, and MCP share one best-effort log entry.
- **Pre-mutation snapshots**: every logged mutation now keeps the project state from just before the change in `working/history/`, pruned to the newest 100 revisions.
- **Revert**: `openklip revert <slug> (--to <rev> | --task <id> | --last) [--force]`, the MCP `revert` tool, and a GUI History panel revert action restore `project.json` to an earlier snapshot as a normal logged mutation, so the revision counter stays monotonic and a revert is itself revertible. Guards refuse a revert that would silently discard another task's work (without `--force`) or cross a multi-take assembly boundary.
- **Forward-compatible schema**: `ProjectSchema` is now `.passthrough()`, so unknown top-level keys survive a load/save round-trip instead of being dropped by an older build.
- Release-time verification: 1117 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01400---2026-07-02)

---

## v0.13.0.0

**Cut and sound quality: cleanup review, silence-snapped cuts, seam crossfades, and export audio polish.**

### Highlights
- **Cleanup review**: filler and dead-air candidates are now generated from deterministic transcript rules plus real audio analysis, with safe/review risk levels, overlay-collision warnings, and estimated time saved. Apply one row or all safe rows from the Config panel, `openklip cleanup <slug> --apply-safe`, or agent tools.
- **Audio analysis engine**: ingest-time PCM drives cached silence detection (`working/audio-analysis.json`), validated on read and invalidated when source mtime or analysis options change.
- **VAD snap + seam crossfades**: `cuts.snap` is live across preview scheduling, export, status/ranges/overlays, and agent tools. Exports can join snapped cut seams with duration-preserving equal-power crossfades that clamp safely on short ranges.
- **Export audio quality**: projects can sidechain-duck music under speech, apply single-pass loudness normalization, and highpass the voice track. These are export-only by design; preview audio stays unprocessed.
- **Dead-air spans**: explicit source-time spans can be removed from otherwise kept ranges via `dead-air-add` and `dead-air-rm`, with coalescing, caps, and action-history logging.
- **Transcript correction parity**: `openklip word-text` and the `word-text` action let CLI/MCP/UI paths correct one word without touching timing, while preserving the original text on first edit.
- **Caption and assembly fixes**: captions now match kept output by overlap so snapped/dead-air-shifted boundaries do not drop live words; multi-take assembly regenerates analysis audio so VAD and cleanup read the assembled source.
- Release-time verification: 1017 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01300---2026-07-02)

---

## v0.12.0.0

**Done-for-you agent drafts: project briefs, visible agent tasks, and the make-a-draft playbook.**

### Highlights
- **Project brief**: every project can carry a `brief.md` with audience, goal, tone, must-use assets, avoid list, target length, and export guidance. The GUI, CLI, MCP tools, and agent prompts all read the same bounded brief.
- **Agent task model**: tool-calling chat edits create persisted tasks in `working/tasks.json`, including status, steps, notes, timestamps, and chat linkage. The chat panel shows live progress and survives reload.
- **Task progress tools**: spawned agents report with `task_step` and `task_complete`, scoped through `OPENKLIP_TASK_ID` so a run can only update its own task.
- **Cancellable runs**: cancel terminates the spawned agent process group and marks the task honestly instead of leaving the UI hanging.
- **Make-a-draft playbook**: `templates/make-draft/skill.md` turns one prompt into a full first draft flow: read status/brief/transcript/assets, cut filler, add titles/captions, place b-roll or stills, optionally add music, export, and verify.
- **Safer task and export storage**: task writes are lock-protected and self-heal corrupt JSON with a backup; exports write to a temporary file before moving into `output/out.mp4`.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01200---2026-07-02)

---

## v0.11.0.0

**Alpha gate: a capable local editor with browser project creation, transcript search, music placement, export settings, and action history.**

### Highlights
- **Browser project creation**: upload or drag-drop a video into an empty workspace or New Project dialog; the source is copied into the project folder, ingest progress is visible, and replacing an existing slug requires confirmation.
- **Transcript search and batch cuts**: the UI gained phrase search with kept/cut scopes, click-to-seek matches, select-as-span, Cut first / Cut all, Restore / Restore all, optional notes, and parity with `openklip transcript grep`.
- **Music placement**: music assets can be placed with gain, fades, source offset, and trim/loop mode. Preview plays a synced bed with a mute toggle, and export mixes it through ffmpeg without restarting at cuts.
- **Real export settings**: compression presets and frame rate settings now affect rendered output through the GUI dialog, CLI flags, export API, and MCP export tool.
- **Action history**: registry and GUI mutations append to `working/actions.jsonl` with action, actor, summaries, timestamp, and revision before/after; the Config panel exposes the history.
- **Engine path and upload fixes**: browser-started ingest/verify/doctor/rich-graphic export resolve helper scripts from the repo root, and uploaded sources persist inside the project folder for full-quality export.
- **Output FPS hotfix**: the v0.11 line also includes the follow-up fix that pins export output frame rate in the filter chain, repairing main CI.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01100---2026-07-02)

---

## v0.10.0.1

**Hardening follow-up to the json-render product announcement graphics.**

### Highlights
- **Scoped MCP tools require an explicit slug**: a project-scoped session rejects a slug-bearing tool called with no slug instead of silently running against the pinned project
- **JSON graphic actions validate the spec**: `json-graphic-add` and `json-graphic-set` run full product-announcement spec validation inside the action schema, rejecting invalid specs at the CLI/GUI/MCP boundary, not only at persistence
- **EDL ambiguity guard** (`src/edl.ts`): a graphic with `catalog`/`spec` fields but no `type: "json-render"` is now rejected
- **Invalid-spec preview** (`web/components/json-render-graphic-overlay.tsx`): the editor overlay shows an "Invalid graphic spec" card with the first validation issue instead of rendering nothing (export still degrades silently by skipping the graphic)
- **Toggle group fix**: pressing the active item in a single-select toggle group no longer clears the selection
- Ported the reviewed hardening from the alternate json-render branch; its frame-to-`src/` refactor and `accent`-on-`HeroStatement` change were not taken (they would revert the v0.10.0.0 accent-on-scene fix). Built red-green (619 to 623 tests)

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01001---2026-07-01)

---

## v0.10.0.0

**JSON specs become export-ready motion graphics: catalog-constrained product announcements, authored by agents and previewed pixel-for-pixel.**

### Highlights
- **Product announcement graphics** (`src/product-announcement.ts`, `web/components/product-announcement-frame.tsx`): a catalog-constrained `product-announcement` json-render graphic type. Agents author a validated JSON spec, the editor previews the exact same static React render, and it exports through the normal project timeline
- **JSON graphic actions**: `openklip json-graphic-add` and `json-graphic-set` across CLI, GUI, MCP, and the action registry, plus overlay summaries for json-render graphics
- **Product announcement playbook**: bundled `templates/product-announcement/skill.md` and a pinned slash-catalog entry so agents attach the playbook and create validated graphics with tools instead of only describing JSON
- **Spec hardening**: specs reject invalid accent values, oversized graph shapes, cyclic child graphs, orphaned elements, non-scene roots, and missing catalog/spec fields before they reach preview or export; an invalid spec is skipped (preview and export both degrade gracefully) rather than bricking the render
- **Config shell + responsive panels**: right-side Config panel with a color temperature pad; Chat and Config stay reachable below the desktop sidebar breakpoint via overlay buttons
- **Agent tool scoping**: Claude edit mode allows the full OpenKlip MCP namespace while scoped sessions only expose the active project through project-listing tools
- MCP server now exposes 55 tools with CLI/GUI parity; built red-green (585 to 619 tests)

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01000---2026-07-01)

---

## v0.9.0.0

**Default shadcn theme as the UI baseline: clean parity to build future visual work from.**

### Highlights
- **Default shadcn theme**: replaced the custom OpenKlip theme engine and palette JSON files with shadcn default CSS variables, dark-mode class handling, and registry-aligned primitives; editor chrome (buttons, sidebars, dialogs, selects, menus, sheets, tooltips, timeline) now uses stock shadcn tokens instead of bespoke success/info/sidebar-active variants
- **Base UI primitive layer**: app-owned drawer and command wrappers migrated to Base UI while preserving OpenKlip component exports and prompt-menu behavior
- **Static chat mockups**: shadcn-style message, marker, attachment, empty, field, label, tabs, and message-scroller primitives for local testing of the chat UI (mockup examples only appear in the empty state)
- **Removed**: the custom theme catalog, theme schema, theme engine, bundled theme JSON presets, obsolete motion tests, and the old drawer/command packages now covered by Base UI wrappers

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#0900---2026-06-30)

---

## v0.8.10.0

**The edit carries its own reasoning: written rationale, phrase-anchored cues, multi-take assembly.**

### Highlights
- **Written rationale** (`--note`): `openklip cut <slug> w5 --note "filler restart"` and an optional `note` on every overlay record why a pick was made. Surfaces in `openklip overlays`, the transcript and query views, and the MCP tools; metadata only, never reaches ffmpeg (`--note ""` clears it)
- **Phrase-anchored cues** (`src/reanchor.ts`): `title-add-phrase` / `zoom-add-phrase` / `broll-add-phrase` remember the spoken phrase on the overlay, so after a re-cut anchored overlays re-resolve their span onto the current kept words automatically (CLI and GUI). A deleted phrase flags `stale` and keeps the last good span; `openklip reanchor` re-resolves on demand
- **Multi-take assembly** (`src/assembly-plan.ts` + `src/assembly.ts`): `openklip take-add` ingests alternate takes into `takes/<id>/`, `openklip takes` lists them, and `openklip assemble <takeId:wStart-wEnd> ...` splices the chosen word runs into one single-source `project.json` (integer-exact re-timing) the cut/overlay/export engine edits unchanged
- Backward-compatible EDL: `src/edl.ts` gains only optional or defaulted fields, `version` stays `1`, every legacy `project.json` parses unchanged; `src/exporter.ts` is untouched
- Researched against OpenCut, VibeFrame, Monet, and craft-agents; built red-green TDD (411 to 585 tests)

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#08100---2026-06-29)

---

## v0.8.9

**Native graphics export pixel-for-pixel: first-party headless-Chrome render, fullscreen overlays.**

### Highlights
- Rich graphics templates (`kind: "rich"`) render through headless Chrome (`chrome-headless-shell` via `puppeteer-core`), driven by the same `web/lib/graphic-runtime.ts` as the live preview, so export matches preview frame-for-frame; frames capture to a transparent ProRes 4444 alpha MOV (`src/headless-render.ts`) and composite as a timed ffmpeg overlay
- The fullscreen cinema player now renders the graphics/titles/captions overlay stack (`web/components/preview-overlays.tsx`), shared with the inline preview and synced to playback
- Chrome is an optional one-time download (`bunx puppeteer browsers install chrome-headless-shell`); the default text path still needs no browser and runs fully offline
- Dropped `@hyperframes/producer` (and its `next.config.ts` esbuild workaround) in favor of the lightweight `puppeteer-core`

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#0890---2026-06-28)

---

## v0.8.5

**Chat does edits, not advice: Claude MCP mutations, resizable sidebar, asset cards, Phosphor icons.**

### Highlights
- With Claude selected, chat loads the openklip MCP server and applies cut/zoom/b-roll/title/export directly (one-line confirmation, not CLI instructions)
- Resizable right chat column (340–760px, persisted); Properties/Settings sit below the preview
- **Describe assets** in the asset bin or `openklip analyze <slug>` writes per-asset cards (summary, tags, bestFor) for meaning-based placement
- Phosphor fill icons across the editor shell via `web/lib/icon.tsx`

### Fixed
- Assistant chat text used the wrong `text-secondary` token (invisible on dark surfaces)

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#085---2026-06-28)

---

## v0.8.2

**Linear-style UI refactor: semantic tokens, CTA hierarchy, timeline track colors.**

### Highlights
- Export and Choose video use primary blue; skill tokens and secondary chrome stay grey
- `text-tertiary`, `text-quaternary`, `bg-surface-*` replace ad-hoc muted classes across the editor shell
- Timeline music, stills, and title tracks use theme tokens instead of arbitrary Tailwind hues
- Inputs, focus rings, popovers, and chat/transcript typography aligned to DESIGN.md (the design spec, since removed in the v0.9.0.0 shadcn migration)

### Fixed
- Typecheck: `agent-tools.ts`, `mcp-server.ts`, `new-project-dialog.tsx`
- Asset folder sync storm: `AssetBin` callback ref stops re-sync on every parent re-render

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#082---2026-06-28)

---

## v0.8.1

**Design system source of truth: OKLCH surfaces and Inter Variable typography.**

### Highlights
- DESIGN.md (since removed in the v0.9.0.0 shadcn migration) and [CLAUDE.md](../CLAUDE.md) documented typography, color, spacing, and motion
- Inter Variable with Linear weight recipe (510/590/680); JetBrains Mono for timestamps and paths
- Surface ladder (`--surface-0` through `--surface-3`) and text hierarchy tokens
- Modal overlays use a shared `bg-overlay` scrim token

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#081---2026-06-28)

---

## v0.8.0

**Agent query layer, MCP server, edit templates, and Codex-style skills in chat.**

### Highlights
- Bounded transcript reads: `transcript grep`, `span`, `phrase`; `status --json`, `ranges --json`, `overlays --json`
- Phrase placement helpers: `title-add-phrase`, `zoom-add-phrase`, `broll-add-phrase`
- MCP server (`openklip mcp`): 35 tools with CLI/GUI parity; `.cursor/mcp.json` for Cursor
- Edit templates (`templates/`), brand presets, `/` skills slash menu, inline skill tokens
- Empty workspace flow: folder picker landing, new-project dialog, Sonner toasts
- 387 tests (84 new for query, MCP, templates, skills, motion, toasts)

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#080---2026-06-28)

---

## v0.7.0

**Center chat layout, export dialog, and workspace folder picker.**

### Highlights
- Agent chat and prompt input in the center column; chat list stays in the left sidebar
- Chat / Transcript toggle; timeline opens in a bottom drawer; compact preview (`max-w-2xl`)
- Export options dialog: pick 720p / 1080p / 4K before render
- macOS folder picker on empty landing; projects root persists in `.openklip/projects-root`
- Collapsible sidebar (chats, assets, settings); shared asset upload from chat `+`

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#070---2026-06-28)

---

## v0.6.2

**Sidebar UX: asset fidelity, project lifecycle, chat previews.**

### Highlights
- Asset bin reconciles with `assets/` on sync and page load (prunes stale registrations and timeline overlays)
- Hover delete for assets and projects (double confirmation)
- Chat preview cards and in-progress spinner on chat rows
- Reveal project or assets folder in Finder from the sidebar
- “Create new project” copy and empty-state landing when no projects exist
- Page load and find-filler edge cases hardened (best-effort sync, chats loading)

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#062---2026-06-28)

---

## v0.6.1

**Reliability pass after the 0.6.0 editor shell refresh.**

### Highlights
- Per-slug write locks for all server-side `project.json` and `chats.json` mutations (`mutateProject`, `withChatsLock`)
- Atomic `chats.json` writes; corrupt files backed up instead of silently wiped
- Re-ingest guard: `openklip ingest --force` required to overwrite an existing project
- Asset folder sync moved to `POST /api/projects/:slug/assets/sync` (GET is read-only)
- Sidebar asset bin no longer horizontal-scrolls on long filenames

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current gaps and known issues.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#061---2026-06-28)

---

## v0.6.0

**Editor shell refresh: asset bin, persisted chats, and theme engine in the left sidebar.**

### Highlights
- Sidebar asset bin with drag-drop upload, grouped b-roll/music/stills, folder sync
- Project switcher with ingest from sidebar and ⌘1–⌘9 shortcuts
- Agent threads persisted to `working/chats.json` (not localStorage)
- Theme engine: OpenKlip, Catppuccin, GitHub, Nord, Dracula, Tokyo Night presets
- ⌘B / ⌘I keyboard shortcuts for agent sidebar and inspector

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#060---2026-06-26)

---

## v0.5.0

**Linear-parity video player: shared transport bar for inline preview and cinema mode.**

### Highlights
- Fullscreen cinema overlay with auto-hiding controls and keyboard shortcuts
- Shared `player-controls.tsx` transport bar (scrubber, volume, speed, PiP, fullscreen)
- Inline preview uses the same chrome; fullscreen icon opens cinema mode

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#050---2026-06-26)

---

## v0.4.0

**Agent selector: drive filler cuts with your existing Claude/Codex/Cursor/Grok subscription.**

### Highlights
- Multi-agent driver shells out to installed coding-agent CLIs (no API keys)
- "Find filler with <agent>" server action cuts filler words into `project.json`
- Connection detection with Signed in / Sign in / Not installed badges per provider

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#040---2026-06-26)

---

## v0.3.0

**Unified action registry: one Zod-schema'd definition per edit, CLI routes through `runAction`.**

Already published on GitHub. See [CHANGELOG.md](../CHANGELOG.md#030---2026-06-26).

---

## v0.2.0 / v0.1.0

Already published on GitHub. See [CHANGELOG.md](../CHANGELOG.md).

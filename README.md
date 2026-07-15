# OpenKlip

**Agent-native video toolchain**

![OpenKlip demo](docs/demo.gif)

OpenKlip is a local-first toolchain for programmatic video editing. An external agent (Cursor, Claude Code, Codex, your scripts) runs the edit loop through CLI commands; the browser is where you review, adjust, and export. Every project is plain files on disk: `project.json` is the contract between agent and editor. No bundled LLM, no database, no cloud.

Today the edit model is transcript-driven (words, cuts, overlays on a timeline spine). The category is the product; the transcript is the current representation, not the ceiling.

---

## Philosophy

Most video tools assume a human at the timeline and bolt on "AI features." OpenKlip assumes an **agent at the terminal** and a human at the browser: both on the same folder.

- **Agents** read state, mutate the edit, verify, export: via named CLI actions and `openklip actions --json`.
- **Humans** preview the result, refine cuts and overlays in the UI, drop assets into `assets/`.

The GUI is not a walled garden. It is a peer surface on the same `project.json` the CLI writes.

---

## Principles

These follow from how the repo is actually built:

**Local-first.** Projects live under `projects/<slug>/` as plain files. Ingest transcribes with Transformers.js (Whisper). Export and proxies use bundled `ffmpeg-static` / `ffprobe-static`.

**One edit, one file.** `project.json` holds the edit: words, cuts, asset registry, overlays, captions, look flags. `brief.md` is adjacent project context. Paths under `working/` and `output/` are derived (proxy, transcript, ffmpeg asset proxies, `chats.json`, `actions.jsonl`, `tasks.json`, exports).

**Same file, two surfaces.** The CLI applies edits through `runAction()` in `src/registry.ts`. The GUI applies edits through Next.js server actions in `app/actions.ts` (via `mutateProject()` for serialized read-modify-write). Both persist to the same `project.json`. The editor polls the project revision every 2s (and on window focus) and reseeds when CLI/MCP advances it.

**Agent-native, not agent-bundled.** No in-app LLM for the core loop. With Claude selected, chat loads the openklip MCP server and applies edits directly (cut, zoom, b-roll, title, export). Other agents get live CLI answers or skill-router hints. "Find filler" and "Describe assets" shell out to the selected agent CLI (`src/agent-driver.ts`). Or run `bun run agent-demo`.

**Sample-accurate time.** Word and overlay times are stored as integer samples at 48 kHz. CLI commands take seconds for human-facing spans and convert internally.

**User drop zone.** Original assets land in `assets/` (upload, drag-drop, or copy into the folder). Generated proxies land in `working/assets/`. Folder sync (`POST /api/projects/:slug/assets/sync`, plus page load) registers new drops and prunes stale registrations whose `src` is not a file under `assets/` (serialized per-slug so overlapping polls/tabs do not race `project.json`).

---

## Project layout

The user picks the projects folder in the GUI. Resolution order:

1. `OPENKLIP_PROJECTS_ROOT` environment variable
2. `.openklip/projects-root` (one line, absolute path; set by the GUI folder picker)
3. `~/Movies/OpenKlip` (fallback for the CLI and pre-pick cases)

```text
projects/<slug>/
  project.json       ← edit (EDL)
  brief.md           ← optional project brief
  assets/            ← user originals (flat)
  working/           ← generated cache
  output/out.mp4     ← export
```

| Path | In code |
| --- | --- |
| `project.json` | Loaded by `loadProject()` / saved by GUI and CLI |
| `assets/` | `projectPaths(slug).assets`: `registerAsset`, folder scanner |
| `working/proxy.mp4` | Preview proxy from ingest |
| `working/transcript.json` | Whisper output |
| `working/assets/` | ffmpeg proxies for video/audio assets |
| `working/chats.json` | Agent sidebar threads (`src/chats.ts`, `/api/projects/[slug]/chats`) |
| `working/actions.jsonl` | Append-only action history |
| `working/tasks.json` | Agent task progress records |
| `working/history/` | Revert snapshots, newest 100 revisions |
| `output/out.mp4` | `openklip export` / export API |

Agent sidebar chats use `working/chats.json`, not `localStorage` (color scheme and default-agent preferences still use `localStorage` in the browser).

---

## What works today

Verified against the current codebase (`VERSION` / `package.json` `0.42.0.2`, 2360 tests: 2354 pass, 6 skip without `OPENKLIP_INTEGRATION=1` and env-gated fixtures):

- **Ingest**: video → local transcript + preview proxy + `project.json` (`openklip ingest`; refuses re-ingest unless `--force`)
- **Transcript editing**: click words to toggle `deleted`; `openklip cut` / `cut --text` / `restore` on CLI
- **Phrase search + batch cuts**: transcript search bar (Mod+F to focus, Enter next match, Escape clear) with exact and punctuation-insensitive matching, Kept/Cut scopes, click-to-seek, select-as-span, Cut first / Cut all and Restore / Restore all with affected-word counts and an optional note; same phrase engine as the CLI
- **Bounded transcript reads**: `openklip transcript grep`, `span`, `phrase` for agent discovery without dumping full transcripts
- **Moment search: text + scene**: Search sidebar tab (fourth left-rail tab, Mod+Shift+F) finds moments by transcript text or visual scene content — local CLIP frame embeddings (`Xenova/clip-vit-base-patch32` via transformers.js, indexed at ingest with lazy backfill and `openklip index`) blended with scene-log summaries; thumbnail cards seek on click, and dragging a card onto the preview/transcript/timeline or its Keep button restores any cut words in that span; `openklip search`, MCP `moment_search`
- **Preview**: all-intra proxy; scheduler plays kept ranges only; compact center column (`max-w-2xl`)
- **Editor layout**: fixed 20rem shadcn sidebars; left rail switches between Chats, Assets, Search, and Config; right rail is a collapsible chat timeline; center column has extracted preview header/format/export chrome, transcript, and a compact bottom timeline drawer with denser lanes and full-width backgrounds on short projects
- **Agent chat**: `/` skills menu, inline skill tokens; skills route to the same tool surface as `openklip tools` on `project.json`; the tool-calling edit prompt also advertises a skill index (id + description, capped at 20) the model can load in full with the read-only `load_skill` tool; Claude applies edits via MCP; other agents answer or suggest commands
- **Asset cards**: `openklip analyze` or **Describe assets** in the asset bin runs per-asset subagents that write summary/tags/bestFor onto each b-roll/still so agents place media by meaning
- **Cinema player**: fullscreen overlay with Linear-parity transport bar (`web/components/cinema-player.tsx`, `player-controls.tsx`)
- **Preview cut transitions**: a decorative `glimm` WebGL sweep plays at each auto-advance cut boundary, matching `project.look.transition` (crossfade or dip); respects `prefers-reduced-motion`, degrades gracefully without WebGL, and now plays in the fullscreen cinema player too (`CinemaPlayer` gained its own `CutScheduler`, fixing a bug where it previously played every cut uncut); see [TODO.md](./TODO.md#known-limitations) for the visual-parity caveat versus the export side's ffmpeg transition
- **Captions**: preview overlay + ASS burn-in on export; five style presets (`boxed`, `clean`, `karaoke`, `bold-caps`, `minimal`) defined once and rendered identically by both (`openklip captions-style <slug> <style>`, Config panel picker); unknown/missing style ids fall back to `boxed` on load
- **Assets**: register b-roll, music, stills; sidebar asset bin with searchable/filterable thumbnail grid, duration badges, hover previews, upload + `assets/` folder sync; upload from chat `+`
- **Overlays**: b-roll cover, Ken Burns stills, push-in zooms, title cards (lower / center / hero), vignette; phrase helpers (`*-add-phrase`) on CLI
- **Export**: ffmpeg composes kept ranges + overlays + captions; segment input seeking applies on sparse voice-only and **overlay-light** timelines (music and stills allowed; b-roll and rich graphics still use full-source decode); GUI export dialog picks max height (720p / 1080p / 4K), compression preset (studio / social / web / web-low), output frame rate (source / 24 / 25 / 30 / 48 / 60), output format (MP4 / GIF, GIF has no audio and is capped at 960px width / 15fps / 5 minutes kept duration), destination (file / clipboard, clipboard copies the exported path as text), and platform preset with a live size/time estimate; height, compression, frame rate, format, and platform settings match on CLI (`--height`, `--fps`, `--compression`, `--format`, `--platform`), MCP, and the export API. The GIF width cap can be overridden per export up to a 1920px hard ceiling via CLI `--gif-max-width`, the MCP `export` tool, the export route, the export server action, and (as of v0.33.0.1) a GUI numeric input next to the GIF format hint. Destination stays GUI-only, since Clipboard is a client-side browser API call with no CLI/MCP equivalent
- **Export platform presets**: Platform picker (GUI) and `--platform <id>` (CLI/MCP): `youtube`, `youtube-4k`, `x`, `linkedin`, and **`shorts`** (9:16 vertical, source fps, 1920 height cap, -14 LUFS). Any control changed after picking a platform still wins; `--loudness <lufs>` overrides loudness for one export only
- **Vertical reframe (Shorts)**: `project.export` stores aspect (`source`, `16:9`, `9:16`, `1:1`) and crop (focus X/Y, zoom 1-3) shared by preview and ffmpeg export; GUI Reframe controls, orientation toggle (16:9 / 9:16 / 1:1), Manual / Scene / Vision crop modes, Fill / Split vertical layout, safe-area preview guides (TikTok, Reels, YouTube Shorts, generic); optional caption safe-area inset on vertical export (`openklip captions-inset`); `openklip export-set`, `openklip vision-focus` (macOS), `bun run agent-make-short`
- **Vision reframe sidecar** (macOS): `tools/vision-focus.swift` detects face center, falls back to attention saliency, attaches on-frame OCR text; GUI **Vision focus** button in Reframe; enriches speaker `sceneLog` segments with `focusX`/`focusY`
- **LLM highlight detection**: `openklip highlights-detect <slug>` finds short-form clip candidates; `openklip export-highlight <slug> all` renders each to `output/highlights/{id}.mp4`; GUI **Highlights** panel (detect, list, seek)
- **Music placement**: place a registered music asset under the edit with gain (0-2 in preview via Web Audio), fades, source in-point, and trim/loop mode (`openklip music-add` / `music-set` / `music-rm`); Config panel Music section, placed-music timeline track with drag-trim handles (parity with b-roll clips), preview bed with a mute toggle, mixed into the export by ffmpeg
- **Cleanup review**: candidates categorized as hesitations / hedging / repeats / dead-air (Cutback-style), combining deterministic filler detection, a repeated-n-gram false-start detector (immediate repeats up to 6 words, ≤0.6s apart, cut-first-keep-last), and dead-air from real audio analysis; per-candidate safe/review risk; category toggles and silence thresholds persist in `project.cuts.cleanup` (`cleanup-config` action, null unsets); one-click applies via `cleanup-apply` (`safe` keeps the legacy semantics, `enabled` applies checked categories at any risk plus all dead-air at the configured threshold, returning undo-ready span ids); `brief.md` and `project.cuts.cleanupPhrases` support **Always cut** / **Never cut** lists; dedicated Cleanup tab in the Config panel with per-category cards, bulk apply, and one-click undo; `openklip cleanup <slug> [--json] [--apply-safe] [--apply-enabled]`, MCP `cleanup_report`
- **Cleanup silence waveform**: silence waveform on the Cleanup tab plus categorized AI cleanup apply; dead-air from audio analysis and peaks API; background silences job with progress text on the Remove silence card while the cache builds; batch `cleanup-apply` with undo-safe created-vs-extended span tracking; MCP `cleanup_report`, actions `cleanup-apply`, `cleanup-config`, `dead-air-add`, `dead-air-rm`
- **VAD snap + seam crossfades**: cut boundaries optionally snap onto detected silence (`cuts.snap`) and export joins the resulting seams with equal-power crossfades that reuse a few ms of removed audio to avoid clicks; wired through the exporter, preview scheduler, and every CLI/MCP range/status query so they all agree; Config panel Audio section, GUI/MCP `cuts-snap` action, and CLI `openklip cuts-snap`
- **Ducking, loudness, voice highpass, and de-essing**: export-only audio quality pass sidechain-ducks the music bed under speech, applies single-pass loudness normalization toward a target LUFS, can highpass the voice track, and can de-ess it (ffmpeg's `deesser` filter, intensity 0-1); `openklip audio <slug>` and the Config panel Audio section (preview audio stays unprocessed)
- **Blank canvas projects**: create motion-from-scratch without camera footage (`openklip ingest --blank`, MCP `blank_ingest`, GUI New project → Blank canvas)
- **Rich graphics templates**: HTML/CSS graphic templates (`kind: "rich"`) render through headless Chrome (`chrome-headless-shell` via `puppeteer-core`), driven by the same `web/lib/graphic-runtime.ts` as the live preview, so export matches preview frame-for-frame. Frames capture with a transparent background to a ProRes 4444 alpha MOV (`src/headless-render.ts`), then composite as a timed ffmpeg overlay. Chrome is an optional, one-time download (`bunx puppeteer browsers install chrome-headless-shell`); the default text path needs no browser. Includes an 8-template motion text pack (`graphics/motion-*`), five `transition-*` cut-seam templates, 29 bundled `shader-*` templates (`@paper-design/shaders`), and project-local overrides under `projects/<slug>/graphics/`; `graphics/AUTHORING.md` documents the folder-drop contract for agents adding new templates with no code registration
- **Motion graphics workflow**: list/show templates (`openklip graphic list`, MCP `graphic_list` / `graphic_show`); phrase placement with per-word stagger; beat-snapped spans (`--beats`, `--bpm`, `--music-asset`); BPM detect and audio loudness measure; `graphic-add-cuts` places transitions at kept-range cut seams (CLI/MCP/GUI **Place at cut seams**); Config → **Graphics** picker with pack grouping, hover previews, image assets for shaders, beat mode, and project-local template upload (`manifest.json` + `composition.html`)
- **Agent motion playbooks**: `templates/motion-canvas`, `motion-graphics`, `motion-shorts`; installable copies under `skills/` (`npx skills add`, see `skills/README.md`)
- **Graphic keyframe animation**: graphic overlays carry an optional declarative `keyframes` array (opacity, scale, x/y position; seven easings — `linear`, `easeIn`, `easeOut`, `easeInOut`, `spring`, `backOut`, `anticipate`) evaluated frame-pure by the shared graphic runtime, so preview and export render identically. Edit via timeline diamond markers and a Keyframes inspector section, `graphic-set` (with `--keyframes-file`/`--clear-keyframes` on the CLI), or MCP; undo/history cover keyframe edits automatically
- **Fullscreen overlays**: the cinema player renders the graphics/titles/captions overlay stack (`web/components/preview-overlays.tsx`), shared with the inline preview and synced to playback
- **Product announcement graphics**: a catalog-constrained `product-announcement` json-render graphic type; agents author a validated JSON spec via `openklip json-graphic-add` / `json-graphic-set` (CLI / GUI / MCP), the editor previews the exact same React render, and it exports through the normal timeline. Specs are hard-validated before preview or export; invalid specs show an editor preview card and **export fails before ffmpeg** with a clear error (preview degrades gracefully; export does not silently skip)
- **Map motion graphics** (v0.41.1.0): a second json-render catalog (`map-motion`) for animated route reveals, arcs, globe flyovers, and markers via MapLibre GL (`openklip json-graphic-add <slug> map-motion`, MCP parity, `templates/map-motion/skill.md`); preview and headless export share `web/lib/map-motion-runtime.ts`
- **B-roll suggest** (v0.41.1.0): `openklip broll-suggest <slug> --phrase "..."` or `--text "..."` and MCP `broll_suggest` rank registered assets using existing asset cards (`summary`, `tags`, `bestFor`); respects `mustUse` / `avoid`; labeled benchmark fixture at `fixtures/broll-suggest/` (`tests/broll-suggest-benchmark.test.ts`)
- **Graphic template previews** (v0.41.1.0): hover and button previews in the Config → Graphics picker (`web/components/graphic-template-preview.tsx`), including live WebGL shader previews when params allow
- **Config shell + responsive panels**: Config lives in the left sidebar with color temperature plus captions/timing controls; Settings → **Features** lists shipped capabilities (`src/features.ts`); Settings → **Integrations** stores optional ElevenLabs, Grok Voice (xAI), and Reve API keys in repo-local `.openklip/integrations.json` with save/test/clear/refresh-details (keys never returned to the browser); Chat stays reachable below the desktop sidebar breakpoint via an overlay button
- **Written rationale**: `--note "<why>"` on any `cut` or overlay records why a pick was made; metadata only, never reaches ffmpeg, surfaces in `overlays` / transcript / MCP (`--note ""` clears it)
- **Phrase-anchored cues**: phrase-placed overlays remember the spoken phrase and re-resolve onto the current kept words after a re-cut (`openklip reanchor`); a deleted phrase flags `stale` and keeps the last good span
- **Multi-take assembly**: `openklip take-add` / `takes` / `assemble` splice the best take per line into one single-source `project.json` the cut/overlay/export engine edits unchanged; a Takes section in the Config panel (between Highlights and Music) browses ingested takes and assembles a selection directly in the browser, and now also uploads a new take from the browser (file-picker "Add take" control, no drag-drop)
- **Contextual cam switch** (v0.42.0.0+): multicam ingest and mix (`openklip cam-add` / `cams` / `cam-set` / `cam-mix` / `cam-override`, MCP `cam_add` / `list_cams` / `cam_set` / `cam_mix` / `cam_override`); follow-speaker or LLM auto scene switching with synthetic wide, locked manual overrides, and a mixed-down `source.mp4`/`proxy.mp4` so every existing feature keeps working unchanged; Config → Project **Cameras** section ingests cams, edits name/role/offset, tunes guardrails, locks shot spans, shows the mix timeline in both modes, and re-mixes; `templates/cam-mix/skill.md`; `bun run multicam-acceptance` and `bun run cam-devex-smoke` in the test suite
- **Action history**: append-only per-project log (`working/actions.jsonl`) records every user-facing mutation with actor, optional `authorId` / `model` / `agentSurface`, input/result summaries, timestamp, and revision before/after; tail reads with `{ limit }` avoid parsing the whole file; History section with actor/action/task filters and per-entry **Show transcript diff** for transcript mutations; optional **Show edit attribution** in Settings → Appearance (default off) controls transcript hover, History author UI, and title/zoom/still overlay inspectors; `GET /api/projects/<slug>/history`; `openklip history` / MCP `history_list`
- **Revert (undo)**: every logged mutation keeps a pre-mutation snapshot in `working/history/` (newest 100 revisions); `openklip revert <slug> (--to <rev> | --task <id> | --last) [--force]`, the MCP `revert` tool, and per-entry/per-task "Revert" buttons in the History panel restore `project.json` to an earlier state as a normal, itself-revertible mutation. Restores `project.json` only, not `brief.md`, chats, tasks, asset files, or derived media; see [TODO.md](./TODO.md#known-limitations) for the details
- **Project brief**: `brief.md` at the project root holds audience, goal, tone, must-use assets, avoid list, target length, and export formats; agents read it on every chat/edit prompt (2000-char bounded); GUI Brief section in the Config panel; `openklip brief <slug> [--set <text...> | --file <path>]` and MCP `brief_get` / `brief_set`
- **Agent tasks with live progress**: every tool-calling chat edit gets a visible task (`working/tasks.json`); the chat timeline polls while running and shows each task with steps, action-history entries, MCP tool-call traces, and a cancel button that kills the underlying agent process; the agent signals completion explicitly (`task_step` / `task_complete` MCP tools) instead of relying on heuristics; agents can list past tasks with `openklip tasks <slug> [--limit] [--status] [--actor]` or MCP `task_list`
- **Make-a-draft, make-short, make-highlights, revise-draft, and viral-launch playbooks**: `templates/make-draft/skill.md` turns one prompt into a full first draft (respects asset must-use/avoid flags); `templates/make-short/skill.md` and `bun run agent-make-short` derive a vertical short; `templates/make-highlights/skill.md` finds clip candidates and trims each to a short; `templates/revise-draft/skill.md` applies targeted revisions or whole-task revert; `templates/viral-launch/skill.md` shapes launch edits for earned attention on social feeds; export skills call `brief_audit` before export when a brief exists
- **Browser project creation**: upload a video in the New Project dialog, **Import folder…** (largest video ingests, other media lands in `assets/`), **Import from URL** (yt-dlp on PATH), or drop one or many files onto the empty workspace; uploads stream to disk with size caps (12 GB project, 4 GB asset); format-validated on client and server, source persisted into the project folder, explicit overwrite confirm on name collisions, ingest progress overlay, editor opens on completion
- **Browser editor**: open `http://localhost:<port>/<slug>` or `/?slug=<slug>` after `openklip serve`; script-first transcript editing (select words, Delete to cut)
- **Workspace**: macOS folder picker on empty landing; inline project create; projects root persisted in `.openklip/projects-root`; optional provider API keys in `.openklip/integrations.json`
- **CLI**: full edit surface; `openklip actions --json` mutations manifest; `openklip tools --json` full agent tool list; `openklip features --json` capability catalog from `src/features.ts`; `openklip brief <slug> --audit` ship-readiness check against `brief.md`
- **MCP server**: `openklip mcp` (stdio) exposes 98 tools across query, mutation, task progress, revert, and export surfaces; `.cursor/mcp.json` wired for Cursor
- **Edit templates**: `templates/<id>/skill.md` playbooks; `openklip template set`; brand presets at ingest (`openklip brand`)
- **Agent selector**: drive filler cuts via Claude Code, Codex, Cursor, or Grok subscription CLIs
- **Design system**: default shadcn/ui tokens with Base UI primitives (`app/globals.css`, `components.json`); light/dark via `.dark` class; icons via `web/lib/icon.tsx`
- **Agent demo**: `bun run agent-demo` (phrase list → cut → status → optional export)
- **Make short**: `bun run agent-make-short` (Vision enrich on macOS, 9:16 scene reframe, shorts export, verify)

Phrase-based cutting works on both surfaces: the transcript UI has search with batch cut and restore, and the CLI has `openklip cut --text`. First project on a machine: upload or drop a video in the browser, or use `openklip ingest` from the CLI. Known gaps: **[TODO.md](./TODO.md)**.

### Shorts workflow (v0.21-0.25)

End-to-end path from a long talking-head edit to a vertical short:

1. **Ingest + analyze** (optional): `openklip analyze <slug>` writes asset cards and a `sceneLog` of on-screen spans.
2. **Find hooks** (optional): `openklip highlights-detect <slug>` stores LLM clip candidates on `project.highlights`.
3. **Trim** (when needed): cut tangents/filler to target length; `make-short` warns above `--max-sec` but does not auto-cut.
4. **Reframe**: `openklip vision-focus <slug>` on macOS (or GUI Vision focus button), then `export-set --aspect 9:16 --crop-mode scene`.
5. **Export**: `openklip export-highlight <slug> h1` or `all` (writes `output/highlights/h1.mp4`, …) or `bun run agent-make-highlights <slug>`
6. **Verify**: `openklip verify <slug>`.

See `templates/make-short/skill.md` (one short from an existing edit) and `templates/make-highlights/skill.md` (multiple clips from a long source).

---

## Quick start

**Platform:** OpenKlip targets **macOS** today. Ingest (Whisper), export (ffmpeg), rich graphics (headless Chrome), and Vision reframe assume a Mac dev environment. The CLI and MCP server may run elsewhere for read/query workflows, but the full edit loop is macOS-only for now.

**Requirements:** Bun 1.3.14+, Node 24+ (`package.json` `engines`), macOS for the full pipeline.

```bash
bun install
bun run ingest /path/to/video.mp4   # creates projects/<slug>/
bun run serve <slug>                   # opens editor (sets OPENKLIP_SLUG)
bun run export <slug>
```

Dev server (port 4399):

```bash
bun run dev                            # latest project, or ?slug= in URL
OPENKLIP_SLUG=<slug> bun run dev       # pin project when using serve-style env
```

Settings:

- Interface sounds is optional. Enable it in Settings, Appearance, Interface sounds.
- **Integrations** (Settings → Integrations): optional ElevenLabs, Grok Voice (xAI), and Reve API keys. Keys save to `.openklip/integrations.json` in the OpenKlip repo checkout (mode `0600`). The UI shows a masked preview and last-updated time only. **Test** validates the key without billing where the provider allows (xAI lists voices; ElevenLabs reads the user endpoint; Reve uses a validation-order check). **Refresh details** fetches account or voice metadata when a key is saved. Nothing in the edit loop reads these keys yet; import generated audio or video through `assets/` and `openklip asset-add` as today.

---

## Agent loop

Typical external-agent sequence (no LLM inside OpenKlip):

```text
openklip status <slug> --json
openklip transcript grep <slug> "phrase"
openklip cut <slug> --text "phrase to remove"
openklip music-add <slug> <assetId> 0 20 --gain 0.3
openklip export <slug> --compression web --fps 30
openklip export <slug> --platform youtube-4k --loudness -13
```

In Cursor, enable the bundled MCP server (`.cursor/mcp.json`) and call the same tools without shelling out. Tool manifest: `openklip tools --json --surface mcp`.

### Agent capability matrix

| Agent / surface | Mutate `project.json` in chat | Typical workflow |
| --- | --- | --- |
| **Cursor** (MCP enabled) | Yes, via 98 MCP tools | Chat edits call `cut`, `broll-add`, `export`, etc. directly |
| **Claude Code / Desktop** (MCP enabled) | Yes, via MCP | Same tool surface as Cursor |
| **Codex** | CLI hints in chat | Run `openklip` commands the model suggests |
| **Grok / other CLIs** | CLI hints in chat | Agent selector shells out for filler cuts; mutations via terminal |
| **Deterministic scripts** | CLI only | `bun run agent-demo`, `bun run agent-smoke-audit`, `bun run agent-make-short`, `bun run multicam-acceptance`, `bun run cam-devex-smoke` |

### Browser integration tests

Three editor flows have optional headless Chrome tests that boot a real Next dev server against a fixture project: `tests/json-graphic-browser.test.ts`, `tests/transcript-diff-browser.test.ts`, and `tests/mobile-overlays-browser.test.ts`. They skip in the default `bun test` run. To run them locally:

```bash
OPENKLIP_INTEGRATION=1 bun test tests/transcript-diff-browser.test.ts
OPENKLIP_INTEGRATION=1 bun test tests/mobile-overlays-browser.test.ts
```

Set `OPENKLIP_CHROME_PATH` when Chrome is not at the default macOS path. CI runs these in the `integration` job.

GUI human edits and CLI/MCP mutations all write the same `project.json`. The open editor auto-refreshes when the on-disk revision advances (poll + focus).

**Agent provenance (optional env):** set these when spawning agent edits so action history records who changed what. The GUI shows attribution only when Settings → Appearance → **Show edit attribution** is enabled (default off).

| Variable | Example | Purpose |
| --- | --- | --- |
| `OPENKLIP_ACTOR` | `agent` | Log actor: `human`, `agent`, `cli`, `mcp`, or `system` |
| `OPENKLIP_AUTHOR_ID` | `ai:cursor` | Stable author id (`human:local`, `ai:claude:claude-sonnet-4-6`, …) |
| `OPENKLIP_AGENT_MODEL` | `claude-sonnet-4-6` | Model slug for display and derived author ids |
| `OPENKLIP_AGENT_SURFACE` | `cursor` | Host surface: `cursor`, `codex`, `claude-code`, `gui` |
| `OPENKLIP_TASK_ID` | task uuid | Groups one agent run's edits in History |

GUI human edits use `human:local` automatically. Full detail: **[AGENTS.md](./AGENTS.md)**.

Deterministic scripts:

```bash
bun run agent-demo <slug> --phrases scripts/example-phrases.txt --export
bun run agent-smoke-audit   # lavfi fixture (CI); --real for edgaras-raw when present; --all for both
```

Ingester plugins: `openklip ingesters` lists manifests under `ingesters/` (URL download via yt-dlp, folder import documented in `ingesters/folder/`).

Command reference: **[AGENTS.md](./AGENTS.md)**. Mutation manifest: `openklip actions --json`.

---

## How it works

- **Cut spine**: `deleted` words → kept source-time ranges (`compileTimeline`, preview scheduler, exporter).
- **Preview**: `<video>` on `working/proxy.mp4`; seeks across kept ranges.
- **Export**: ffmpeg `filter_complex`: range concat, b-roll/still cover, zoompan, vignette, libass captions/titles, music mix; compression presets pick the encoder args and the output can retime to a chosen frame rate.
- **Export source**: prefers original media; can fall back to project proxies when source files are missing (see exporter).
- **Rich graphics**: `kind: "rich"` templates render to a transparent ProRes 4444 MOV via headless Chrome (`src/headless-render.ts`, lazy-loaded), then ffmpeg overlays it like a still. ffmpeg stays the master compositor; the text/ASS path stays browser-free.

---

## Development

```bash
bun run check
bun run typecheck
bun test
bun run build
```

GitHub Actions (`.github/workflows/ci.yml`): `check`, `typecheck`, `test`, `agent-smoke-audit`, `build` on push/PR to `main`.

Roadmap, known gaps, and post-MVP ideas: **[TODO.md](./TODO.md)**.

---

## License

MIT

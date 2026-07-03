# GitHub release notes (draft)

Use these bodies when publishing releases. Each section matches a tag in `CHANGELOG.md` without duplicating the full changelog. **Known gaps:** always link to [TODO.md](../TODO.md#known-limitations); do not duplicate the list here.

Publishing status checked on 2026-07-03 (`gh release list`): GitHub releases are published through `v0.21.0.0` (v0.17.0.0 through v0.20.0.0 backfilled on 2026-07-03). `v0.22.0.0` is prepared below for publication next.

---

## v0.22.0.0

**Scene crop mode for vertical reframe, revise-draft convert-to-short, and verified make-short export loop.**

### Highlights
- **`cropMode: scene`**: after `openklip analyze`, export-set can derive crop focus from the scene log's speaker spans (GUI Manual/Scene toggle, MCP `export-set`, CLI `--crop-mode`).
- **`revise-draft`**: new "Convert to short" path (section 3b) reframes and exports with the `shorts` preset without undoing the draft.
- **Live verification**: `edgaras-raw` exported at 1080x1920 via `export-set --aspect 9:16` + `export --platform shorts`; verify passed.
- Current codebase verification: 1303 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current list. Scene mode weights speaker spans but still centers at 0.5/0.5 until per-segment focus coordinates exist. Face/saliency tracking is not implemented.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02200---2026-07-03)

---

## v0.21.0.0

**Vertical export reframe: 9:16 Shorts/Reels/TikTok with manual pan/zoom crop, preview/export parity, and a `shorts` platform preset on every surface.**

### Highlights
- **`project.export`**: aspect (`source`, `16:9`, `9:16`, `1:1`) and manual crop (focus X/Y, zoom) persist on `project.json` and drive the same math in the GUI preview and ffmpeg export (`src/export-aspect.ts`).
- **`export-set` + `shorts` preset**: `openklip export-set`, MCP `export-set`, and `openklip export --platform shorts` (or GUI Platform picker) land a vertical export without hand-rolling four separate flags. One-off `--aspect` / `--crop-*` flags override for a single export only.
- **GUI**: Reframe sliders in Config, orientation toggle writes aspect, export dialog shows correct vertical dimensions when Shorts is selected.
- Current codebase verification: 1294 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current list. Reframe is manual (focus/zoom sliders); auto subject tracking is not implemented yet. Caption safe areas per platform are still not modeled.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#02100---2026-07-03)

---

## v0.16.0.0

**Export platform presets: one named pick (YouTube, YouTube 4K, X, LinkedIn) sets compression, frame rate, resolution ceiling, and loudness target together, on CLI, API, MCP, and the GUI export dialog.**

### Highlights
- **Export platform presets**: `youtube` (1080p, -14 LUFS), `youtube-4k` (2160p, -14 LUFS), `x` (1080p/30fps, -14 LUFS), and `linkedin` (1080p/30fps, -14 LUFS), defined once in `src/export-platforms.ts`. A preset fills in defaults only: any compression/fps/maxHeight/loudness value passed explicitly still wins, and `maxHeight` never upscales past the source. `openklip export --platform <id>` (plus a new `--loudness <lufs>` override), the export API route, the `exportProject` server action, and the MCP `export` tool all share the same resolution logic; a Platform picker in the GUI export dialog sets the visible controls to match.
- **Export dialog resolution fix**: the dialog's "4K" control could previously submit the source height instead of the intended output ceiling; the displayed dimensions, size/time estimate, and the actual export now always agree.
- Current codebase verification: 1243 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current list. Platform presets are landscape-only (no vertical/9:16 destinations yet); a platform's fps is a hard pin, not a cap, so retiming footage shot at a different frame rate can duplicate frames; loudness normalization stays single-pass (lands near, not exactly at, the target).

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01600---2026-07-03)

---

## v0.15.0.0

**Caption style presets: five named looks shared by preview and export, plus agent tools to query action history and past task ids.**

### Highlights
- **Caption style presets**: `boxed`, `clean`, `karaoke`, `bold-caps`, and `minimal`, defined once in `src/caption-styles.ts` and rendered identically by the cinema preview and the ASS export burn-in. A "Caption style" picker in the Config sidebar switches presets live; `openklip captions-style <slug> <style>` and the `captions-style` action (cli/gui/mcp) do the same from the terminal or an agent. Unknown or missing style ids fall back to `boxed` on read, so older or newer projects never fail to load.
- **Portrait caption clipping fix**: export now wraps long caption lines (`WrapStyle: 0`) instead of letting them run off-frame, most visible in portrait/narrow exports.
- **Agent history and task query tools**: MCP `history_list` / `task_list` and CLI `openklip history` / `openklip tasks` let an agent read action history and past task records instead of only being able to revert blind. `templates/revise-draft/skill.md` uses them to find the task that produced a draft before reverting it.
- Current codebase verification: 1187 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current list. Caption presets are v1: fixed definitions, Arial only, no custom fonts or per-project colors yet.

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01500---2026-07-02)

---

## v0.14.1.0

**Trust completion: the transcript editor stops resurrecting cut words, and a new `revise-draft` playbook edits or reverts an existing draft.**

### Highlights
- **Transcript reconcile fix**: the contentEditable transcript editor no longer risks restoring a cut word on a stray edit. A word only comes back through an explicit action (timeline toggle, search restore, cleanup, revert); typing its text back into the transcript no longer restores it.
- **`revise-draft` playbook**: a new skill (`templates/revise-draft/skill.md`, auto-listed alongside `make-draft`) lets an agent apply targeted edits or a whole-task revert to an existing draft, with safety rails around `--force` and re-export.
- Current codebase verification: 1131 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current list. `make-short` (vertical reframe) is still not implemented; agents still have no dedicated tool to query past action or task history (GUI History panel only).

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#01410---2026-07-02)

---

## v0.14.0.0

**Task-level undo/revert: full action history coverage, pre-mutation snapshots, and a revert command on CLI, MCP, and the GUI History panel.**

### Highlights
- **Full history coverage**: action history now logs every user-facing mutation, not just registry actions: asset registration and deletion, `openklip template set`, `openklip brand` / `ingest --brand`, and multi-take `assemble` (which now writes through the same locked, logged path instead of a raw file write, so it no longer resets the revision counter). Background folder-sync prune logs under a new `system` actor. Brief saves from CLI, GUI, and MCP share one best-effort log entry.
- **Pre-mutation snapshots**: every logged mutation now keeps the project state from just before the change in `working/history/`, pruned to the newest 100 revisions.
- **Revert**: `openklip revert <slug> (--to <rev> | --task <id> | --last) [--force]`, the MCP `revert` tool, and a GUI History panel revert action restore `project.json` to an earlier snapshot as a normal logged mutation, so the revision counter stays monotonic and a revert is itself revertible. Guards refuse a revert that would silently discard another task's work (without `--force`) or cross a multi-take assembly boundary.
- **Forward-compatible schema**: `ProjectSchema` is now `.passthrough()`, so unknown top-level keys survive a load/save round-trip instead of being dropped by an older build.
- Current codebase verification: 1117 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current list. Revert restores `project.json` only, not export artifacts, `brief.md`, chats, tasks, or asset files.

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
- Current codebase verification: 1017 tests.

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the current list.

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

See [TODO.md](../TODO.md#known-limitations) for the current list.

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

See [TODO.md](../TODO.md#known-limitations) for the current list.

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

See [TODO.md](../TODO.md#known-limitations) for the current list.

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

See [TODO.md](../TODO.md#known-limitations) for the full list (current).

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

See [TODO.md](../TODO.md#known-limitations) for the full list (current).

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

See [TODO.md](../TODO.md#known-limitations) for the full list (current).

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

See [TODO.md](../TODO.md#known-limitations) for the full list (current).

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

See [TODO.md](../TODO.md#known-limitations) for the full list (current).

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

See [TODO.md](../TODO.md#known-limitations) for the full list (current).

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

See [TODO.md](../TODO.md#known-limitations) for the full list (current).

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

See [TODO.md](../TODO.md#known-limitations) (as of v0.7.0).

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

See [TODO.md](../TODO.md#known-limitations) (as of v0.6.2).

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

See [TODO.md](../TODO.md#known-limitations) (as of v0.6.1).

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

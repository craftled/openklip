# GitHub release notes (draft)

Use these bodies when publishing releases. Each section matches a tag in `CHANGELOG.md` without duplicating the full changelog. **Known gaps:** always link to [TODO.md](../TODO.md#known-limitations); do not duplicate the list here.

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

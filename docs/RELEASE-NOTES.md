# GitHub release notes (draft)

Use these bodies when publishing releases. Each section matches a tag in `CHANGELOG.md` without duplicating the full changelog. **Known gaps:** always link to [TODO.md](../TODO.md#known-limitations); do not duplicate the list here.

---

## v0.8.2

**Linear-style UI refactor: semantic tokens, CTA hierarchy, timeline track colors.**

### Highlights
- Export and Choose video use primary blue; skill tokens and secondary chrome stay grey
- `text-tertiary`, `text-quaternary`, `bg-surface-*` replace ad-hoc muted classes across the editor shell
- Timeline music, stills, and title tracks use theme tokens instead of arbitrary Tailwind hues
- Inputs, focus rings, popovers, and chat/transcript typography aligned to [DESIGN.md](../DESIGN.md)

### Fixed (post-tag on `main`)
- Typecheck: `agent-tools.ts`, `mcp-server.ts`, `new-project-dialog.tsx`
- Asset folder sync storm: `AssetBin` callback ref stops re-sync on every parent re-render

### Known gaps

See [TODO.md](../TODO.md#known-limitations) for the full list (current).

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md#082---2026-06-28)

---

## v0.8.1

**Design system source of truth: OKLCH surfaces and Inter Variable typography.**

### Highlights
- [DESIGN.md](../DESIGN.md) and [CLAUDE.md](../CLAUDE.md) document typography, color, spacing, and motion
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

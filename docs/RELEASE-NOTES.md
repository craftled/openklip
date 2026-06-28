# GitHub release notes (draft)

Use these bodies when publishing releases. Each section matches a tag in `CHANGELOG.md` without duplicating the full changelog.

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
- Export dialog compression, frame rate, and clipboard controls are UI-only (disabled) until ffmpeg supports them
- Folder picker is macOS-only; use `OPENKLIP_PROJECTS_ROOT` or `openklip ingest` elsewhere
- Write locks remain in-process only (concurrent CLI + server can still race)

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
- Write locks are in-process only. Concurrent CLI + server writes on the same slug still need OS-level file locking.

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
- Write locks are in-process only. Concurrent CLI + server writes on the same slug still need OS-level file locking.

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

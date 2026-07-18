# CLAUDE.md

Project guidance for AI agents working in OpenKlip.

## Design System

The visual language uses default shadcn/ui tokens with Base UI primitives: `app/globals.css`.
Light/dark mode is toggled via the `.dark` class (`web/lib/theme-preferences.ts`).
Icon imports go through `@/lib/icon`.

## Agent workflow

See `AGENTS.md` for the full OpenKlip edit loop, CLI commands, MCP tools, and guardrails.

## Current release memory

Re-checked 2026-07-18 after v0.44.1, a docs/marketing patch on top of v0.44.0 (marketing direct-DMG "Download for Mac" button #154/#157, sign-script `codesign` retry #156; app binary unchanged from v0.44.0, v0.44.0 DMG re-attached under the version-less `OpenKlip-macos-arm64.dmg` alias). v0.44.0 delivered the signed/notarized/downloadable macOS app + in-app auto-update against a GitHub Releases feed + project Compact/Rebuild + engine log file with crash retention + Job Center fixes (PRs #144–#153 on top of #121–#142).

- **Version:** `0.44.1` in `VERSION` and `package.json`.
- **Tests:** Prefer `bun test --isolate` / `bun run test` (fresh global object per file). Integration browser tests skip without `OPENKLIP_INTEGRATION=1`; the acceptance gate skips without `OPENKLIP_ACCEPTANCE=1`.
- **Test flake:** plain `bun test` (no `--isolate`) can leak `mock.module` stubs across files in one process; see AGENTS.md "Known test flake".
- **Counts:** 98 MCP tools in the full manifest (`openklip tools --json --surface mcp`; measure via file+parse, not pipe+grep); default MCP connect enables core + meta only. 54 capabilities (`openklip features --json`), 46 registry actions (`openklip actions --json`). Test suite measured at 2743 (2729 pass, 14 skip) for this docs pass.
- **Release docs:** `CHANGELOG.md` is authoritative history, `docs/RELEASE-NOTES.md` holds GitHub release bodies, `TODO.md#known-limitations` is the single current gaps list. Keep `docs/specs`, `docs/solutions`, and `docs/acceptance`; do not reintroduce post-ship `docs/ship|progress|qa` archives that duplicate CHANGELOG.
- **Published GitHub releases:** through `v0.44.1`, the current **Latest** release (verified 2026-07-18 via `gh release list`). Both v0.44.0 and v0.44.1 carry the versioned DMG + the version-less `OpenKlip-macos-arm64.dmg` alias the marketing button needs (v0.44.1 re-attaches v0.44.0's binary), but **no** `latest.json` updater feed, so the in-app updater stays dormant by design.

## Subagent fleet (cost routing)

Custom subagents in `.claude/agents/` pin cheap models to high-volume roles; use them instead of default (session-model) subagents:

- `scout` (Haiku): read-only recon and file:line fact-finding, several in parallel.
- `implementer` (Sonnet): red-green TDD work from a precise brief; worktree-isolate parallel runs.
- `reviewer` (Sonnet): one per review dimension, JSON-line findings behind an evidence gate.
- `docs-sync` (Sonnet): README/TODO/AGENTS/checklist sync with self-measured counts.
- `red-team` (session model): one per ship, after the reviewers, hunting what they missed.

Reserve the session model for orchestration, integration, judgment calls, and final review. Verification gates (full test suite, typecheck, lint, build) stay mandatory regardless of which model produced the change.

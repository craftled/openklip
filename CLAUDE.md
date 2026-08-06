# CLAUDE.md

Project guidance for AI agents working in OpenKlip.

## Design System

The visual language uses default shadcn/ui tokens with Base UI primitives: `app/globals.css`.
Light/dark mode is toggled via the `.dark` class (`web/lib/theme-preferences.ts`).
Icon imports go through `@/lib/icon`.

## Agent workflow

See `AGENTS.md` for the full OpenKlip edit loop, CLI commands, MCP tools, and guardrails.

## Current release memory

Re-checked 2026-08-06 after a dependency modernization pass (PRs #166, #168–#173) on top of v0.44.2. v0.44.2 shipped the automated desktop release pipeline (#160), Linear as the single source of truth for todos/bugs/roadmap (#159), two audited dependency refreshes (#161, #162), and two release-script fixes (#164, #165). v0.44.1 before it was a docs/marketing patch on v0.44.0 (direct-DMG "Download for Mac" button #154/#157, sign-script `codesign` retry #156), and v0.44.0 delivered the signed/notarized/downloadable macOS app + in-app auto-update + project Compact/Rebuild + engine log file with crash retention + Job Center fixes (PRs #144–#153 on top of #121–#142).

- **Version:** `0.44.2` in `VERSION` and `package.json`. The dependency pass since v0.44.2 is unreleased; no version bump yet.
- **Dependency posture:** everything in-range is current as of 2026-08-06. Five deliberate holds, each with the reasoning on its PR or in CHANGELOG: `next` 16.3.0 (segfaults `bun run build` on Linux — oven-sh/bun#36866; its CVE-2025-13465 lodash fix is build-time-only and unreachable here, so #167 stays drafted), `typescript` 7 (no stable programmatic compiler API until 7.1, which MDX tooling needs), `maplibre-gl` 6 (ESM-only + WebGL2-required, and `src/headless-render.ts` pins the 5.24.0 CSS), `motion` 13 (major split against `fumadocs-ui`'s `motion ^12`), `cuelume` 0.2.2 (API-compatible but the sound palette may have been retuned). Re-check these before assuming a bump is blocked.
- **Tests:** Prefer `bun test --isolate` / `bun run test` (fresh global object per file). Integration browser tests skip without `OPENKLIP_INTEGRATION=1`; the acceptance gate skips without `OPENKLIP_ACCEPTANCE=1`.
- **Test flake:** plain `bun test` (no `--isolate`) can leak `mock.module` stubs across files in one process; see AGENTS.md "Known test flake".
- **Counts:** 98 MCP tools in the full manifest (`openklip tools --json --surface mcp`; measure via file+parse, not pipe+grep); default MCP connect enables core + meta only. 54 capabilities (`openklip features --json`), 46 registry actions (`openklip actions --json`). Test suite measured at 2747 across 293 files (2733 pass, 14 skip) for this docs pass. CI on Linux reports 2732 pass / 15 skip over the same 2747 — one darwin-only test skips there, which is expected, not a regression.
- **Release docs:** `CHANGELOG.md` is the authoritative in-repo history. Release bodies live only in **GitHub Releases** (write them directly via `gh release create --notes` at release time; there is no in-repo release-notes draft). Todos, bugs, roadmap, and known gaps live in the **OpenKlip Linear project** (team Craftled, `https://linear.app/craftled/project/openklip-687f57863d8c`), never in a repo TODO/checklist. Keep `docs/specs`, `docs/solutions`, and `docs/acceptance`; do not reintroduce post-ship `docs/ship|progress|qa` archives that duplicate CHANGELOG, a repo-side gap list, or an in-repo release-notes file.
- **Published GitHub releases:** through `v0.44.2`, the current **Latest** release (verified 2026-08-06 via `gh release list`). v0.44.0 and v0.44.1 carry the versioned DMG + the version-less `OpenKlip-macos-arm64.dmg` alias the marketing button needs (v0.44.1 re-attaches v0.44.0's binary). No release has published a `latest.json` updater feed yet, so the in-app updater stays dormant by design — v0.44.2 added the pipeline that can publish one (#160), but it has not been exercised for a real release.
- **Known coverage gap:** the rich-graphic headless render path (`renderHeadlessAlpha` in `src/headless-render.ts`, only caller `src/graphic-render.ts`) has **no automated test**. No test references it, and CI never installs `chrome-headless-shell`, which `findChrome()` requires — and unlike the browser integration tests it honours no `OPENKLIP_CHROME_PATH` override. A graphics/shader dependency change can therefore break video export with every gate green; verify that path by hand until CRAFT-6735 closes it.

## Subagent fleet (cost routing)

Custom subagents in `.claude/agents/` pin cheap models to high-volume roles; use them instead of default (session-model) subagents:

- `scout` (Haiku): read-only recon and file:line fact-finding, several in parallel.
- `implementer` (Sonnet): red-green TDD work from a precise brief; worktree-isolate parallel runs.
- `reviewer` (Sonnet): one per review dimension, JSON-line findings behind an evidence gate.
- `docs-sync` (Sonnet): README/AGENTS/CHANGELOG sync with self-measured counts; files gaps to Linear, never a repo TODO.
- `red-team` (session model): one per ship, after the reviewers, hunting what they missed.

Reserve the session model for orchestration, integration, judgment calls, and final review. Verification gates (full test suite, typecheck, lint, build) stay mandatory regardless of which model produced the change.

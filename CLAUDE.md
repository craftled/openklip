# CLAUDE.md

Project guidance for AI agents working in OpenKlip.

## Design System

The visual language uses default shadcn/ui tokens with Base UI primitives: `app/globals.css`.
Light/dark mode is toggled via the `.dark` class (`web/lib/theme-preferences.ts`).
Icon imports go through `@/lib/icon`.

## Agent workflow

See `AGENTS.md` for the full OpenKlip edit loop, CLI commands, MCP tools, and guardrails.

## Current release memory

Re-checked 2026-07-17 after v0.43.0 (macOS desktop app + production launcher + Job Center durable/cancellable/retryable background jobs + deterministic acceptance gate + a batch of security/reliability hardening: atomic project writes, loopback bind + trust guard, transactional force re-ingest, streamed uploads, overlay-save concurrency, optimistic-save recovery, pipe-safe JSON output; PRs #121–#142 on top of #107–#119).

- **Version:** `0.43.0` in `VERSION` and `package.json`.
- **Tests:** Prefer `bun test --isolate` / `bun run test` (fresh global object per file). Integration browser tests skip without `OPENKLIP_INTEGRATION=1`; the acceptance gate skips without `OPENKLIP_ACCEPTANCE=1`.
- **Test flake:** plain `bun test` (no `--isolate`) can leak `mock.module` stubs across files in one process; see AGENTS.md "Known test flake".
- **Counts:** 98 MCP tools in the full manifest (`openklip tools --json --surface mcp`; measure via file+parse, not pipe+grep); default MCP connect enables core + meta only. 54 capabilities (`openklip features --json`), 46 registry actions (`openklip actions --json`). Test suite measured at 2710 (2696 pass, 14 skip) for this docs pass.
- **Release docs:** `CHANGELOG.md` is authoritative history, `docs/RELEASE-NOTES.md` holds GitHub release bodies, `TODO.md#known-limitations` is the single current gaps list. Keep `docs/specs`, `docs/solutions`, and `docs/acceptance`; do not reintroduce post-ship `docs/ship|progress|qa` archives that duplicate CHANGELOG.
- **Published GitHub releases:** through `v0.43.0` (stated on the orchestrator's authority for this cut; not independently verified via `gh release list` in this pass).

## Subagent fleet (cost routing)

Custom subagents in `.claude/agents/` pin cheap models to high-volume roles; use them instead of default (session-model) subagents:

- `scout` (Haiku): read-only recon and file:line fact-finding, several in parallel.
- `implementer` (Sonnet): red-green TDD work from a precise brief; worktree-isolate parallel runs.
- `reviewer` (Sonnet): one per review dimension, JSON-line findings behind an evidence gate.
- `docs-sync` (Sonnet): README/TODO/AGENTS/checklist sync with self-measured counts.
- `red-team` (session model): one per ship, after the reviewers, hunting what they missed.

Reserve the session model for orchestration, integration, judgment calls, and final review. Verification gates (full test suite, typecheck, lint, build) stay mandatory regardless of which model produced the change.

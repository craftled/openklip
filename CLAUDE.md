# CLAUDE.md

Project guidance for AI agents working in OpenKlip.

## Design System

The visual language uses default shadcn/ui tokens with Base UI primitives: `app/globals.css`.
Light/dark mode is toggled via the `.dark` class (`web/lib/theme-preferences.ts`).
Icon imports go through `@/lib/icon`.

## Agent workflow

See `AGENTS.md` for the full OpenKlip edit loop, CLI commands, MCP tools, and guardrails.

## Current release memory

Re-checked 2026-07-13 after PR #101 (multicam GUI parity + chunked silence analysis) merged to `main`.

- **Version:** `0.42.0.0` in `VERSION` and `package.json` (published on GitHub). `CHANGELOG.md` **Unreleased** holds PR #101 follow-ups on `main`.
- **Tests:** `bun test --isolate` runs 2360 tests (2354 pass, 6 skip without `OPENKLIP_INTEGRATION=1`). Prefer `--isolate` in scripts and CI.
- **Test flake:** plain `bun test` (no `--isolate`) can leak `mock.module` stubs across files in one process; see AGENTS.md "Known test flake". `--isolate` gives each test file a fresh global object.
- **Counts:** 98 MCP tools (`openklip tools --json --surface mcp`; measure via file+parse, not pipe+grep), 54 capabilities (`openklip features --json`), 46 registry actions (`openklip actions --json`).
- **Release docs:** `CHANGELOG.md` is authoritative history, `docs/RELEASE-NOTES.md` holds GitHub release bodies, `TODO.md#known-limitations` is the single current gaps list.
- **Published GitHub releases:** through `v0.42.0.0` (published 2026-07-13).

## Subagent fleet (cost routing)

Custom subagents in `.claude/agents/` pin cheap models to high-volume roles; use them instead of default (session-model) subagents:

- `scout` (Haiku): read-only recon and file:line fact-finding, several in parallel.
- `implementer` (Sonnet): red-green TDD work from a precise brief; worktree-isolate parallel runs.
- `reviewer` (Sonnet): one per review dimension, JSON-line findings behind an evidence gate.
- `docs-sync` (Sonnet): README/TODO/AGENTS/checklist sync with self-measured counts.
- `red-team` (session model): one per ship, after the reviewers, hunting what they missed.

Reserve the session model for orchestration, integration, judgment calls, and final review. Verification gates (full test suite, typecheck, lint, build) stay mandatory regardless of which model produced the change.

# CLAUDE.md

Project guidance for AI agents working in OpenKlip.

## Design System

The visual language uses default shadcn/ui tokens with Base UI primitives: `app/globals.css`.
Light/dark mode is toggled via the `.dark` class (`web/lib/theme-preferences.ts`).
Icon imports go through `@/lib/icon`.

## Agent workflow

See `AGENTS.md` for the full OpenKlip edit loop, CLI commands, MCP tools, and guardrails.

## Current release memory

- Code truth checked on 2026-07-05: `VERSION` and `package.json` are `0.41.0.2`; `bun test` runs 1831 tests (1829 pass, 2 skip); `openklip tools --json --surface mcp` lists 83 MCP tools; `openklip actions --json` lists 43 registry actions.
- Release docs: `CHANGELOG.md` is authoritative history, `docs/RELEASE-NOTES.md` holds GitHub release bodies, and `TODO.md#known-limitations` is the single current gaps list.
- Published GitHub releases run through `v0.41.0.2` (`gh release view v0.41.0.2`). Release bodies live in `docs/RELEASE-NOTES.md` (extract the matching version section at ship). `v0.36.0.1` is tagged at `3d13dc8`, its last content commit.

## Subagent fleet (cost routing)

Custom subagents in `.claude/agents/` pin cheap models to high-volume roles; use them instead of default (session-model) subagents:

- `scout` (Haiku): read-only recon and file:line fact-finding, several in parallel.
- `implementer` (Sonnet): red-green TDD work from a precise brief; worktree-isolate parallel runs.
- `reviewer` (Sonnet): one per review dimension, JSON-line findings behind an evidence gate.
- `docs-sync` (Sonnet): README/TODO/AGENTS/checklist sync with self-measured counts.
- `red-team` (session model): one per ship, after the reviewers, hunting what they missed.

Reserve the session model for orchestration, integration, judgment calls, and final review. Verification gates (full test suite, typecheck, lint, build) stay mandatory regardless of which model produced the change.

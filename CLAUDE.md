# CLAUDE.md

Project guidance for AI agents working in OpenKlip.

## Design System

The visual language uses default shadcn/ui tokens with Base UI primitives: `app/globals.css`.
Light/dark mode is toggled via the `.dark` class (`web/lib/theme-preferences.ts`).
Icon imports go through `@/lib/icon`.

## Agent workflow

See `AGENTS.md` for the full OpenKlip edit loop, CLI commands, MCP tools, and guardrails.

## Current release memory

- Code truth checked on 2026-07-12: `VERSION` and `package.json` are `0.42.0.0` (prepared, unpublished); `bun test --isolate` runs 2037 tests (2032 pass, 5 skip without `OPENKLIP_INTEGRATION=1`). Plain `bun test` (no `--isolate`) was flaky this session, from 0 fail up to 150 fail across repeat runs with no code changes between them, a worse case of the cross-file mock-leakage flake AGENTS.md's "Known test flake" note already describes; `--isolate` (a real bun flag: fresh global object per test file) sidesteps it. `src/agent-tools.ts` exposes 95 MCP tools; `openklip features --json` lists 52 capabilities from `src/features.ts`; `openklip actions --json` lists 44 registry actions.
- Release docs: `CHANGELOG.md` is authoritative history, `docs/RELEASE-NOTES.md` holds GitHub release bodies, and `TODO.md#known-limitations` is the single current gaps list.
- Published GitHub releases through `v0.41.1.1` (`gh release list`). `v0.41.1.3` is prepared as a draft in `docs/RELEASE-NOTES.md` from PR #83 plus local asset/timeline/runtime follow-ups, but is not published until `main` is pushed and a tag/release is created. `v0.42.0.0` (contextual cam switch / multicam) is prepared the same way from local feature work; its spec (`docs/specs/contextual-cam-switch-v1.md`) makes real multi-cam footage acceptance a release gate that has not been run yet, so do not tag or publish until that gate passes and `main` is synced.

## Subagent fleet (cost routing)

Custom subagents in `.claude/agents/` pin cheap models to high-volume roles; use them instead of default (session-model) subagents:

- `scout` (Haiku): read-only recon and file:line fact-finding, several in parallel.
- `implementer` (Sonnet): red-green TDD work from a precise brief; worktree-isolate parallel runs.
- `reviewer` (Sonnet): one per review dimension, JSON-line findings behind an evidence gate.
- `docs-sync` (Sonnet): README/TODO/AGENTS/checklist sync with self-measured counts.
- `red-team` (session model): one per ship, after the reviewers, hunting what they missed.

Reserve the session model for orchestration, integration, judgment calls, and final review. Verification gates (full test suite, typecheck, lint, build) stay mandatory regardless of which model produced the change.

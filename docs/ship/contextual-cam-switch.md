# Ship Report — Contextual cam switch (multicam), 0.42.0.0

Date: 2026-07-12. Mode: Check (report-only). Target: branch `claude/feature-availability-check-f784a6` → `main`.

## Target

5 commits (`ae4bcd6..eb5cd4c`), 48 files, +6,985/−20 vs `origin/main` (986e796, unchanged since branch — fast-forward mergeable). Feature: multicam contextual cam switch across engine/CLI/MCP/GUI + release docs for 0.42.0.0. Spec: docs/specs/contextual-cam-switch-v1.md. Build log: docs/progress/contextual-cam-switch.md.

## Current State

Working tree clean. Branch is local-only (never pushed); no PR exists; remote CI (.github/workflows/ci.yml) has not run for this work.

## Evidence Checked

- Local verification, full remote-CI mirror on this machine:
  - `bun run check` (ultracite): clean, 775 files
  - `bun run typecheck`: clean
  - `bun test`: 2037 tests, 2032 pass / 5 skip / 0 fail — three consecutive clean runs (2 bare, 1 `--isolate`)
  - `bun run agent-smoke-audit`: passed
  - `bun run build` (via `bun run ci`): green
  - `bun run test:integration` (browser, Chrome): 2/2 pass
- Review evidence: per-lane orchestrator review before every landing; 10 defects caught and fixed with red-first regressions (locked-span inheritance, enforceMinShot indexing, negative offsets, f32 temp-WAV bridge, missing frames extraction, poisoned integration test, ffmpeg bracket-nested wide labels, GUI lock-dropping re-mix, Section nesting/SSR crash, legend Wide). Same-context reviews — no independent fresh-context review has run.
- QA evidence: localhost E2E on real-speech fixtures — 101/101 word attribution, follow plan cuts in silence gaps, locked synthetic wide survives CLI and GUI re-mix (verified in-browser and via extracted frames), preview playback correct, `openklip export` works downstream. Live agent auto-mix not exercised (rules fallback verified; LLM path covered by canned-reply tests).
- Docs: version 0.42.0.0 bumped; CHANGELOG + RELEASE-NOTES draft; TODO known-limitations; AGENTS/README/CLAUDE counts self-measured (52 features, 95 MCP tools, 44 actions).

## Review Gate

Present (per-lane, documented) but same-context. A fresh `$tstack-review` second opinion is warranted for a change this size; not yet run.

## QA Gate

Present: localhost GUI + CLI E2E with visual evidence (this session + progress doc). `$tstack-devex-qa` has not covered the new CLI surface (cam-add/cams/cam-set/cam-mix/cam-override).

## CI / Checks

Local: all green (see above). Remote: NOT RUN — branch unpushed, no PR. ci.yml runs check/typecheck/bare `bun test`/smoke-audit/build + Chrome integration job; bare `bun test` showed load-correlated flakiness once this session (unreproducible since; chip filed).

## Release / Deploy Notes

0.42.0.0 prepared, unpublished — matches repo precedent (v0.41.1.3 same posture). Spec makes REAL multi-cam footage acceptance a hard gate for tag/publish; it has not run (fixtures were synthetic speech). Gate blocks tag/release, not merge. No migrations, no auth/payments/secrets surface. Rollback = revert 5 commits; feature is additive (new modules + one optional Word field, passthrough-safe).

## Actions Taken

None (Check mode). No push, no PR, no merge, no tag, no edits.

## Risks / Blast Radius

- BLOCKER for merge: `.claude/launch.json` is committed WITH a session-specific `"env": { "OPENKLIP_SLUG": "cam-demo" }` pin — ships a dev-machine artifact that would pin every contributor's media route to a nonexistent project. One-line fix (drop env pin or untrack file) + commit.
- Bare `bun test` flake risk on CI runners (observed once locally under load; chip task_19c259ab).
- Cams ending before plan spans freeze frames (documented known limitation).
- Preview media route's single-active-project fallback (`resolveSlug`) is a pre-existing repo behavior that surfaced during E2E; not multicam-caused, not fixed here.

## Missing Coverage

- Remote CI run (requires push/PR).
- Real-footage acceptance (release gate; Tomas to supply recording).
- Fresh-context review; devex QA pass over the new CLI surface.
- Live LLM auto-mix run against a real agent CLI.

## Verdict

FIX_FIRST

## Recommended Next

1. hand over: branch `claude/feature-availability-check-f784a6` + this report — remove the `OPENKLIP_SLUG` env pin from `.claude/launch.json` (one line), commit, then push and open the PR so remote CI (the only unrun required gate for merge) executes.
2. `$tstack-qa` acceptance run on real multi-cam footage before tagging/publishing 0.42.0.0 (spec-mandated release gate).
3. Optional hardening given the 7k-line diff: `$tstack-review` (fresh context / codex second opinion) + `$tstack-devex-qa` over the new cam-* CLI surface.

## Amendment — 2026-07-12 (post fresh review)

Requested actions executed: launch-config fix (5919048), fresh-context review, PR creation.

Second-opinion review (Second Opinion mode, `$tstack-review`): grok composer-2.5-fast and codex gpt-5.5 lanes both returned FIX_FIRST with 5 distinct blocking findings (lock drop on CLI/MCP re-mix; locked-boundary snap drift; re-mix edit-state loss; mutateProject/history bypass; offset/short-cam duration drift; missing LLM max-shot clamp). All fixed red-first in 159e7bb; formatter-only hunks in 5 pre-existing files judged acceptable drift; my same-context read added early override validation + GUI row cleanups. Post-fix: `bun run ci` green (2045 tests/0 fail), integration suites green, and the lock-preservation case verified live on the demo project (locked wide exact through plain cam-mix, revision 1 recorded).

Review verdict after fixes: PASS. Remote CI pending on the PR; real-footage acceptance still gates tag/publish only.

# Ship Report

## Target
PR [#89](https://github.com/craftled/openklip/pull/89) — `claude/feature-availability-check-8cfe76` → `main`. "feat: moment search — text + scene search with drag/Keep-to-restore (parity: 'Search, drag and go')". 42 files changed, +4527/-16.

## Requested Mode
Check (no explicit fix/merge/deploy instruction given — `/tstack-ship` invoked bare).

## Current State
- Local branch clean, no uncommitted changes, up to date with `origin/claude/feature-availability-check-8cfe76`.
- Base (`main`) unmoved since the branch was cut (`986e796`).
- PR: `OPEN`, not draft, `mergeable: MERGEABLE` (no conflicts), `mergeStateStatus: UNSTABLE` (failing check, see CI below), `reviewDecision: none`.
- 0 PR comments, 0 PR reviews.

## Evidence Checked
- 4 commits, sliced by concern (engine/index/CLI → panel UI → drag-Keep/MCP/cut-parity → calibration+docs); decision record in project memory (`moment-search-decisions.md`) locked before implementation.
- Full diff read across all 4 commits during the build; every subagent/Grok-lane report cross-checked against the actual diff, not taken on faith.
- Local gates (this session, working tree at HEAD): `tsc --noEmit` clean; `bun test --isolate` → 2053 pass / 8 skip / 0 fail across 219 files (re-run twice, both green — one earlier run showed 1 fail while the dev server was concurrently hitting the same project files, not reproduced after); `next build` clean.
- Hands-on E2E on localhost (parity-demo project): Search tab reachable via sidebar and Mod+Shift+F; text + scene search return results with thumbnails; click-to-seek verified; cut-word found with `cut` badge; Keep button restored it (toast, cut-count 2→1, `project.json` `deleted:false` confirmed on disk); drag payload verified end-to-end via dispatched DragEvents into the real React handler chain, same restore path, same disk verification; existing Mod+F transcript-search dialog unaffected.
- Model-quality verification: built a synthetic 4-scene ground-truth video (known content per segment), ran it through the real ingest→index→search pipeline, and used it to catch and fix a real defect (uncalibrated scoring returned one video-length blob and ranked absurd queries above correct ones) before it shipped — not just unit tests on synthetic vectors.
- A hydration-hazard bug (nested `<button>`) surfaced only in the live browser console, not in any automated gate, and was fixed before commit.

## Review Gate
**Missing.** No independent/fresh-context review ran on this diff — `/code-review`, `$tstack-review`, and the repo's own documented pre-ship fleet (`reviewer` × N dimensions + `red-team`, per `CLAUDE.md`) were all skipped. The user's build instruction was "you [Claude] just review and judge" in real time as three Grok execution lanes produced code; that caught real issues (a locked-decision violation, the hydration bug, the scoring defect) but is not a substitute for a fresh pair of eyes — the reviewing context held full intent/rationale throughout, which is exactly the blind spot an independent review exists to counter. 0 PR comments, 0 PR reviews confirms no one else has looked at this diff either. This is a real gap on a non-trivial change (new ML-backed subsystem, new MCP tool, new drag-and-drop surface, restore-via-cut semantics), not a technicality.

## QA Gate
Adequate, same-session evidence (see Evidence Checked above): real dev server, real project data, real restore round-trip verified on disk, real drag dispatched through actual handlers, console errors caught and fixed. Not independent QA, but genuinely hands-on rather than assumed.

## CI / Checks
- `integration` — **pass** (58s; the OPENKLIP_INTEGRATION=1 browser-backed suite).
- `test` (`bun run check` / ultracite) — **fail** (14s; fails before the test suite itself runs). Root cause verified two ways: (1) `git diff main...HEAD` on the 3 flagged files (`app/globals.css`, `web/components/audio-drawer.tsx`, `web/components/ui/slider.tsx`) is empty — this PR does not touch them; (2) ran `bun run check` directly against the `main` worktree (commit `986e796`, current `origin/main` HEAD) and reproduced the same 3 errors there (plus 2 more in `editor-preview-pane.tsx` that this PR's unrelated edit to that file incidentally fixed). `gh run list --branch main` confirms `main`'s own CI has been red on this same `test` job since `986e796` landed on 2026-07-09 — three days before this branch existed. **This failure is 100% pre-existing on `main`, not introduced by this PR.** `main` has no branch protection (`gh api .../protection` → 404), so it does not technically block the merge button, but it will keep showing red on this PR (and any other PR against `main`) until fixed at the source.

## Release / Deploy Notes
No version/changelog/release action requested or taken. `CHANGELOG.md` already carries an `## Unreleased` entry for this feature from the build session. No migrations, no schema changes to `project.json` (new `working/moment-index.json` sidecar is additive and inert if absent). New runtime behavior: first index build or first `moment_search` call downloads a ~150MB CLIP model to `~/.cache/huggingface` (same pattern as the existing Whisper download, needs network once).

## Actions Taken
None. Read-only readiness check: `git fetch`, `gh pr view`/`checks`/`run view`, local re-verification of the CI failure's root cause, this report. No code edits, no lint auto-fixes, no merge.

## Risks / Blast Radius
Contained and additive. New ingest phase is non-fatal (try/catch, ingest proceeds if indexing fails). Restore path reuses the existing logged, revertible `cut` action — no new mutation primitive. Drag-drop wiring adds handlers to three existing components without altering their existing behavior (verified via diff). New MCP tool is additive to the 90→91 tool manifest. Worst case on a bad merge: Search tab misbehaves or the embed worker fails to spawn — both isolated to the new surface, with no path back into cut/export/timeline correctness. Revert is a clean single-merge-commit revert (no data migration to unwind).

## Missing Coverage
- Independent code review (see Review Gate) — the concrete gap blocking a clean `PASS`.
- The pre-existing `main`-CI lint failure is unrelated to this PR but will keep this PR's `test` check red regardless; worth a separate one-line fix on `main` (not in scope here, not auto-fixed).

## Verdict (original)
`FIX_FIRST`

## Update: independent review ran, findings fixed

`$tstack-review` (Deep mode, 5 independent fresh-context reviewer subagents, one per dimension) ran against this diff after this report. 3 `BLOCKING` findings, all independently verified by the orchestrator against the actual code before being accepted, all fixed in follow-up commits:

1. `buildMomentIndex` had no locking despite this codebase's own established cross-process lock pattern (`project-lock.ts` + `project-file-lock.ts`) existing for exactly this hazard (CLI/MCP-server/web-server, three separate OS processes, same slug). Fixed: `withMomentIndexLock` + `acquireProjectFileLock` around the build, a spawn timeout, and a pid-suffixed tmp path as independent hardening.
2. A new `tests/agent-tools.test.ts` test unconditionally triggered real CLIP model inference (no `OPENKLIP_INTEGRATION=1` gate, unlike every sibling real-model test in the same PR) — reproduced directly via a stray `[embed]` log line during a plain `bun test` run. Fixed: `executeMomentSearch` now re-checks index staleness after a build attempt and short-circuits before ever calling `embedQueryText` when there is nothing to search.
3. The REST route's real-query success path (`GET` with a non-empty `q` against a current index) had zero test coverage — confirmed by reading every test in `tests/moment-search-route.test.ts`. Fixed: added a test-only `OPENKLIP_EMBED_SCRIPT_PATH` override (same convention as `OPENKLIP_PROJECTS_ROOT`) plus a fake `serve` script, so the route's actual `embedText → searchScenes → Response.json` wiring is now exercised end-to-end without a real model.

9 non-blocking findings were also fixed in the same pass (resetChild proc-identity race, missing spawn timeout, no client-side request cancellation, CLI/MCP error-handling asymmetry, dropped build-error message, unbounded drag-payload span, two dead-code exports, a missing panel render test, a stale comment) — full detail in the commit messages. Two findings were deliberately left as-is after closer inspection: the MCP `limit` cap (matches sibling MCP tools in the same file; removing it would have made things worse) and the index content-hash staleness gap (not reachable via any current code path; would need an index schema change).

Post-fix re-verification: all 3 blocking findings independently re-confirmed fixed via targeted tests; full gates re-run clean (`tsc`, `ultracite check` — same 3 pre-existing unrelated errors as before, `bun test --isolate` 2072 pass / 0 fail, up from 2053, `next build` clean); manual browser re-verification on a fresh (cache-cleared) dev server compile confirmed no regressions in the search → Keep → restore flow.

## Verdict
`PASS` — ready to merge.

## Recommended Next
1. Hand over: PR #89 (`claude/feature-availability-check-8cfe76` → `main`), this evidence packet, and the diff itself — to `$tstack-review` (or the repo's `reviewer` + `red-team` subagent fleet per `CLAUDE.md`) for an independent pass before merge. This is the one gate genuinely missing; everything else checked out.
2. Separately, main's own CI is red (3 pre-existing `ultracite` errors in `app/globals.css`, `web/components/audio-drawer.tsx`, `web/components/ui/slider.tsx`, present since `986e796` landed 2026-07-09) — worth a tiny standalone fix-and-merge to `main` so PR #89 and every future PR stops inheriting a red `test` check. Say the word and I'll do it as its own small PR.
3. Once review clears, re-run `/tstack-ship` — this verdict expires on any new commit, review comment, or CI change, per the freshness rule.

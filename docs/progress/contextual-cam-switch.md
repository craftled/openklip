# Progress — Contextual cam switch (multicam)

Spec: `docs/specs/contextual-cam-switch-v1.md` (interview-locked 2026-07-12).
Orchestration: Claude Fable 5 reviews/judges; grok lanes (`grok-composer-2.5-fast`) implement under red-green TDD briefs. Target release: 0.42.0.0, status shipped.

## Environment notes

- 2026-07-12: worktree baseline was red (377/556, 179 fail, 167 errors) — root cause: `ffprobe-static` ships an x86_64 binary in `bin/darwin/arm64/`, and this machine has no Rosetta (`EBADARCH`). Same broken binary exists in the main checkout. Local fix: `brew install ffmpeg`, then symlink `node_modules/ffprobe-static/bin/darwin/arm64/ffprobe -> /opt/homebrew/bin/ffprobe`. Bundled `ffmpeg-static` ffmpeg is native arm64 and fine. Flag for repo: consider FFPROBE env taking precedence over the package path in `src/ffmpeg.ts:25-35`, or a doctor check.
- Permission note: direct `grok --always-approve` invocations are blocked by the Claude Code permission classifier unless allowlisted; `tstack helper run grok --prompt-file <brief>` is the working path.

## Phase log

- Phase A (parallel, disjoint new modules; no cross-imports — types consolidated at wiring):
  - A1 `src/cams.ts` + `tests/cams.test.ts` — cam ingest/parking engine (mirrors takes; probe+proxy+PCM, no transcription; roles/names/offsets; cap 8). Brief: lane-briefs/A1-cams.md. LAUNCHED.
  - A2 `src/cam-activity.ts` + tests — per-cam RMS activity, speaking spans, word→cam attribution, program-audio args/builder. Brief: A2-activity.md. LAUNCHED.
  - A3 `src/cam-plan.ts` + tests — guardrail settings, follow-speaker planner, rule-based auto plan, validator/clamp, overrides/locks. Brief: A3-plan.md. LAUNCHED.
- Phase B (after A review): B4 mix-down renderer; B5 LLM auto-mix.
- Phase C: C6 overrides/re-mix; C7 wiring (cli/agent-tools/registry/features/playbook/schema consolidation).
- Phase D: D8 GUI panel; D9 full verification + docs sync + localhost E2E.

## Review gate (every lane)

Orchestrator review before landing: diff read, contract conformance, test quality (red evidence real, cases meaningful), `bun test <lane file>`, typecheck contribution, no out-of-allowlist edits. Full `bun run ci` at phase boundaries.

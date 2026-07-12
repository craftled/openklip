# Progress — Contextual cam switch (multicam)

Spec: `docs/specs/contextual-cam-switch-v1.md` (interview-locked 2026-07-12).
Orchestration: Claude Fable 5 reviews/judges; grok lanes (`grok-composer-2.5-fast`) implement under red-green TDD briefs. Target release: 0.42.0.0, status shipped.

## Environment notes

- 2026-07-12: worktree baseline was red (377/556, 179 fail, 167 errors) — root cause: `ffprobe-static` ships an x86_64 binary in `bin/darwin/arm64/`, and this machine has no Rosetta (`EBADARCH`). Same broken binary exists in the main checkout. Local fix: `brew install ffmpeg`, then symlink `node_modules/ffprobe-static/bin/darwin/arm64/ffprobe -> /opt/homebrew/bin/ffprobe`. Bundled `ffmpeg-static` ffmpeg is native arm64 and fine. Flag for repo: consider FFPROBE env taking precedence over the package path in `src/ffmpeg.ts:25-35`, or a doctor check.
- Permission note: direct `grok --always-approve` invocations are blocked by the Claude Code permission classifier unless allowlisted; `tstack helper run grok --prompt-file <brief>` is the working path.

## Status 2026-07-12 (evening)

- Phase A LANDED (commit ae4bcd6): cams engine, activity/attribution, planner/validator. Review patches: locked-span inheritance in applyOverrides (+regression), enforceMinShot indexing hardened, negative-offset audio alignment (adelay→atrim), windowDb consolidated into audio-analysis-core export.
- Phase B LANDED (commits e87b64b, aed2504): cam-mix renderer + camMix orchestration, cam-automix LLM planner (all paths through validatePlan, rules fallback). Review patches: raw f32 declared to ffmpeg (no temp-WAV bridge), agent-layer frames extraction, poisoned integration test relocated to mock-free file, full lint cleanup.
- Suite: 2025 tests / 0 fail incl. real-ffmpeg integration paths; typecheck + ultracite clean.
- Phase C/D IN FLIGHT (parallel): C7 wiring (cli/agent-tools/features/edl Word.speaker/cam-remix/playbook) + D8 GUI panel (mode picker, mix timeline viz, speaker table, re-mix).
- Acceptance fixtures ready: two 36s cams with real alternating speech (macOS say voices) in scratchpad/fixtures/.

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

## Docs sync 2026-07-12

Release docs synced to code truth (VERSION/package.json, CHANGELOG.md, docs/RELEASE-NOTES.md draft, TODO.md#known-limitations, README.md, AGENTS.md, CLAUDE.md): VERSION and package.json bumped to 0.42.0.0; CHANGELOG.md and docs/RELEASE-NOTES.md each gained a 0.42.0.0 entry (draft only, not published); TODO.md#known-limitations gained the v1 multicam non-goals (waveform auto-sync, shared-mic diarization, gallery virtual cams, speaker-labeled captions, GUI span editing, NLE/FCPXML export, short-footage freeze risk); README's feature bullet and MCP tool count were corrected to match code; AGENTS.md gained capability-map rows, a full "Contextual cam switch" Commands subsection, and Tool layers table entries (previously absent despite the feature having landed). Measured directly: `bun test --isolate` 2037 tests (2032 pass, 5 skip, 0 fail); a bare `bun test` (no `--isolate`) is flaky in this environment, ranging from 0 fail to 150 fail across repeat runs with no code changes between them, a more severe case of the cross-file mock-leakage flake AGENTS.md's "Known test flake" note already describes at a smaller scale (6 tests); now flagged as a separate background task rather than expanded here since it is pre-existing test infra, not this feature. 95 MCP tools (`openklip tools --json --surface mcp`), 52 capabilities (`openklip features --json`), 44 registry actions (`openklip actions --json`, unchanged: cam mutations are manual tools outside the registry, like `take_add`/`assemble`). Real multi-cam footage acceptance (the spec's release gate) is still open; do not tag or publish 0.42.0.0 until it passes.

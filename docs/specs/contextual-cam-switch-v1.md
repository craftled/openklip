# Contextual cam switch (multicam) — v1 spec

Decision record from the 2026-07-12 requirements interview. Benchmark: the
"Contextual cam switch" capability of Cutback Selects (https://cutback.video/selects).
Parity scope is this feature only — Cutback's surrounding product (NLE handoff,
auto-sync of 10+ cams, stringouts) is explicitly out of scope.

## Goal

A user drops N per-speaker camera files on OpenKlip, speakers are identified
automatically, and OpenKlip produces a professionally switched program — either
following the active speaker or via an "auto scene mix" that varies speaker
angles, reactions, and wide shots based on the conversation. The result is a
normal OpenKlip project: every existing feature (transcript editing, captions,
reframe, export) works on it unchanged.

## Decisions (all interview-confirmed)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Parity scope | This feature only; screenshot + Cutback Selects page define the bar |
| 2 | Operator | CLI/MCP core first, full GUI panel in the same release |
| 3 | Input model | N per-speaker video files, roughly synced; manual per-cam `--offset`; optional `wide` role cam; each cam carries its own speaker's mic; cap 2–8 cams |
| 4 | Speaker ID | Per-track voice activity: RMS energy windows (existing `audio-analysis-core`) compared across per-cam 16 kHz PCM; each transcript word attributed to the most active track. No ML/cloud diarization |
| 5 | Architecture | Mix-down stage modeled on multi-take assembly: cams parked like takes → switch plan → one ffmpeg pass renders `source.mp4` + `proxy.mp4` → normal project with `multicam` provenance. No exporter/preview changes |
| 6 | Wide shots | Real `wide`-role cam when provided; otherwise synthesize wide as a split-screen composite of speaker cams (side-by-side for 2, grid for 3–4) in the mix-down filtergraph |
| 7 | Program audio | Constant bed: loudness-align and mix ALL speaker mics (video switches never change audio). Optional user-supplied master-mix file overrides |
| 8 | Mix brain | `follow` mode = pure deterministic planner over activity. `auto` mode = LLM plan via existing agent-driver (`runAgentText`, scene-log pattern) over diarized transcript + activity timeline, then a deterministic validator clamps it (schema, min-shot, snapping). No agent available → degrade to follow + rule-based wides |
| 9 | Guardrails | Tunable settings block (like `cuts`) with defaults: `minShotMs: 2000`, `interjectionMs: 700` (backchannels never switch), `leadMs: 250` (J-cut: switch lands before first word), snap cuts to silence edges (existing VAD-snap), `maxShotMs: 25000` variety forcing (auto mode only) |
| 10 | Iteration | Switch plan is project data. v1: change mode/settings + regenerate; pin/override spans via MCP/CLI (`use cam2 1:03–1:20`); locked spans survive regeneration; any change = one re-encode pass |
| 11 | GUI scope | Full screenshot parity: mode picker (Follow speaker / Auto scene mix) with mix-timeline visualization, speaker table with editable name, role, cam thumbnail (from its proxy), per-cam audio audition. Click-to-edit spans in the mix bar is deferred |
| 12 | Naming | features.ts id `contextual-cam-switch`, title "Contextual cam switch". CLI: `cam-add` / `cams` / `cam-mix` / `cam-set`. MCP: `cam_add`, `list_cams`, `cam_mix`, `cam_override` |
| 13 | Release | 0.42.0.0, status **shipped** (not beta), single release. Consequence: real-footage acceptance is a release GATE |
| 14 | Non-goals (v1) | Waveform auto-sync; shared-mic diarization; gallery-recording virtual cams; speaker-labeled captions; GUI span editing; NLE/FCPXML plan export. All land in `TODO.md#known-limitations` |
| 15 | Acceptance | User provides a real multi-cam recording; eyeballing the plan + rendered mix on it gates the release. Synthetic fixtures prove machinery only |

## Pipeline

```
cam-add xN            per cam: probe + 720p proxy + 16k PCM  → cams/<id>/cam.json (role, name, offsetMs)
     │
cam-mix ──┬─ program audio: loudness-align + amix all mics (or master-mix file) → wav
          ├─ transcribe program wav once (existing Whisper path) → words
          ├─ per-cam activity timelines (RMS windows over each cam PCM)
          ├─ word → cam attribution (energy vote per word span; optional Word.speaker)
          ├─ plan: follow (deterministic) | auto (LLM → validator/clamp; fallback follow+rules)
          ├─ mix-down ffmpeg pass: per-span trim of chosen cam (+ xstack synthetic wide branch)
          │      + constant program audio → source.mp4 + proxy.mp4 (veryfast/crf20, assembly precedent)
          └─ write project.json: words (+speaker), multicam provenance {cams, plan, settings, mode}
     │
normal OpenKlip project → transcript editing / captions / reframe / export unchanged
     │
cam-set / cam_override → edit plan (mode, settings, locked spans) → re-mix (one encode pass)
```

## Data model

- `cams/<id>/` directory mirroring `takes/<id>/` (probe metadata, proxy, PCM, role, name, offset).
- `project.multicam` provenance block: cams registry, mode, settings, plan spans
  (`{fromSample, toSample, cam | "wide", locked?, reason?}`), plannedBy (heuristic | agent string), plannedAt.
- Optional `Word.speaker?: string` (cam id) — schema is passthrough; forward-compatible.
- Guardrail settings live in the multicam block, mirroring the `cuts`/`padMs` pattern.

## Surfaces

- CLI: `cam-add <slug> <video> [--role wide] [--name] [--offset s]`, `cams <slug>`,
  `cam-mix <slug> --mode follow|auto [--agent <model>]`, `cam-set` (settings/overrides/locks).
- MCP: `cam_add`, `list_cams`, `cam_mix`, `cam_override` (query-tool pattern like take_add/assemble);
  mode/settings mutations as registry actions.
- GUI: new Config panel section (takes-panel + audio-drawer patterns), server actions + routes
  per existing conventions.
- Playbook: `templates/cam-mix/skill.md` so the editing agent can run the flow end-to-end.
- `src/features.ts` entry with links (cli/tools/actions) so `tests/features.test.ts` parity holds.

## LLM auto-mix contract

Prompt: diarized transcript excerpt + per-speaker activity timeline + available shots
(cams + wide) + guardrail values. Response: JSON span list only. Validator: schema-check,
clamp min/max shot, snap to silence edges, drop unknown cams, fill gaps with follow-speaker,
respect locked spans. A canned-reply test suite covers malformed/degenerate agent output.

## Test plan

- Unit: attribution (energy vote), follow planner, validator/clamp, guardrail edges,
  synthetic-wide layout selection — pure functions, node:test.
- Integration (`OPENKLIP_INTEGRATION=1`): generated fixture cams (lavfi color+sine,
  seconds long) through cam-add → cam-mix → assert mixed source/proxy/provenance.
- Canned agent replies for auto-mix parse/validate path.
- GUI component tests per existing RTL/vitest conventions.
- Parity: features.test.ts links; docs sync (CHANGELOG, README, AGENTS.md capability map,
  TODO known-limitations).
- Acceptance gate: real multi-cam recording (provided by Tomas) — review plan + rendered mix
  before tagging 0.42.0.0.

## Implementation slices (reviewable order)

1. Cam ingest + parking (`cam-add`/`cams` engine, roles/names/offsets).
2. Activity + attribution (per-cam timelines, program-audio mix, one Whisper pass, word→cam).
3. Follow planner + settings block + validator/clamp (shared by both modes).
4. Mix-down renderer (filtergraph incl. synthetic wide; source/proxy/provenance; project finalize).
5. LLM auto-mix (prompt, agent-driver call, parse → validator; fallback).
6. Overrides + re-mix (`cam-set`, `cam_override`, locked spans).
7. CLI/MCP wiring, features.ts entry, playbook template.
8. GUI panel (speaker table, mode picker, mix viz, re-mix).
9. Docs sync + programmatic acceptance (`tests/multicam-acceptance.test.ts`, CI cam-mix integration) → release 0.42.0.0. Human eyeball on real per-speaker footage deferred until adoption.

## Open items

- Optional: human review on real per-speaker multi-cam recordings when available (not blocking publish).

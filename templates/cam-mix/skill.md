# Cam mix

Mix multiple speaker cams into one switched source: ingest each angle, run follow-speaker or LLM auto scene switching, review the plan, patch obvious misfires with locked overrides, and leave a normal project ready for cuts and export.

## Report progress

- This run has an active task the user is watching. Call task_step with a short title before each phase below (for example "Ingesting cams", "Running auto mix", "Reviewing plan").
- Finish with task_complete: outcome "completed" plus a one-line summary (cam count, mix mode, source path); "partial" with a remaining list when cams are missing or mix is not run; "blocked" with a question when fewer than two speaker cams are available.

## 1. Ingest cams

- Call list_cams. When empty, call cam_add once per provided video file (speaker cams first; add a wide cam when one exists).
- Use cam_set to fix display names, roles (`speaker` or `wide`), or offset ms when files start at different times.
- Require at least two speaker cams before mixing. One physical wide is optional; without it, auto wide uses a synthetic grid of speaker feeds.

## 2. Run the mix

- Call cam_mix with `mode: "auto"` and pass `agent` when the user wants LLM scene switching; use `mode: "follow"` for simple speaker-follow only.
- Optional flags: `masterMix` (external program audio), `minShotMs`, `maxShotMs`, `interjectionMs`, `leadMs`, `wide` (`auto` or `off`).
- Read the returned `timeline` string (same layout as `planTimelineSummary`) and `sourcePath`. Call project_status to confirm `multicam` provenance and kept runtime.

## 3. Review and override

- Scan the timeline for obvious misfires: wrong speaker on a line, a reaction held too long, or a missing wide during crosstalk.
- Call cam_override with `fromSec`, `toSec`, and `shot` (cam id or `wide`) to lock a manual span and re-render. Previously locked spans survive later overrides.
- Re-read `timeline` after each override. Stop when the plan matches intent or the user says the mix is good enough.

## 4. Hand off to normal editing

- The mixed `source.mp4` is now the project source; transcript words carry optional `speaker` cam ids from attribution.
- Continue with the usual edit loop: cleanup_report, cuts, overlays, brief_audit, export. Do not re-run cam_mix unless the user asks to change switching logic or add cams.
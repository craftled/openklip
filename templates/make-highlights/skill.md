# Make highlights

Find short-form clip candidates in a long edit, trim each span to a tight vertical short, and export with the `shorts` preset. Use when the source is much longer than one Reel/Short/TikTok and you want several standalone clips, not just one export of the whole kept runtime.

## Report progress

- This run has an active task the user is watching. Call task_step before each phase (for example "Detecting highlights", "Trimming clip h1", "Exporting short").
- Finish with task_complete: outcome "completed" with how many clips were exported; "partial" when detection ran but export is incomplete; "blocked" when highlight detection fails or the source has no usable transcript.

## 1. Understand the project

- Call project_status and brief_get. Note `keptDurationSec` and whether `highlights` already exists (`project_status` reports `highlights.clipCount` when present).
- If the brief names a target clip length (for example 30-60 seconds), pass that to detection via `--target-sec` on the CLI or match it when choosing which stored clips to export.
- Read transcript_grep for the opening hook only; never dump the full transcript.

## 2. Detect highlight candidates

- When `project.highlights` is missing or stale, run `openklip highlights-detect <slug>` (or ask the human to run it). Defaults: 5 clips, ~45s target length.
- Call highlights_list (MCP) or `openklip highlights <slug> --json` to read `clips[]`: each has `id` (`h1`, `h2`, …), `fromSec`, `toSec`, `title`, optional `reason` and `score`.
- Pick the best clip(s) for the user's request. Prefer high `score` and strong `title`/`reason` text. Skip overlapping spans unless the user asked for multiple variants.

## 3. Trim one clip at a time

For each clip you will export:

1. **Isolate the span**: cut everything outside `fromSec`-`toSec` using word ids from transcript_span around those times, or cut-text for obvious bookend phrases. Cut whole sentences, not lone words.
2. **Tighten pacing**: run cleanup_report and apply safe candidates inside the span if filler remains.
3. **Reframe**: on macOS, `openklip vision-focus <slug>` then `export-set` with `aspect: "9:16"` and `cropMode: "scene"` when a sceneLog exists; otherwise `cropMode: "vision"` on macOS or `manual` with a small focus patch.
4. **Export**: `openklip export <slug> --platform shorts` (or the export MCP tool with `platform: "shorts"`).
5. **Verify**: call verify; fix and re-export once if drift is reported.

Rename or copy `output/out.mp4` before exporting the next clip if the user needs multiple files kept (OpenKlip overwrites `output/out.mp4` each export).

## 4. Restore for the next clip (multi-clip runs)

- After exporting one highlight, revert to the pre-trim state (`openklip revert --last` or `--task`) before trimming the next candidate, unless the user wants a cumulative edit.
- Alternatively, work from a copy of the project folder when exporting several finals in one session.

## 5. Complete

- In task_complete, list which highlight ids were exported, their titles, final runtimes, and output paths.
- If only detection ran, say so and list the stored candidates for human approval.

# Make a short

Derive a vertical short from an existing edit: trim to a tight runtime if needed, set 9:16 aspect with a manual reframe on the subject, export with the `shorts` platform preset, and verify.

## Report progress

- This run has an active task the user is watching. Call task_step with a short title before each phase below (for example "Checking runtime", "Setting 9:16 reframe", "Exporting for Shorts").
- Finish with task_complete: outcome "completed" plus a one-line summary (runtime, aspect, export path); "partial" with a remaining list when reframe or export is left undone; "blocked" with a question when the source is already vertical-native or the kept runtime is far above the brief's target.

## 1. Understand the project

- Call project_status, then brief_get. When a brief names a short-form target (for example 30 to 60 seconds, TikTok, Reels, Shorts), treat that as the length and format goal. Otherwise aim for roughly 30 to 90 seconds of kept runtime unless the user named a different cap.
- Read `export` from project_status (aspect and crop defaults). Use transcript_grep or transcript_span to see what the opening hook is; never dump the whole transcript.
- If `keptDurationSec` is already within the target and the edit is essentially final, skip cutting and go straight to reframe + export.

## 2. Trim for short-form (when needed)

- When kept runtime is well above the target, cut weakest material first: tangents, repeated points, long intros, and filler with cut-text (whole phrases, not lone words mid-sentence).
- Call cleanup_report and apply only its `safe` candidates unless the brief says aggressive. Leave `review` candidates to the human.
- Re-check project_status after cuts. Stop trimming once kept runtime is inside the target band or further cuts would remove must-keep lines from the brief.

## 3. Set vertical aspect and reframe

- Call export-set with `aspect: "9:16"` so preview and export share the same frame. Default crop (focus 0.5 / 0.5, scale 1) centers a landscape talking-head; adjust only when the speaker is clearly off-center or too small in frame.
- Patch crop with export-set when needed: raise `scale` slightly (1.1 to 1.4) to tighten on the speaker, or shift `focusX` / `focusY` (0 to 1) to keep the face in frame. Make one small adjustment at a time; re-read project_status after each change.
- Keep captions on unless the brief says otherwise. Captions burn in for vertical export; there is no per-platform safe-area model yet, so avoid placing a hero title in the bottom third when captions are on.

## 4. Export for Shorts

- Export with the `shorts` platform preset (`platform: "shorts"` on the export tool, or `openklip export <slug> --platform shorts` from the terminal). That fills 9:16 aspect, 30fps, 1920 height cap, social compression, and -14 LUFS for this invocation only.
- Do not mutate `project.audio.loudness` for platform loudness; the preset applies normalization at export time.
- If the user asked for a one-off different aspect or crop for this render only, pass `aspect` / `crop` on the export call instead of changing project.export.

## 5. Verify

- Call verify. If it reports drift (surviving filler, leaked cuts, low coverage), fix the cause and export once more before completing.
- In task_complete, report kept runtime, the active aspect/crop, and that `output/out.mp4` was rendered for Shorts.

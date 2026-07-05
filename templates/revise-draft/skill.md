# Revise a draft

Change an existing draft on request: read what is already there, apply only what was asked, verify, and report what changed against what was asked for.

## Report progress

- This run has an active task the user is watching. Call task_step with a short title before each phase below (for example "Reading current draft", "Applying requested edits", "Re-exporting").
- Finish with task_complete: outcome "completed" plus a one-line summary of what changed; "partial" with a remaining list when part of the request could not be done; "blocked" with a question when a revert would also discard other wanted work, or the request is ambiguous about what to change.

## 1. Understand the current draft and the request

- Call project_status, then brief_get. The brief's audience, goal, tone, must-use assets, and avoid list still apply to any new edit; do not relax them just because this is a revision.
- Call project_overlays for the ids of the titles, zooms, b-roll, stills, music placements, and graphics already on the timeline, so targeted patches have something to patch. Use transcript_grep or transcript_span to find the phrases the user is referring to.
- If this same conversation ran the task that produced the current draft, its id came back in that task's task_complete result, reuse it from context. Otherwise call task_list to find candidate task ids by request text and recency, then history_list with `task` set to that id to confirm which revisions it touched and whether `snapshotRevisions` covers them (a revert only works on a revision with a snapshot). If you still cannot identify which task produced the draft and the request needs a revert, ask instead of guessing (task_complete outcome "blocked").

## 2. Classify the request

- **Targeted edit**: change a title's text, a zoom's span or scale, a music bed's gain, a graphic's params or span, cut a few more words on a named phrase, or restore a few that were cut. Apply the specific mutation only; do not touch anything the user did not mention.
- **Whole-task undo**: "undo that", "go back to before the b-roll", "redo the whole cut". Use revert with the prior task's id, and only when you are confident which task id produced the part the user wants gone.
- **Convert to short**: user asks for Shorts, Reels, TikTok, vertical, or 9:16 without requesting a full redo of the draft. Do NOT revert; follow the convert-to-short path in section 3b only.
- **Out of scope**: brief.md content or swapping media files. Say so in task_complete rather than attempting it; brief_set and asset registration are separate flows this playbook does not drive.

## 3. Targeted edits

- Cuts: cut-text to remove more of a phrase, or cut with `deleted: false` on specific word ids (from transcript_grep or transcript_span) to restore words that were cut.
- Titles: title-set with the overlay id and only the changed fields (text, position, span).
- Zooms: zoom-set with the overlay id and only the changed fields (scale, rampSec, span).
- B-roll or stills: broll-set or still-set with the overlay id and only the changed fields.
- Music: music-set with the placement id for gain or fade changes; music-add only if no bed exists yet. Keep ducking on (audio {"ducking": {"enabled": true}}) unless the user asks to turn it off.
- Graphics: graphic-set with the overlay id for template, span, params (`text`, `inDurFrames`, `staggerFrames`), or keyframes; graphic-rm to remove. Phrase-anchored graphics re-snap after cuts automatically; call reanchor manually only when the transcript changed out of band.
- Captions or look flags: captions, captions-max, look-vignette, and similar direct actions, called only for what was asked.

## 3b. Convert to short

Use this path when the classify step lands on **Convert to short**. Do not revert the draft or remove overlays unless the user separately asked to trim runtime or remove specific overlays.

- Call export-set with `aspect: "9:16"` to set the vertical frame for both preview and export. Default crop (focusX 0.5, focusY 0.5, scale 1) centers a standard talking-head; adjust only when the speaker is visibly off-center or too small.
- Patch crop with export-set when needed: raise `scale` slightly (1.1 to 1.4) to tighten on the speaker, or shift `focusX` / `focusY` (0 to 1) to keep the face in frame. One small adjustment at a time; re-read project_status after each change.
- Keep captions on unless the brief or user says otherwise. Captions burn in for vertical export; avoid placing a hero title in the bottom third when captions are on.
- Export with the `shorts` platform preset (`platform: "shorts"` on the export tool). That fills 9:16 aspect, 30fps, 1920 height cap, social compression, and -14 LUFS for this invocation only. Do not mutate `project.audio.loudness`.
- Call brief_audit when a brief exists. Fix any reported issues before exporting.
- Call verify. If it reports drift, fix and export once more.
- In task_complete, report that aspect was set to 9:16, the crop used, and that `output/out.mp4` was rendered for Shorts. Name any overlays or cuts that were left untouched because the user did not ask to change them.

## 4. Whole-task revert

- Never pass `force` on your own judgment. If revert reports that an interloper action from another task or actor would also be discarded, stop and ask via task_complete outcome "blocked" instead of forcing through it, unless the user's request clearly covers discarding that other change too.
- If the prior task also made changes the user wants to keep, prefer targeted inverse edits (title-rm, zoom-rm, broll-rm, still-rm, music-rm, graphic-rm, or cut with `deleted: false`) over a whole-task revert.
- After any revert, call project_status again before making further edits; the project state changed under you and any ids or spans you read earlier may no longer apply.
- Revert restores project.json only, not brief.md or media, and export output is not restored either. Re-export after a revert if the user needs the rendered file to match.

## 5. Verify and export

- Call brief_audit when a brief exists. Fix any reported issues before exporting.
- Call verify. If it reports drift (surviving filler, leaked cuts, low coverage), fix the cause and export once more before completing.
- Export only if the change affects the rendered output and the user needs a fresh file, or the brief names a platform preset to apply.
- In task_complete, name specifically what changed (and what, if anything, was left alone or declined) rather than repeating the full draft.

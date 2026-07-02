# Revise a draft

Change an existing draft on request: read what is already there, apply only what was asked, verify, and report what changed against what was asked for.

## Report progress

- This run has an active task the user is watching. Call task_step with a short title before each phase below (for example "Reading current draft", "Applying requested edits", "Re-exporting").
- Finish with task_complete: outcome "completed" plus a one-line summary of what changed; "partial" with a remaining list when part of the request could not be done; "blocked" with a question when a revert would also discard other wanted work, or the request is ambiguous about what to change.

## 1. Understand the current draft and the request

- Call project_status, then brief_get. The brief's audience, goal, tone, must-use assets, and avoid list still apply to any new edit; do not relax them just because this is a revision.
- Call project_overlays for the ids of the titles, zooms, b-roll, stills, and music placements already on the timeline, so targeted patches have something to patch. Use transcript_grep or transcript_span to find the phrases the user is referring to.
- There is no MCP tool that reads the action history log today; only the GUI History panel (`/api/projects/<slug>/history`) and `openklip revert` itself touch it. If this same conversation ran the task that produced the current draft, its id came back in that task's task_complete result, reuse it from context. If you cannot identify which task produced the draft and the request needs a revert, ask instead of guessing (task_complete outcome "blocked").

## 2. Classify the request

- **Targeted edit**: change a title's text, a zoom's span or scale, a music bed's gain, cut a few more words on a named phrase, or restore a few that were cut. Apply the specific mutation only; do not touch anything the user did not mention.
- **Whole-task undo**: "undo that", "go back to before the b-roll", "redo the whole cut". Use revert with the prior task's id, and only when you are confident which task id produced the part the user wants gone.
- **Out of scope**: brief.md content or swapping media files. Say so in task_complete rather than attempting it; brief_set and asset registration are separate flows this playbook does not drive.

## 3. Targeted edits

- Cuts: cut-text to remove more of a phrase, or cut with `deleted: false` on specific word ids (from transcript_grep or transcript_span) to restore words that were cut.
- Titles: title-set with the overlay id and only the changed fields (text, position, span).
- Zooms: zoom-set with the overlay id and only the changed fields (scale, rampSec, span).
- B-roll or stills: broll-set or still-set with the overlay id and only the changed fields.
- Music: music-set with the placement id for gain or fade changes; music-add only if no bed exists yet. Keep ducking on (audio {"ducking": {"enabled": true}}) unless the user asks to turn it off.
- Captions or look flags: captions, captions-max, look-vignette, and similar direct actions, called only for what was asked.

## 4. Whole-task revert

- Never pass `force` on your own judgment. If revert reports that an interloper action from another task or actor would also be discarded, stop and ask via task_complete outcome "blocked" instead of forcing through it, unless the user's request clearly covers discarding that other change too.
- If the prior task also made changes the user wants to keep, prefer targeted inverse edits (title-rm, zoom-rm, broll-rm, still-rm, music-rm, or cut with `deleted: false`) over a whole-task revert.
- After any revert, call project_status again before making further edits; the project state changed under you and any ids or spans you read earlier may no longer apply.
- Revert restores project.json only, not brief.md or media, and export output is not restored either. Re-export after a revert if the user needs the rendered file to match.

## 5. Verify and export

- Call verify. If it reports drift (surviving filler, leaked cuts, low coverage), fix the cause and export once more before completing.
- Export only if the change affects the rendered output and the user needs a fresh file, or the brief names a platform preset to apply.
- In task_complete, name specifically what changed (and what, if anything, was left alone or declined) rather than repeating the full draft.

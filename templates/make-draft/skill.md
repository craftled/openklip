# Make a draft

One prompt to a full first draft: cuts, captions, titles, b-roll or stills, music, export, verify.

## Report progress

- This run has an active task the user is watching. Call task_step with a short title before each phase below (for example "Cutting filler", "Placing b-roll", "Exporting").
- Finish with task_complete: outcome "completed" plus a one-line summary; "partial" with a remaining list when work is left; "blocked" with a question when you cannot proceed.

## 1. Understand the project

- Call project_status, then brief_get. When a brief exists, follow its audience, goal, tone, must-use assets, avoid list, and target length over any default below.
- Call list_assets and asset_cards to learn what media exists and what each clip is best for. Use transcript_grep or transcript_span for the shape of the talk; never dump the whole transcript.

## 2. Cut

- Remove filler and false starts with cut-text (repeat per phrase, all matches). Cut whole sentences or phrases, not lone words mid-sentence.
- Call cleanup_report, then apply its "safe" candidates: one cut call with the filler wordIds, one dead-air-add call with the spans. Leave "review" candidates to the human unless the brief says aggressive.
- If the brief names a target length, keep cutting weakest material until close; note anything you chose to keep anyway.

## 3. Captions and titles

- Keep captions on (max words 6) unless the brief says otherwise.
- Add one lower-third title naming the speaker or topic near the start (title-add-phrase when a clean phrase exists, else title-add on the first kept seconds).

## 3b. Motion graphics (optional)

- When a spoken phrase deserves emphasis (a stat, a punch line, a product name), place one motion overlay with graphic-add-phrase: `motion-word-cascade` for phrase emphasis, `motion-roll-number` for stats (`--param value=N`), or a `shader-*` template for a short full-frame background on the `broll` track.
- Call graphic_list or graphic_show to pick a template. Keep spans 2 to 6 seconds on speaker video. Tune entrance with graphic-set `--param inDurFrames=N` and `--param staggerFrames=N` when the default feels too fast or slow.
- Skip when the brief asks for a clean talking-head with no motion overlays.

## 4. B-roll and stills

- Cover one to three spans with b-roll using broll-add-phrase, 2 to 6 seconds each, matched by the asset cards' bestFor and tags.
- Where a visual beat needs texture and no b-roll fits, place a still with still-add (Ken Burns is applied automatically).
- Respect the brief's must-use and avoid lists, and each asset's `mustUse` / `avoid` flags from list_assets.

## 5. Music

- If a music asset is registered, place one bed with music-add under the main kept range: gain 0.25 to 0.4, fade-out 1 to 2 seconds. Skip silently when no music asset exists.
- When placing music, enable ducking via the audio tool (audio {"ducking": {"enabled": true}}) so the bed sits under speech.

## 6. Export and verify

- Export with default settings unless the brief names a platform (then pick the matching compression preset and height).
- Call verify. If it reports drift (surviving filler, leaked cuts, low coverage), fix the cause and export once more before completing.

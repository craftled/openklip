# Talking head

Short-form solo video: cut filler and warm-ups, add a name lower third, light push-in zooms on emphasis, optional b-roll covers. Captions stay on.

## Before you edit

```bash
openklip transcript <slug>
openklip status <slug>
openklip assets <slug>    # if you will add b-roll
```

Read the transcript first. Cut whole sentences or phrases, not lone words mid-thought.

## Cuts

1. Remove filler runs: `openklip cut <slug> --text "um" --all`, same for `uh`, `you know`, `sort of`, `kind of`, `I mean`.
2. Remove personalized warm-ups: `openklip cut <slug> --text "Hey"` only when it is a standalone intro before the real hook (grep context in transcript).
3. Remove false starts and repeated takes of the same sentence (mark the weaker run deleted via word ids or `--text`).
4. After cuts: `openklip status <slug>` and confirm runtime is not empty.

## Look

- Captions: on (default). `openklip captions-max <slug> 6` unless the project already sets another line length.
- Vignette: optional `openklip look <slug> vignette on` for a tighter frame.
- Pad: `openklip pad <slug> 50` (default) for clean cut boundaries.

## Motion

- Push-in zoom on emphasis spans (roughly 2–6 seconds): `openklip zoom-add <slug> <fromSec> <toSec> --scale 1.15 --ramp 0.6`.
- Do not stack zooms back-to-back; leave breathing room between them.

## Titles

- Name lower third after the speaker finishes the first complete intro sentence (use transcript times):
  `openklip title-add <slug> <fromSec> <toSec> "Name\nRole" --position lower`
- Hero card only for a single strong hook line under 8 words.

## B-roll

- Register clips first: `openklip broll <slug> <file>` then `openklip assets <slug>`.
- Covers should be 2–6 seconds: `openklip broll-add <slug> <assetId> <fromSec> <toSec>`.
- B-roll replaces video only; speaker audio continues underneath.

## Music

- Drop background music into `assets/` and sync. Ducking is manual today: keep music subtle and avoid covering the spine until mix automation lands.

## Verify and export

- Call brief_audit when a brief exists. Fix any reported issues before exporting.
- Export only when the edit is ready to ship.

```bash
openklip status <slug>
openklip export <slug>
```

Reload the browser after CLI edits. Prefer one writer at a time (CLI or GUI server).

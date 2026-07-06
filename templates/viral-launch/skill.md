---
description: Scroll-stopping launch edit for social feeds (hook first, plain problem, strongest outcome)
label: Viral launch
---

# Viral launch

Earned-attention edit for X, Shorts, Reels, or LinkedIn: no warm-up, claim in the first seconds, problem spelled out in plain language, export with a platform preset.

## Before you edit

```
openklip status <slug> --json
openklip brief_get
openklip transcript grep <slug> "hook phrase"
```

When no brief exists, ask for or draft: **audience**, **enemy** (what you are against), **boldest true claim**, **strongest outcome** (status or money beats time saved), and **one-sentence hook** someone could repeat.

## 1. Hook and cut

- Cut everything before the first strong claim or tension. No logo stings, no "we are excited to announce."
- `openklip cut <slug> --text "filler" --all` and `openklip cleanup <slug> --apply-safe` for safe filler and dead air.
- Whole phrases or sentences only. The first kept words should be the claim or the problem, not category fluff ("smartest AI X").

## 2. Context, then product

- First 10 seconds: problem → what it costs → what you built. If a stranger would not follow, add a title or motion line that bridges the gap.
- Name the product only after the problem lands.

## 3. Dopamine early

- Put the wildest visual in the first 2-3 seconds: `graphic-add-phrase` with `motion-word-cascade`, `motion-highlight-pop`, or short b-roll (`broll-add-phrase`, 2-6s). Do not save the payoff for late in the clip.
- One push-in zoom on the speaker around the claim is enough; skip cinematic build.

## 4. Outcome on screen

- Lead with the top outcome, not a feature list. Use `title-add-phrase` or `json-graphic-add` (`product-announcement`) for one proof frame (stat, snippet, three bullets max).
- Captions on unless the brief says otherwise.

## 5. Export

```
openklip brief_audit
openklip export <slug> --platform x
```

Use `--platform shorts` for vertical; `export-set --aspect 9:16` first when reframing. Call `verify` after export.

## 6. Repurpose (optional)

```
openklip highlights-detect <slug>
openklip export-highlight <slug> all --platform shorts
```

Clip follow-ups from the same source; do not re-edit from scratch.

---
name: openklip-editing
description: Talking-head edit loop with OpenKlip cuts, zooms, titles, and export
---

# Talking head editing

Short-form solo video: cut filler and warm-ups, add lower thirds, push-in zooms, optional b-roll. Captions stay on.

Requires the OpenKlip CLI or MCP server.

## Before you edit

```
openklip transcript grep <slug> "phrase"
openklip status <slug> --json
```

Cut whole sentences or phrases, not lone words mid-thought.

## Cuts

```
openklip cut <slug> --text "um" --all
openklip cleanup <slug> --apply-safe
openklip status <slug>
```

## Motion

```
openklip zoom-add-phrase <slug> "key phrase" --scale 1.15
openklip title-add-phrase <slug> "intro line" "Your Name"
openklip graphic-add-phrase <slug> motion-word-cascade "emphasis phrase"
```

## Export

```
openklip export <slug>
openklip verify <slug>
```

Revert mistakes: `openklip revert <slug> --last` or MCP `revert`.

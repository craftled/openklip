---
description: Place and tune motion text and shader overlays on the timeline
label: Motion graphics
---

# Motion graphics

Use bundled `graphics/motion-*` and `graphics/shader-*` templates as timeline overlays on existing footage.

## Discover templates

```
openklip graphic list
openklip graphic show motion-word-cascade
```

MCP: `graphic_list`, `graphic_show`.

## Place on a spoken phrase

```
openklip graphic-add-phrase <slug> motion-word-cascade "exact spoken phrase"
openklip graphic-add-phrase <slug> motion-roll-number "ten thousand users" --param value=10000
```

MCP: `graphic-add-phrase`. Span equals the matched phrase (min 2s). For `motion-word-cascade` and `motion-highlight-pop`, `text` auto-fills from the transcript when omitted.

## Place by seconds

```
openklip graphic-add <slug> shader-mesh-gradient 0 6 --track broll
openklip graphic-add <slug> motion-typewriter 2 5 --param text="Ship it"
```

Keep overlays on speaker video roughly 2-6 seconds. Full-frame shaders can cover longer spans on the `broll` track.

## Tune timing and content

```
openklip graphic-set <slug> g1 --param inDurFrames=12 --param staggerFrames=4
openklip graphic-set <slug> g1 --param text="New headline"
openklip graphic-add-phrase <slug> motion-word-cascade "hook line" --beats 4 --music-asset m1
```

- **Beat spans**: `--beats N` with `--bpm` or `--music-asset` (run `openklip bpm` first). MCP: `music_bpm`, then `graphic-add` / `graphic-add-phrase` with `beats` + `musicAssetId`. GUI Graphics picker: **By beats** mode with BPM detect.
- **Timing params** (`inDurFrames`, `staggerFrames`): internal build animation on elements with `data-timing-bind` in the template. Phrase spans auto-extend when the entrance animation needs more room. Phrase placement auto-sets `staggerFrames` from kept word ids when omitted.
- **Keyframes** (`graphic-set --keyframes-file`): whole-overlay opacity/scale/x/y wrapper transforms.

## Template guide

| Template | Use for |
| --- | --- |
| `motion-word-cascade` | Emphasis on a spoken phrase (word-by-word reveal) |
| `motion-highlight-pop` | Two-part headline with highlighted word |
| `motion-roll-number` | Stats (`value`, `prefix`, `suffix` params) |
| `motion-typewriter` | Monospace typewriter line |
| `motion-kinetic-build` | Bold kinetic word build |
| `motion-blur-reveal` | Short punchy line (keep text under ~24 chars for preview perf) |
| `shader-*` | Full-frame animated backgrounds |

Rich templates need `chrome-headless-shell` for export (`bunx puppeteer browsers install chrome-headless-shell`).

## Revise or remove

```
openklip graphic-set <slug> <graphicId> ...
openklip graphic-rm <slug> <graphicId>
```

Phrase-anchored graphics re-snap after cuts via `openklip reanchor` (automatic after word deletions).

## Authoring new templates

See `graphics/AUTHORING.md`. Drop a folder under repo `graphics/<id>/` with `manifest.json` + `composition.html`.

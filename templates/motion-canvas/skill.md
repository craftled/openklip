---
description: Blank-canvas motion design from shader backgrounds through export
label: Motion canvas
---

# Motion canvas

Build a motion piece from scratch with no camera footage: blank ingest, full-frame shaders, motion overlays, and export.

## Start blank

```
openklip ingest --blank --slug my-piece --duration 30 --aspect 16:9
openklip template set my-piece motion-canvas
```

MCP: `blank_ingest`, then `template set` with id `motion-canvas`.

GUI: **New project → Blank canvas…**

## Layer the timeline

1. **Full-frame shader bed** on the `broll` track (covers the whole canvas):

```
openklip graphic-add my-piece shader-mesh-gradient 0 30 --track broll
openklip graphic-add my-piece shader-grain-gradient 0 15 --track broll --param speed=0.6
```

2. **Motion text** (headlines, stats, kinetic builds):

```
openklip graphic-add my-piece motion-kinetic-build 2 6 --param text="Launch day"
openklip graphic-add my-piece motion-roll-number 8 12 --param value=10000 --param suffix="+"
```

3. **Logo or still treatments** (optional image shaders):

```
openklip asset-add my-piece assets/logo.png --kind still
openklip graphic-add my-piece shader-liquid-metal 4 10 --track broll --param assetId=s1
openklip graphic-add my-piece shader-gem-smoke 12 18 --track broll --param assetId=s1
```

4. **Cut transitions** when you splice kept ranges (jump-cut edits on blank canvas with a transcript, or after assembling takes):

```
openklip graphic-add-cuts my-piece transition-flash
openklip graphic-add-cuts my-piece transition-dip --duration 0.5
```

MCP: `graphic-add-cuts`.

## Beat-synced spans (with music)

```
openklip asset-add my-piece assets/beat.mp3 --kind music
openklip music-add my-piece m1 0 30
openklip bpm my-piece m1
openklip graphic-add my-piece shader-dot-orbit 0 0 --track broll --beats 8 --music-asset m1
openklip graphic-add my-piece motion-word-cascade 0 0 --param text="Feel the beat" --beats 4 --music-asset m1
```

MCP: `music_bpm`, then `graphic-add` with `beats` + `musicAssetId`.

## Tune and export

```
openklip graphic-set my-piece g1 --param inDurFrames=12 --param staggerFrames=4
openklip motion my-piece --speed 1.2
openklip export my-piece --platform youtube
openklip verify my-piece
```

Blank canvas with no words skips transcript verify drift checks.

## Project-local templates

Drop custom HTML/CSS templates under `projects/<slug>/graphics/<id>/` (see `graphics/AUTHORING.md`). They appear in `openklip graphic list --slug <slug>` and the GUI Graphics picker under **Project-local**.

## Discover templates

```
openklip graphic list --slug my-piece
openklip graphic show shader-mesh-gradient
```

MCP: `graphic_list`, `graphic_show`.

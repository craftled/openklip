---
name: openklip-motion-canvas
description: Blank-canvas motion design with OpenKlip shaders, motion overlays, and export
---

# Motion canvas

Build a motion piece from scratch with no camera footage: blank ingest, full-frame shaders, motion overlays, and export.

Requires the OpenKlip CLI or MCP server (`openklip mcp`).

## Start blank

```
openklip ingest --blank --slug my-piece --duration 30 --aspect 16:9
openklip template set my-piece motion-canvas
```

MCP: `blank_ingest`, then `template set` with id `motion-canvas`.

## Layer the timeline

1. Full-frame shader bed on `broll`:

```
openklip graphic-add my-piece shader-mesh-gradient 0 30 --track broll
```

2. Motion text:

```
openklip graphic-add my-piece motion-kinetic-build 2 6 --param text="Launch day"
```

3. Optional logo shaders:

```
openklip asset-add my-piece assets/logo.png --kind still
openklip graphic-add my-piece shader-liquid-metal 4 10 --track broll --param assetId=s1
```

4. Cut transitions at jump-cut seams:

```
openklip graphic-add-cuts my-piece transition-flash
```

MCP: `graphic-add-cuts`.

## Beat-synced spans

```
openklip bpm my-piece m1
openklip graphic-add my-piece shader-dot-orbit 0 0 --track broll --beats 8 --music-asset m1
```

## Export

```
openklip export my-piece --platform youtube
openklip verify my-piece
```

Discover templates: `openklip graphic list --slug my-piece` or MCP `graphic_list`.

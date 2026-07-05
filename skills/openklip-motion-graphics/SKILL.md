---
name: openklip-motion-graphics
description: Place and tune motion text and shader overlays on an OpenKlip timeline
---

# Motion graphics

Use bundled `graphics/motion-*` and `graphics/shader-*` templates as timeline overlays on existing footage.

Requires the OpenKlip CLI or MCP server.

## Discover templates

```
openklip graphic list
openklip graphic show motion-word-cascade
```

MCP: `graphic_list`, `graphic_show`.

## Place on a spoken phrase

```
openklip graphic-add-phrase <slug> motion-word-cascade "exact spoken phrase"
```

Phrase placement auto-fills kinetic `text` and per-word `staggerFrames` from kept word ids.

## Beat spans

```
openklip bpm <slug> m1
openklip graphic-add-phrase <slug> motion-word-cascade "hook line" --beats 4 --music-asset m1
```

MCP: `music_bpm`, then `graphic-add` / `graphic-add-phrase` with `beats` + `musicAssetId`.

## Cut transitions

```
openklip graphic-add-cuts <slug> transition-flash
```

Places a transition-* overlay centered on every kept-range seam.

## Export

```
openklip export <slug>
openklip verify <slug>
```

See `graphics/AUTHORING.md` to add custom templates under `graphics/<id>/`.

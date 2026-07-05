---
name: openklip-motion-shorts
description: Beat-synced motion short recipe using OpenKlip music BPM and motion templates
---

# Motion shorts

Sequence motion graphics and shader backgrounds for vertical or horizontal shorts with a music bed.

Requires the OpenKlip CLI or MCP server.

## Prerequisites

- Music asset: `openklip asset-add <slug> track.mp3 --kind music`
- Cached tempo: `openklip bpm <slug> <assetId>`

MCP: `music_bpm`.

## Recipe: hook, stat, outro

```
openklip graphic-add <slug> shader-mesh-gradient 0 0 --track broll --beats 8 --music-asset m1
openklip graphic-add-phrase <slug> motion-word-cascade "your hook line" --beats 4 --music-asset m1
openklip graphic-add-phrase <slug> motion-roll-number "ten thousand users" --param value=10000 --beats 2 --music-asset m1
```

GUI: Graphics picker supports **By beats** span mode with BPM detect.

## Export

```
openklip audio measure <slug> --json
openklip export <slug> --platform shorts
openklip verify <slug>
```

MCP: `audio_measure`, `export` with `platform: "shorts"`.

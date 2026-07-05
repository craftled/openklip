---
description: Beat-synced motion short recipe using music BPM and motion templates
label: Motion shorts
---

# Motion shorts

Sequence motion graphics and shader backgrounds for vertical or horizontal shorts with a music bed. Local-only: no cloud APIs.

## Prerequisites

- A music asset in `assets/` registered with `openklip asset-add <slug> track.mp3 --kind music`
- Optional: `openklip bpm <slug> <assetId>` to cache tempo in `working/music-bpm.json`

MCP: `music_bpm`.

## Detect tempo

```
openklip bpm <slug> m1
openklip bpm <slug> m1 --json
```

Use the cached BPM for beat-snapped overlay spans.

## Recipe: hook → stat → outro

Typical 30-45s short with one music bed:

1. **Full-frame shader background** for the opening 8 beats:

```
openklip graphic-add <slug> shader-mesh-gradient 0 0 --track broll --beats 8 --music-asset m1
openklip graphic-set <slug> g1 --from 0 --to <computed>
```

Or place by seconds after reading BPM: `duration = beats * 60 / bpm`.

2. **Word cascade on the hook phrase**:

```
openklip graphic-add-phrase <slug> motion-word-cascade "your hook line" --beats 4 --music-asset m1
```

3. **Roll number on the stat**:

```
openklip graphic-add-phrase <slug> motion-roll-number "ten thousand users" --param value=10000 --beats 2 --music-asset m1
```

4. **Highlight pop on the CTA**:

```
openklip graphic-add-phrase <slug> motion-highlight-pop "sign up today" --beats 4 --music-asset m1
```

MCP: `graphic-add-phrase` and `graphic-add` accept `beats`, `bpm`, and `musicAssetId`.

## Tune and verify

```
openklip graphic-set <slug> g2 --param inDurFrames=10 --param staggerFrames=3
openklip audio measure <slug> --json
openklip brief <slug> --audit
openklip export <slug> --platform shorts
openklip verify <slug>
```

- Call `brief_audit` when a brief exists. Fix any reported issues before exporting.

`audio measure` reads LUFS from the latest export (or proxy before first export). MCP: `audio_measure`.

## External generative B-roll (optional)

Generate stylized clips with any external tool (e.g. [Egaki](https://github.com/remorses/egaki), Runway, Kling). Drop the file into `assets/`, register it, then:

```
openklip broll <slug> assets/generated.mp4
openklip broll-add-phrase <slug> b1 "spoken phrase"
```

OpenKlip edits and composites; it does not bundle cloud generation APIs.

## Remove or revise

```
openklip graphic-rm <slug> <graphicId>
openklip reanchor <slug>
```

Phrase-anchored graphics re-snap after cuts automatically.

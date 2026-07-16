# Acceptance corpus manifest schema

`scripts/acceptance-corpus.ts` writes `fixtures/acceptance/manifest.json` on
every `generateAcceptanceCorpus()` call (gitignored: see
`docs/acceptance-corpus.md`). This documents its shape so the manifest can be
read by tooling other than `scripts/acceptance-gate.ts` without re-deriving
the schema from source.

```jsonc
{
  "corpusDir": "/abs/path/to/fixtures/acceptance",
  "generatedAt": "2026-07-16T00:00:00.000Z",
  "fixtures": [
    {
      "id": "sdr-h264-1080p",
      "description": "Standard SDR H.264 1080p + AAC audio (baseline talking-head stand-in)",
      "relPath": "sdr-h264-1080p.mp4",
      "userProvided": false,
      "generator": {
        "ffmpegArgs": ["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=4", "..."]
      },
      "expected": {
        "container": "mp4",
        "videoCodec": "h264",
        "audioCodec": "aac",
        "pixFmt": "yuv420p",
        "width": 1920,
        "height": 1080,
        "approxDurationSec": 4,
        "fps": 30,
        "vfr": false,
        "hasAudio": true
      },
      "path": "/abs/path/to/fixtures/acceptance/sdr-h264-1080p.mp4",
      "present": true
    }
    // ...one entry per fixture in ACCEPTANCE_FIXTURE_SPECS, including the
    // "talking-head-real" user-provisioned slot (userProvided: true,
    // generator: undefined, present: false unless the file was dropped in).
  ]
}
```

## Field notes

- **`generator`** is present only for auto-generated fixtures; it is the
  exact ffmpeg argv (minus `-y` and the trailing output path, which
  `scripts/acceptance-corpus.ts` adds) used to produce the file, so the
  recipe is reproducible by hand outside the script if needed.
- **`expected`** is the fixture's *nominal, generation-time* target. It is
  informational and (for the generated fixtures) self-checked once right
  after generation - see `assertGeneratedFixtureMatches` in
  `scripts/acceptance-corpus.ts`, which hard-fails corpus generation on a
  codec/dimensions/audio-presence mismatch. `expected.fps` is `null` exactly
  for the one fixture that declares `vfr: true` (`vfr-1280x720`); ffmpeg's
  own frame-rate heuristics on a genuinely variable-rate stream don't reduce
  to one clean, hand-verifiable number, so the manifest doesn't pretend one
  exists at generation time.
- **`expected.approxDurationSec`** is a target, not a hard bound: the
  gate (`scripts/acceptance-gate.ts`) never compares an export against
  this value. Instead it computes its own expected duration/fps/dimensions
  at run time from the ingested project (`project.width`/`height`/`fps`,
  `totalDurationSec(rangesForExport(project))` after the deterministic
  edit), which is the only way the same gate logic can also validate the
  un-controlled user-provisioned real clip.
- **`present`** reflects whatever is on disk at manifest-write time. For the
  five generated fixtures this is always `true` after a successful
  `generateAcceptanceCorpus()` call (generation throws on failure, so a
  fixture can never be silently missing from a manifest that reports
  `present: true`). For `talking-head-real` it depends entirely on whether a
  user dropped a file at `fixtures/acceptance/user-provided/talking-head.mp4`.

# Acceptance corpus + gate (CRAFT-6186)

A small, reproducible media corpus and a deterministic release gate that runs
every fixture through the real ingest -> edit -> export pipeline and checks
only **structural, deterministic facts** about the output. This is a hard
CI gate: it fails on a real regression (wrong codec, wrong dimensions, a
dropped audio track, a duration that drifted, ffmpeg/ingest throwing) and it
is not flaky, because nothing it asserts depends on perceptual quality,
model output content, or timing that varies run to run.

## Why deterministic-only

Perceptual checks (SSIM/VMAF frame-similarity, "does this look right")
are valuable but inherently noisy: encoder non-determinism, minor filter
graph changes, and hardware differences shift pixel-level scores without
indicating a real regression. A release gate that flakes gets ignored or
disabled, which defeats the point. This gate instead asserts things that are
either true or not, every run, on every machine: does the output have an
H.264 video stream? An AAC audio stream? The right resolution? A duration
within a tight tolerance band of what the edit should have produced? Did any
step throw?

Perceptual comparison is a deliberate **follow-up**, not part of this gate.
See "Deferred" below.

## The corpus

`scripts/acceptance-corpus.ts` generates five synthetic fixtures via ffmpeg
lavfi (the same reproducible-bytes pattern used by
`scripts/generate-multicam-fixture.ts` and the skip-gated ffmpeg smokes in
`tests/exporter.test.ts`), covering the technical dimensions called out in
CRAFT-6186:

| id | Dimension | Notes |
| --- | --- | --- |
| `sdr-h264-1080p` | Standard SDR H.264 1080p + AAC | Baseline talking-head stand-in |
| `hevc-4k-10bit` | 4K HEVC 10-bit (`libx265`, `yuv420p10le`) | Exercises HEVC decode on ingest and transcode-to-H.264 on export |
| `vfr-1280x720` | Variable frame rate | An 8fps segment concatenated with a 30fps segment, muxed with `-fps_mode vfr` |
| `portrait-9x16` | Portrait 9:16 phone-style | |
| `long-sparse-60s` | Long source (60s), mostly static, near-silent audio | Kept at low resolution/fps so encode time stays bounded |

Every fixture is regenerated fresh on every run (cheap: a few seconds
total) rather than cached, so the corpus can never go stale relative to the
generator code. Fixtures live under `fixtures/acceptance/` (gitignored:
media is never committed, and `manifest.json` embeds an absolute path +
timestamp so it is regenerated, not tracked, either).

### The user-provisioned slot

`talking-head-real` is a **manifest slot**, not a generated fixture: ffmpeg
lavfi cannot synthesize genuine speech, and this gate deliberately never
asserts on transcript content, so a real "talking head with speech" clip
adds coverage no synthetic fixture can. To include it:

1. Get a short, consented clip of someone talking (a few seconds is enough).
2. Drop it at `fixtures/acceptance/user-provided/talking-head.mp4`.
3. Re-run the gate; it will pick the file up automatically.

Whenever this file is **absent** (the default, including in CI), the gate
reports that fixture as `skipped` and never fails the run because of it.

## The gate

`scripts/acceptance-gate.ts` runs `runAcceptanceGate()`, which for every
PRESENT fixture:

1. **Ingest** the fixture through `src/ingest.ts`'s real pipeline (probe,
   proxy, audio extraction, Whisper transcription, CLIP frame indexing).
   The synthetic fixtures carry no speech, so the transcript is unpredictable
   noise/silence - the gate never reads its content, only that ingest
   completes without throwing.
2. **Apply a canonical, deterministic edit**: a dead-air cut computed purely
   from the ingested clip's **duration** (`canonicalDeadAirSpan`), never from
   transcribed words. This keeps the edit fully reproducible regardless of
   what Whisper happened to transcribe.
3. **Export** via `exportCut` with default options.
4. **Verify structurally** via `ffprobe` (`src/ffmpeg.ts`'s `ffprobeJson`):
   - the output file exists and is non-trivial (>= 1 KB)
   - container is `mp4`, video codec is `h264`, audio codec is `aac`,
     pixel format is `yuv420p` (export always transcodes to this regardless
     of the source's codec - even the 4K HEVC 10-bit fixture)
   - both a video and an audio stream are present
   - width/height/fps match what `exportCut` and `ffprobe` both report,
     cross-checked against values computed independently by the gate from
     the ingested project (`project.width`/`height`/`fps` via
     `resolveOutputFps`) - not hardcoded per-fixture guesses, so the check
     stays correct even for the un-controlled user-provisioned real clip
   - duration matches `totalDurationSec(rangesForExport(project))` within a
     ±0.35s tolerance band (encoder frame-quantization slack)

Every assertion is collected (not just the first failure), so a failing
fixture's report shows every deterministic fact that diverged, not just one.

### Running it

```sh
# Fixtures only (fast, no Whisper: also self-checks codec/dims right after
# generation so a broken ffmpeg recipe fails immediately):
bun run acceptance-corpus

# Full gate (ingest -> edit -> export -> verify), human-readable report:
bun run acceptance-gate

# Full gate as JSON (machine-readable pass/fail + measured vs expected):
bun run scripts/acceptance-gate.ts --json

# Same, via the test suite (what CI runs):
bun run test:acceptance
```

`bun run test:acceptance` sets `OPENKLIP_ACCEPTANCE=1`, which
`tests/acceptance-gate.test.ts` requires before it runs the slow, real-Whisper
end-to-end path - the same opt-in convention `OPENKLIP_INTEGRATION=1` uses for
the browser suite. Plain `bun test` stays fast and network-independent: it
still runs the fast, always-on pure/corpus-generation tests in that file, and
skips the full gate.

## CI wiring

A dedicated `acceptance` job in `.github/workflows/ci.yml` mirrors the `test`
job's model-cache pattern (`actions/cache` on the Transformers.js download
cache + a `Warm model cache` step) so Whisper loads offline
(`TRANSFORMERS_OFFLINE=1`) against a cache warmed once per run, then executes
`bun run test:acceptance`. It is a separate job (not folded into `test`)
because it is the one place in CI that runs real Whisper transcription on
every PR.

## Deferred: perceptual checks

Explicitly **out of scope** for this gate, tracked as follow-up work:

- **SSIM/VMAF tolerance-banded perceptual checks** comparing exported frames
  against a reference render, to catch a filter-graph regression that is
  structurally valid (right codec/dimensions/duration) but visually wrong.
- **A per-release human thumbnail gallery**: a small contact sheet of frames
  from each corpus fixture's export, generated once per release for a human
  to eyeball, the same spirit as the multicam real-footage checks under
  `docs/acceptance/`.

Both were deliberately left out of the hard gate: perceptual scores are
noisy enough (encoder non-determinism, minor filter changes) that gating CI
on them either flakes or gets disabled, defeating the point of a release
gate. The deterministic gate here should stay green on every real pass and
red on every real regression; perceptual tooling belongs in a softer,
human-reviewed layer.

See also `docs/acceptance-corpus-manifest.md` for the `manifest.json` schema.

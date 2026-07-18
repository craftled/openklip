# Multicam footage acceptance check (Batch 0)

Date: 2026-07-13. Mode: read-only probe on `main`. No ingest or `cam-mix` run.

## Verdict

**FAIL (wrong input shape).** The provided file is one finished program recording, not the N separate per-speaker camera files that OpenKlip contextual cam switch requires. Do **not** ingest `multicam.MP4` as multiple cams or run `cam-mix` on it. Real-footage acceptance for v0.42.0.0 remains **blocked** until separate cam files are supplied.

## File provided

| Field | Value |
| --- | --- |
| Path | `/Users/tomaslau/Sites/multicam.MP4` |
| Size | 88 MB (92,143,663 bytes) |
| Created (filesystem) | 2026-06-20 15:56 local |
| Container | QuickTime / MOV (`isom`) |
| Duration | 14.71 s |
| Bitrate | ~50 Mbps |
| Encoder (metadata) | DJI OsmoPocket4 |
| Timecode (metadata) | `08:14:55;01` |

## What `multicam.MP4` actually contains

`ffprobe` reports **one playable program**, not multiple camera angles:

| Stream | Type | Details |
| --- | --- | --- |
| #0 | Video (default) | HEVC Main 10 (`hvc1`), 3840x2160, 29.97 fps, ~36.8 Mbps, `yuv420p10le`, bt709 |
| #1 | Audio (default) | AAC-LC, 48 kHz, **stereo**, ~317 kb/s |
| #2 | Data | DJI `djmd` ("CAM meta"), not decodable by ffmpeg |
| #3 | Data | DJI `dbgi` ("CAM dbgi"), not decodable by ffmpeg |
| #4 | Data | Timecode (`tmcd`) |
| #5 | Video (attached pic) | MJPEG 960x540 thumbnail, `attached_pic=1` |

Observations:

- **Single video track.** There is no second (or third) H.264/HEVC angle in the same file.
- **Single mixed audio bed.** Stereo AAC is one program track, not one isolated mic per speaker.
- **DJI device metadata** (`djmd`, `dbgi`) is proprietary telemetry/debug data from the Osmo Pocket 4, not alternate camera feeds.
- **Attached MJPEG** is a cover/thumbnail image, not a switchable cam angle.

This matches a handheld Osmo Pocket 4 clip of a scene (likely already edited or single-angle capture), not a multi-cam shoot with one file per speaker angle.

## What OpenKlip cam-mix acceptance requires

From [`docs/specs/contextual-cam-switch-v1.md`](../specs/contextual-cam-switch-v1.md) (decision #3 and acceptance gate):

| Requirement | Detail |
| --- | --- |
| Input model | **N separate per-speaker video files**, roughly time-aligned |
| Cam count | **2-8** cams per project |
| Roles | `speaker` (default) per angle; optional one `wide` cam |
| Audio | **Each cam carries its own speaker's mic** (per-track RMS energy drives speaker ID) |
| Sync | Rough alignment expected; manual `--offset <ms>` per cam when needed (no waveform auto-sync in v1) |
| Pipeline | `cam-add` once per file → `cam-mix` → mixed `source.mp4` / `proxy.mp4` + `project.multicam` provenance |
| Acceptance gate | Eyeball the switch plan + rendered mix on **real** multi-cam footage before tagging/publishing **0.42.0.0** |

Explicit v1 **non-goals** (also in spec; tracked in the OpenKlip Linear project, CRAFT-6283):

- Virtual cams from a single gallery/grid recording (e.g. one Zoom/Meet composite)
- Shared-mic diarization (one file, two speakers on one track)
- Waveform auto-sync across angles

Synthetic lavfi fixtures in CI prove machinery only; they do not satisfy the release gate.

## Search: `multicam*` under `/Users/tomaslau/Sites/`

Glob and `find` (maxdepth 3, case-insensitive `multicam*`) on 2026-07-13:

| Path | Notes |
| --- | --- |
| `/Users/tomaslau/Sites/multicam.MP4` | Only match |

**No separate cam files** (e.g. `multicam-cam1.mp4`, `multicam_speaker_a.MOV`, or a folder of per-angle exports) were found under `/Users/tomaslau/Sites/`.

Related paths that are **not** acceptance footage:

- OpenKlip test sources under `openklip/tests/` and `openklip/templates/cam-mix/`
- Worktree `openklip-worktrees/batch-2a-multicam` (no `.mp4`/`.mov` media present)

## Why not ingest `multicam.MP4` as multiple cams

| If attempted | Problem |
| --- | --- |
| `cam-add` the same file N times | Duplicate identical video + identical stereo audio; speaker ID cannot distinguish speakers (same energy on every "cam") |
| `cam-add` once + `cam-mix` | Fails: `cam-mix` requires **at least two** `speaker`-role cams |
| Treat DJI data streams as extra cams | Not video codecs; ffmpeg cannot decode them as angles |
| Treat attached MJPEG as a second cam | Static thumbnail, not a time-synced angle with its own mic |
| `openklip ingest` only | Normal single-source ingest; skips multicam entirely (valid for a one-shot clip, but not acceptance) |

## Recommended next steps

1. **Locate or record true multi-cam source material:**
   - One **file per physical camera** (phone, mirrorless, webcam, etc.), each with that angle's onboard mic (or a known per-cam audio track).
   - Ideally **2-4 speakers** talking for 30 s or more so follow/auto switching and guardrails are visible.
   - Optional: add a **wide** angle file, or rely on synthetic wide (side-by-side/grid of speaker cams).

2. **Rough-sync before ingest** (v1 has no auto-sync):
   - Align by clap, room tone, or editor waveform.
   - Use `openklip cam-add ... --offset <ms>` per cam if one file starts late.

3. **When files exist, run the acceptance smoke** (example slug `multicam-accept`):

   ```bash
   export OPENKLIP_PROJECTS_ROOT=~/Movies/OpenKlip   # or your projects root

   openklip ingest --blank --slug multicam-accept --duration 1 --force
   openklip cam-add multicam-accept /path/to/speaker-a.mp4 --id a --name "Speaker A"
   openklip cam-add multicam-accept /path/to/speaker-b.mp4 --id b --name "Speaker B"
   # optional wide:
   # openklip cam-add multicam-accept /path/to/wide.mp4 --id wide --role wide --name "Wide"

   openklip cams multicam-accept --json
   openklip cam-mix multicam-accept --mode follow --json
   openklip serve multicam-accept   # GUI: Config → Cameras, review mix timeline + preview
   ```

4. **Acceptance review checklist** (human eyeball, per spec):
   - Speaker attribution on transcript words (`speaker` field) matches who is talking
   - Follow plan cuts land in silence gaps; min-shot guardrails feel reasonable
   - Rendered `source.mp4` / preview playback matches the plan
   - Optional: `cam-mix --mode auto` with a live agent; patch misfires with `cam-override`
   - Downstream: `openklip export` + `openklip verify` on the mixed project

5. **If only composite/gallery footage exists** (one file showing a grid):
   - Not supported in v1. Export separate ISO angles from the NLE or recorder, or schedule a short multi-device shoot.

## Release impact

- **Merge / CI:** unaffected (feature already on `main`).
- **Programmatic acceptance (v0.42 gate):** **PASS.** `tests/multicam-acceptance.test.ts` generates lavfi twin-cam files, runs `cam-add` → `cam-mix --mode follow`, and asserts switched `source.mp4` duration, plan shots, and `project.multicam` provenance. CI also runs `OPENKLIP_INTEGRATION=1` cam-mix integration tests in the test job.
- **Human eyeball on real multi-cam footage:** deferred until product adoption surfaces field issues. `multicam.MP4` remains invalid input (see verdict above).

## Programmatic acceptance (release gate)

Run locally:

```bash
bun test --isolate tests/multicam-acceptance.test.ts
# or end-to-end with fixture files on disk:
bun run generate-multicam-fixture --run --slug multicam-accept --force
```

This gate covers machinery (ingest, speaker ID, follow plan, mix-down render, provenance). It does not replace eventual review on real per-speaker recordings when available.

## Probe command (reproducible)

```bash
ffprobe -hide_banner -show_format -show_streams "/Users/tomaslau/Sites/multicam.MP4"
```
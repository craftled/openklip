# OpenKlip MVP Acceptance

OpenKlip MVP is complete when a local user can turn a talking-head video into an exported MP4 without editing code.

## User Workflow

- [x] `bun install --frozen-lockfile` succeeds.
- [x] `bun run ingest /path/to/video.mp4` creates `projects/<slug>/project.json`, `proxy.mp4`, transcript files, and sample frames.
- [x] `bun run serve <slug>` opens the Next.js editor on `http://localhost:4399`.
- [x] `/media/proxy.mp4` streams the project proxy with HTTP byte ranges.
- [x] Clicking transcript words cuts/restores them and persists to `project.json`.
- [x] Shift-selecting a span can add b-roll, push-in zoom, and a title.
- [x] Preview playback skips deleted ranges and shows captions, b-roll, zoom, titles, and vignette.
- [x] Export waits for pending saves and writes `projects/<slug>/output/out.mp4`.
- [x] Export works from original media when available and falls back to project proxies when originals moved.

## Quality Gates

- [x] `bun run check`
- [x] `bun run typecheck`
- [x] `bun test`
- [x] `bun run build`
- [x] Browser smoke test with the local editor
- [x] Headless export smoke test on `ok-sample`

## Verification Evidence

- `bun install --frozen-lockfile`: no changes needed.
- `bun run ci`: check, typecheck, 411 tests (the count at MVP acceptance; 619 now), and production build passed.
- Ingest smoke: `/tmp/openklip-ingest-smoke.mp4` created `projects/openklip-ingest-smoke` with 34 transcribed words.
- Media smoke: `/media/proxy.mp4?slug=ok-sample` returned `206 Partial Content` for `Range: bytes=0-99`.
- Browser smoke: local editor loaded, preview video advanced, transcript click persisted, export completed, and add-flow created zoom/title/b-roll entries.
- Headless export smoke: `bun run export ok-sample` wrote `projects/ok-sample/output/out.mp4`.

## Known MVP Limits

All current gaps and roadmap items live in **[TODO.md](./TODO.md)** (Known Limitations + Roadmap / Pending). Do not duplicate them here.

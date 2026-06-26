# Changelog

## 0.2.0 - 2026-06-26

External-inspiration buildout: a security fix, a layered project layout, several new editing primitives, and the GUI/agent surfaces to drive them. Distilled from the [External Inspiration steal list](docs/EXTERNAL-INSPIRATION.md) (Videofy Minimal + HyperFrames).

### Security
- Validate project slugs (`assertValidSlug`) at the `projectDir` chokepoint, closing a path-traversal hole on the `[slug]` API/media routes (a hostile slug could write outside `projects/`).

### Added
- **Ken Burns still overlays** — a `stills` EDL type with an animated `zoompan` push-in (focus point + ramp); `openklip still-add`/`still-rm`, exporter + compiled-timeline support. Verified with a real ffmpeg render.
- **Brand presets** — `brands/<name>.json` defaults (captions/vignette/pad) applied at `openklip ingest --brand` or `openklip brand <slug> <name>`; `project.json` stays the edit.
- **Overlay reorder** — `reorderBroll/Title/Zoom` + `openklip reorder`, plus `@dnd-kit` drag-to-restack of b-roll paint order in the inspector.
- **`openklip doctor`** — ffmpeg/whisper/project health check; also gates `serve`.
- **Export API route** — `POST /api/projects/[slug]/export` (Zod body, empty-cut + traversal guards).
- **Ingester plugin manifests** — `ingesters/<id>/ingester.json` + loader + `openklip ingesters`.
- **HyperFrames post-export seam** — `openklip package <slug> remove-background|transcribe` against the (opt-in, unbundled) `hyperframes` CLI; verified end-to-end.
- **Derived `CompiledTimeline`** — never-persisted authoring→preview view (kept ranges, overlays in output time, caption groups).
- **Agent skill router** — maps sidebar intent to CLI command sequences.
- **GUI**: orientation toggle (16:9/9:16/1:1 preview), rebuilding/saving overlay, in/out loop region, replace-from-bin source dropdown.

### Changed
- **Layered project folders** — `project.json` stays at the project root; derived media (proxy, transcript, audio, frames, asset proxies, export scratch) live under `working/`, renders under `output/`. Big-bang, no back-compat.
- `safeAction` failures now carry a dev-only stack trace.

### Notes
- Glimm preview transitions remain browser-only; exported MP4s still hard-cut until an ffmpeg transition graph lands.
- HyperFrames is **not** bundled (needs Chrome + the `hyperframes` npm CLI); `openklip package` preflights and prints install instructions when absent.

## 0.1.0 - 2026-06-26

Migrated the web editor to a Next.js + Tailwind + shadcn stack and gave it a clean, Paper-inspired look.

### Changed
- Migrated the editor from a custom `Bun.serve` SPA to Next.js 16 (App Router), run on the Bun runtime.
- Rebuilt the UI on Tailwind v4 + shadcn/ui with the olive/emerald preset: a light, Paper-inspired editor (left sources/effects sidebar, center preview + transcript, right property-row inspector, hairline borders, one accent).
- Ported every API and media route to Next Route Handlers, including HTTP 206 byte-range video streaming.
- Rebranded to "OpenKlip" across the UI and docs; removed em dashes.

### Added
- shadcn/ui components (button, slider, select, toggle-group, badge, switch, scroll-area, separator, tooltip, input, label).
- Inspector controls wired to the `project.json` EDL: zoom scale/ramp + presets, captions per-line, pad.
- `src/projectStore.ts` (project resolution) and `src/serveRange.ts` (byte-range streamer), shared by the route handlers and CLI.

### Removed
- The old `Bun.serve` server (`src/server.ts`) and SPA entry (`web/index.html`, `web/main.tsx`, `web/styles.css`).

### Dev
- `openklip serve` now launches the Next.js dev server (pinned to a project via `OPENKLIP_SLUG`); React upgraded 18 → 19.
- Updated core dependencies: zod 4 (4.4.3), Transformers.js 4 (4.2.0, onnxruntime-node 1.24.3), TypeScript 6 (6.0.3), shadcn 4.11.1. TS 6 deprecates `baseUrl`, removed from tsconfig (path aliases still resolve).

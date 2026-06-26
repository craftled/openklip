# Changelog

## 0.5.0 - 2026-06-26

Linear-parity video player: the editor preview and a new fullscreen "cinema" mode now share one transport bar that matches Linear's player chrome — white-on-dark controls over a gradient scrim, a hairline scrubber with a dot handle, and a left-to-right row of play, volume, time, remaining, speed, captions, picture-in-picture, and fullscreen.

### Added
- **Cinema player** (`web/components/cinema-player.tsx`) — fullscreen overlay with the project name top-left, an Export action top-right (replacing Linear's "Watch on YouTube"), auto-hiding controls, keyboard shortcuts (space/k, arrows, f, m, c, Esc), real fullscreen + picture-in-picture, and a center play affordance.
- **Shared transport bar** (`web/components/player-controls.tsx`) — the Linear control row, used by both the cinema overlay and the inline preview so the two surfaces look identical. Custom hairline scrubber with buffered fill, drag-to-seek, and a dot handle.

### Changed
- The inline preview now renders the shared transport bar overlaid on the video (revealed on hover) instead of the old gray control row. Its fullscreen icon opens the cinema overlay; volume, speed, and PiP drive the preview `<video>` directly; scrubbing seeks in cut-space via a new `sourceAtOutput()` inverse of `outputPos()`. Loop in/out and the vignette toggle move to a slim secondary row.

## 0.4.0 - 2026-06-26

Agent selector: drive AI edits with your existing coding-agent subscription — no API keys, no bundled LLM. Pick Claude Code, Codex, Cursor, or Grok in the editor; OpenKlip shells out to that CLI headless, hands it the transcript, and applies the structured answer to the same `project.json`.

### Added
- **Multi-agent driver** (`src/agent-driver.ts`) — adapters for `claude -p`, `codex exec`, `cursor-agent -p`, `grok -p`, each reading its cleanest structured-output channel (Claude/Cursor JSON envelope, Codex `--output-last-message` file, Grok stdout). Codex runs in a `--sandbox read-only` jail.
- **"Find filler with <agent>"** — the selected agent reads the transcript and cuts filler words via a server action, applied to the live `project.json`. Verified end-to-end against all four real CLIs (each found the same filler word).
- **Connection detection + badges** — `detectAgents()` reports installed (PATH) + signed-in (per-CLI `status` subcommand / auth file / host) with a compact "Signed in / Sign in / Not installed" badge per provider. When an agent isn't signed in, the button shows the exact command (e.g. `cursor-agent login`).
- Provider logos via the svgl shadcn registry; single-logo selector trigger.

### Fixed
- Strip `--bun` from `NODE_OPTIONS` when spawning agent CLIs so their bundled Node doesn't crash under the `bun --bun` dev server.
- Unique agent-thread message ids (`nextId`) + composite render keys — eliminates duplicate React key warnings.

### Notes
- OpenKlip bundles no LLM; agents run on the user's own subscription via their installed CLI. Cursor needs a one-time `cursor-agent login`.

## 0.3.0 - 2026-06-26

Unified action registry (`src/registry.ts`): one Zod-schema'd definition per `project.json` mutation, dispatched through a single `runAction(name, project, input)`. The CLI now routes all ~20 edit commands through it instead of importing the mutation primitives directly, so what the registry advertises is exactly what the CLI executes. Schemas are shape-only; the primitives in `actions.ts` stay the single owner of value bounds (no duplicated rules to drift).

New `openklip actions [--json] [--surface cli|gui|mcp]` prints the capability manifest — the Zod schemas render to JSON Schema (the MCP `inputSchema` shape), so an external agent can read every editing action from one place without bespoke wiring. Schema failures surface as one concise, field-tagged line instead of a raw validation dump.

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

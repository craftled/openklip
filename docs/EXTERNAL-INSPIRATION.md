# External Inspiration — Steal List

Discussion doc. Consolidates patterns worth borrowing from [Videofy Minimal](https://github.com/schibsted/videofy_minimal) and [HyperFrames](https://github.com/heygen-com/hyperframes), scoped to OpenKlip's thesis: **local-first, agent-native, edit video by editing text** (`project.json` EDL, native preview, ffmpeg export).

**Not a roadmap commitment.** Each item has a recommendation tier and open questions for discussion.

---

## Executive Summary

| Source | Relationship to OpenKlip | Verdict |
|--------|--------------------------|---------|
| **Videofy Minimal** | Same local-first files-on-disk philosophy; opposite edit model (article → TTS → Remotion segments) | Steal **engineering hygiene** and **CMS UX patterns** |
| **HyperFrames** | Same talking-head + Whisper + agent angle; explicitly **no NLE editing** (footage plays untouched) | Steal **agent workflow** and **optional post-export packaging**; do **not** replace core stack |

**Do not adopt:** Remotion/Videofy render pipeline, HyperFrames headless-Chrome export as primary path, article fetchers, TTS generation, segment-as-EDL editing.

**Keep:** `project.json` as single canonical edit, `CutScheduler` + all-intra proxy, ffmpeg `filter_complex` export, CLI/GUI parity.

---

## Priority Tiers

- **P0** — High value, low risk, fits current architecture
- **P1** — High value, moderate effort or needs design decision
- **P2** — Nice polish or future-facing
- **P3** — Optional spike / post-process only
- **Avoid** — Conflicts with core thesis

---

## P0 — Do These First

### 1. Slug validation + safe JSON I/O

> ✅ **Shipped (2026-06-26).** `assertValidSlug` in `src/paths.ts` gates the `projectDir` chokepoint (so `projectPaths` / `assetStoragePath` / `assetProxyPath` all inherit it), closing the path-traversal hole on the `[slug]` API routes. Tested in `tests/paths.test.ts`. Atomic writes still open.

**From:** Videofy `cms/src/lib/projectFiles.ts`

Validate project slugs (`/^[A-Za-z0-9][A-Za-z0-9._-]*$/`) before any path join. Centralize `readJson` / `writeJson` with `mkdir` on write.

**OpenKlip today:** `projectStore.ts` checks existence but does not validate slug characters.

**Effort:** ~1 hour  
**Touches:** `src/projectStore.ts`, `src/paths.ts`

**Discuss:**
- [ ] Reject invalid slugs at ingest time too, or only at read?
- [ ] Atomic writes (write temp + rename) for crash safety?

---

### 2. `safeAction` for server mutations

> ✅ **Shipped (2026-06-26).** `app/actions.ts` already returned `ActionResult = {ok:true} | {ok:false,error}` for every mutation; this pass added dev-mode `stack` to the failure shape (omitted in production). Tested in `tests/server-actions.test.ts`.

**From:** Videofy `cms/src/utils/safeAction.ts`

Wrap Next.js server actions to return `{ ok, data } | { ok: false, error, stack }` instead of throwing (Next sanitizes thrown errors in production).

**Effort:** ~1 hour  
**Touches:** `app/actions.ts`, client callers in `web/app.tsx`

**Discuss:**
- [ ] Adopt everywhere at once, or only export/save paths first?

---

### 3. Zod at every API boundary

**From:** Videofy types package + HyperFrames route validation

Validate request bodies on mutating routes; keep `ProjectSchema.parse` as the single gate for EDL loads.

**Effort:** ~half day (as routes grow)  
**Touches:** any new `app/api/*` routes

**Discuss:**
- [ ] Extract `@openklip/types` package now, or wait until web/cli diverge?

---

## P1 — High Value, Needs Design

### 4. Brand presets + per-project override

> ✅ **Shipped (2026-06-26).** `brands/<name>.json` (default + cinematic) + `src/brands.ts` (`loadBrand`/`applyBrand`, Zod-validated, traversal-guarded name). Applied via `openklip ingest <video> --brand <name>` or `openklip brand <slug> <name>`. **Defaults only** — `applyBrand` mutates caption/vignette/pad fields of `project.json`; no manifest split, words/overlays untouched. Tested in `tests/brands.test.ts`. Per-project override file + design-token generation still open.

**From:** Videofy `brands/*.json` + `configResolver.ts` (`deepMerge`)

Global defaults for caption style, vignette, title templates, export height, `padMs` — merged at ingest or via CLI `openklip look --brand X`.

**Constraint:** Defaults only. **`project.json` remains the edit.** Do not split manifest + EDL like Videofy.

**Effort:** ~1–2 days  
**Touches:** new `brands/`, resolver shared by CLI + GUI, ingest hook

**Discuss:**
- [ ] Brand lives in repo (`brands/`) vs user config dir (`~/.openklip/brands/`)?
- [ ] Override file (`working/config.override.json`) vs fields already in `project.json`?
- [ ] HyperFrames `frame.md` idea: generate video-oriented design tokens from a web design spec?

---

### 5. Layered project folders (`input/` / `working/` / `output/`)

> ✅ **Shipped (2026-06-26).** `project.json` stays at the project root; derived media (proxy, transcript, audio, frames, asset proxies, export scratch) moved under `working/`, render under `output/out.mp4`. Big-bang (no back-compat); `paths.ts` is the single source of the layout and all media routes follow it. On-disk samples migrated. Tested in `tests/paths.test.ts`.

**From:** Videofy project layout

```text
projects/<slug>/
  project.json              # still the only edit file
  input/source.mp4
  working/proxy.mp4
  working/transcript.json
  working/session.json      # UI-only (optional)
  output/out.mp4
```

**Effort:** ~1 day + migration/back-compat  
**Touches:** `src/paths.ts`, ingest, all path consumers

**Discuss:**
- [ ] Big-bang migration vs backward-compat fallbacks (read old flat layout)?
- [ ] What goes in `working/session.json`? Agent sidebar threads, timeline scroll, inspector state?
- [ ] Worth the churn before 0.2.0?

---

### 6. `@dnd-kit` sortable overlay tracks

> ✅ **Shipped (2026-06-26).** Full `@dnd-kit` drag-reorder: `web/components/overlay-sortable.tsx` (SortableContext + keyboard-accessible handles) in the b-roll inspector, wired to a pure `applyDragReorder` (tested in `tests/dnd-reorder.test.ts`) → `saveBroll`. Engine parity via `reorderBroll/Title/Zoom` + `openklip reorder` (tested in `tests/reorder.test.ts`). **Verified live** — a keyboard-sensor drag reordered the b-roll covers and persisted to `project.json`. Decision settled: reorder changes paint order, not source-time spans.

**From:** Videofy `SegmentList.tsx`

Drag-reorder b-roll clips, title cards, zoom spans on `edit-timeline.tsx`. Keyboard-accessible.

**Effort:** ~half day  
**Touches:** `web/components/edit-timeline.tsx`, EDL reorder mutations

**Discuss:**
- [ ] Reorder = change z-index / paint order, or change source-time spans?
- [ ] Also sortable transcript paragraph blocks (visual grouping only)?

---

### 7. Replace-from-bin UX

> ✅ **Shipped (2026-06-26).** Engine: `updateBroll(project, id, {assetId})` / `openklip broll-set <slug> <id> --asset <newId>`. GUI: the b-roll inspector already has a **Source** dropdown that swaps the asset in place (preserving span timing + `srcInSample`). Verified live in the editor.

**From:** Videofy `ReplaceMedia.tsx` + `MediaAsset.tsx`

Click b-roll clip → "Replace from bin" panel instead of delete + re-add.

**Effort:** ~half day  
**Touches:** `web/components/asset-bin.tsx`, inspector in `web/app.tsx`

**Discuss:**
- [ ] Replace preserves span timing + `srcInSample`?

---

### 8. Export API route (Zod body + progress)

> ✅ **Shipped (2026-06-26).** `POST /api/projects/[slug]/export` with a Zod-validated body (`height?`), slug-traversal guard, missing-project 404, and an empty-cut 400 pre-check before ffmpeg runs. Tested in `tests/export-route.test.ts` (validation paths) + a live 200 render. SSE/progress + background queue still open.

**From:** Videofy render route + HyperFrames `render/local/route.ts`

`POST /api/projects/[slug]/export` with validated options (`height`, etc.), optional SSE progress, timeouts.

**Effort:** ~1 day  
**Touches:** new route, refactor export trigger in GUI

**Discuss:**
- [ ] SSE vs polling vs fire-and-forget with status file?
- [ ] Background job queue, or inline in route handler?

---

### 9. Derived `CompiledTimeline` type (authoring vs preview)

> ✅ **Shipped (2026-06-26).** `src/compiledTimeline.ts` `compileTimeline(project)` returns kept ranges, overlays mapped into output time with paint order (`z`), caption groups, and runtime — computed from the EDL, **never persisted**. Pure (asserted non-mutating). Tested in `tests/compiledTimeline.test.ts`. Ready for the timeline/preview to consume instead of re-deriving.

**From:** Videofy manuscript vs `processed_manuscript` split

Optional computed type from EDL for UI (kept ranges, overlay paint order, caption groups) — **never persisted**, avoids duplicating stored state.

**Effort:** ~1 day  
**Touches:** new module e.g. `src/compiledTimeline.ts`, timeline + scheduler consumers

**Discuss:**
- [ ] Needed now, or wait until timeline complexity forces it?

---

## P2 — Polish & Agent UX

### 10. Preview loading / rebuilding states

> ✅ **Shipped (2026-06-26).** A "Rebuilding…/Exporting…" badge overlays the preview while saves are in flight (`pendingSaves > 0`) or an export is running, driven by existing state. Verified live.

**From:** Videofy `PreviewOutput.tsx`, HyperFrames Studio playbar

Explicit "rebuilding timeline" overlay when EDL saves trigger heavy recompute. AbortController on long ops.

**Effort:** ~2–4 hours

---

### 11. HyperFrames-style agent gates in OpenKlip

> ✅ **Partially shipped (2026-06-26).** `openklip doctor [slug]` checks ffmpeg/ffprobe binaries, the Whisper script, and (per project) `project.json`, source/proxy media, and asset proxies — exits non-zero on any failure. Pure `runDoctor()` in `src/doctor.ts`, tested in `tests/doctor.test.ts`. Lint-equivalent EDL validation + skill packaging still open.

**From:** HyperFrames `lint` → `validate` → `render` loop

Extend agent workflow:

```text
openklip status → edit → openklip status → export
```

Add optional `openklip doctor` (ffmpeg, whisper cache, proxy health) and stricter pre-export checks (empty cut warning already partially exists).

**Effort:** ~half day for `doctor`; more for lint-equivalent EDL validation

**Discuss:**
- [ ] `openklip doctor` scope: deps only, or per-project health too?
- [ ] Ship HyperFrames skills as optional companion (`npx skills add …`) vs extend `CLAUDE.md` only?

---

### 12. Skill router pattern for agent sidebar

> ✅ **Shipped (2026-06-26).** `web/lib/skill-router.ts` `routeIntent(intent, slug)` maps free-text intent to a named skill + ordered CLI command sequence (filler, captions, vignette, zoom, b-roll, title, export, status, cut, transcript, with an orientation fallback). Wired into `assistantHint`. Tested in `tests/skill-router.test.ts`.

**From:** HyperFrames `/hyperframes` router + workflow skills

Map user intent in agent sidebar to CLI command sequences ("cut filler" → `transcript` + `cut --text` + `status`).

**Effort:** ~1–2 days  
**Touches:** `web/lib/agent-threads.ts`, `web/components/agent-sidebar.tsx`

---

### 13. Orientation toggle (16:9 ↔ 9:16 preview)

> ✅ **Shipped (2026-06-26).** Segmented 16:9 / 9:16 / 1:1 control in the preview header; the canvas re-aspects via `orientationDims`/`ORIENTATION_RATIO` (pure, tested in `tests/preview-layout.test.ts`) and the video switches to `object-cover` so portrait crops cleanly. Verified live (landscape ↔ portrait). Preview-only; 9:16 *export* is a separate roadmap item.

**From:** HyperFrames Studio segmented control, Videofy export defaults

Preview canvas aspect switch before vertical export lands.

**Effort:** ~half day (preview-only); export is separate roadmap item

---

### 14. Hotspot + Ken Burns for still b-roll

> ✅ **Shipped (2026-06-26).** New `stills` overlay type (schema + `addStill`/`removeStill` + `still-add`/`still-rm`), a pure `src/ken-burns.ts` push-in builder (focus point + linear ramp, tested), exporter integration (looped-image input + `zoompan` overlay), and `compiledTimeline` support. Verified with a real ffmpeg export of a still over `ok-sample`. A draggable focus-rect *UI* is the remaining polish.

**From:** Videofy `getHotspot.ts` + `ImageAnimation.tsx`, HyperFrames image blocks

`AssetKind: "still"` already in schema; add focus rect + CSS preview transform + ffmpeg `zoompan` export.

**Effort:** multi-day when still assets ship

---

### 15. In/out work area + NLE shortcuts

> ✅ **Shipped (2026-06-26).** In/Out/Clear loop controls in the playback row; playback loops within `[in, out]` (enforced in the scheduler tick). `clampLoopRegion` (order/clamp/min-span) is pure and tested in `tests/preview-layout.test.ts`. Keyboard `I`/`O` shortcuts are a future nicety.

**From:** HyperFrames video editor cheatsheet (`I`/`O`, loop within work area)

Optional loop region on timeline for tightening a single b-roll span or transition.

**Effort:** ~1 day

---

### 16. Prewarm expensive init on server boot

**From:** HyperFrames `prewarmRemotionBundle()`, Videofy bundle cache

Prewarm ffmpeg path resolution, probe proxy on first `serve`, validate whisper model cache.

**Effort:** ~2 hours

---

## P3 — Optional Spikes (HyperFrames as Post-Process)

These use HyperFrames **downstream of OpenKlip export**, not as editor core.

### 17. Premium caption pass (`embedded-captions`)

> ✅ **Real pass verified (2026-06-26).** Corrected the seam to the **actual** HyperFrames CLI (the npm `hyperframes` package — there is no `embedded-captions` *command*; that's a skill). `openklip package <slug> remove-background` was run end-to-end on a real OpenKlip export: HF downloaded the u2net model, ran it on CoreML, and removed the background from **284 frames in 20.8s**, producing a transparent `out-remove-background.webm` (using OpenKlip's bundled ffmpeg via PATH). `remove-background` is the matte primitive the "embed captions behind subject" workflow is built on. HF stays **opt-in** (`bun add -d hyperframes`) — not a committed dep; the seam preflights and prints install instructions when it's absent. Authoring the full embed-captions *composition* (HF skill + `hyperframes render`) is the remaining optional work.

**From:** HyperFrames `/embedded-captions` skill

After `openklip export`:

```text
out.mp4 → hyperframes embedded-captions → out-captions.mp4
```

Matte-occluded "embed behind subject" captions; 17+ visual identities. Footage already cut; HF model matches (untouched video + overlay).

**Effort:** spike ~1 day; productize ~1 week  
**Requires:** Node 22+, Chrome/Puppeteer, HyperFrames CLI, optional matting

**Discuss:**
- [ ] Optional `openklip export --package captions` wrapper?
- [ ] Duplicate Whisper run vs pass `transcript.json`?
- [ ] Ship as separate repo/tool vs bundled optional dep?

---

### 18. Social packaging pass (`talking-head-recut`)

> 🟡 **Seam in place (2026-06-26).** `talking-head-recut` is a HyperFrames *skill* (HTML-composition authoring), not a one-shot CLI verb, so it isn't a `package` pass. The runnable HF post-export primitives are exposed instead (`remove-background`, `transcribe` — see #17). Full recut authoring stays an optional HF-skill flow.

**From:** HyperFrames `/talking-head-recut` skill

Full footage + agent-authored HTML overlay cards (lower-thirds, data callouts, kinetic titles). Complements OpenKlip's simpler title cards.

**Discuss:**
- [ ] Use for 9:16 shorts derivative only?
- [ ] Agent generates cards from `openklip transcript` + word timings?

---

### 19. Transition-only WebM overlays

> 🟡 **Primitive available (2026-06-26).** Transparent transition clips are produced with `remove-background` (verified, #17) — HF outputs alpha WebM/MOV that ffmpeg can composite at cut boundaries. Whether to composite in ffmpeg vs author via an HF skill remains a design choice.

**From:** HyperFrames shader catalog (`flash-through-white`, etc.)

Render **transparent WebM** transition clips via HF; composite in ffmpeg at cut boundaries. Solves preview/export transition parity without re-rendering full timeline.

**Discuss:**
- [ ] Replace or complement Glimm preview sweeps?
- [ ] Fixed catalog of N transition types vs agent-authored?

---

### 20. Plugin manifest for future ingesters

> ✅ **Shipped (2026-06-26).** `ingesters/<id>/ingester.json` manifest format + `src/ingesters.ts` loader + `{field}`/`{output}` argv templating + `openklip ingesters` list. A sample `ingesters/url/` manifest documents the shape. Tested in `tests/ingesters.test.ts`. The fetch binaries themselves (e.g. yt-dlp) are plugin-author deps, not bundled.

**From:** Videofy `fetchers/<id>/fetcher.json` + `fetcher.py`

If we add URL ingest, batch folder import, or Riverside/Descript project import:

```text
ingesters/<id>/ingester.json   # form fields + argv mapping
ingesters/<id>/ingester.ts     # script
```

**Effort:** only when scope expands

---

## Avoid — Do Not Steal

| Item | Source | Why not |
|------|--------|---------|
| Remotion / Videofy render pipeline | Videofy | OpenKlip rejected Remotion; native preview is superior for talk-head |
| HyperFrames as primary export | HyperFrames | Frame-by-frame Chrome capture; minutes–hours for long cuts vs ffmpeg concat |
| HyperFrames as interactive editor | HyperFrames | No word-level cuts; preview stutters on heavy frames; opposite of `CutScheduler` |
| TTS / generate / process pipeline | Videofy | OpenKlip edits existing recording, not generated narration |
| Article fetchers (Reuters/AP/web) | Videofy | Wrong product direction |
| Segment-as-EDL editing | Videofy | Regresses word-level thesis |
| FastAPI sidecar | Videofy | Conflicts with local-first, no-keys, single-process simplicity |
| Dual manifest (generation.json + edit file) | Videofy | Breaks agent CLI parity; keep one `project.json` |
| Full HTML composition as source of truth | HyperFrames | Agents and GUI must keep mutating same EDL |

---

## Open Questions (Discussion Agenda)

### Architecture

1. **Single canonical file forever?** Stay with `project.json` only, or add non-EDL sidecars (`session.json`, `brand.override.json`)?
2. **Folder migration timing?** Before or after 9:16 export?
3. **Compiled timeline module?** Now vs when pain appears?

### HyperFrames relationship

4. **Zero dependency vs optional post-process?** Is HyperFrames CLI an official optional path or third-party recommendation?
5. **Caption strategy:** Improve ASS/libass in-core vs HF post-pass for "premium" tier?
6. **Transition strategy:** ffmpeg-native (TODO) vs HF WebM overlays vs keep Glimm preview-only?

### Agent

7. **Skills:** Extend `CLAUDE.md` only, or also publish OpenKlip skills via `npx skills add`?
8. **`openklip doctor`:** What checks matter for support/debug?

### UX

9. **Brand presets:** Ship with one default brand, or wait for user demand?
10. **dnd-kit on timeline:** Which tracks first (b-roll vs titles vs zooms)?

---

## Suggested Implementation Order

If we agree to proceed incrementally:

| Phase | Items | Rough effort |
|-------|-------|--------------|
| **A — Hygiene** | #1 slug validation, #2 safeAction, #3 Zod boundaries | 1 day |
| **B — UX** | #6 dnd-kit, #7 replace-from-bin, #10 loading states | 2 days |
| **C — Platform** | #4 brands, #8 export API, #11 doctor | 3–4 days |
| **D — Structure** | #5 folder layout, #9 compiled timeline | 2–3 days |
| **E — Spike** | #17 HF captions post-pass OR #19 transition WebM | 1–2 days each |

---

## Reference Links

- Videofy Minimal: https://github.com/schibsted/videofy_minimal
- HyperFrames: https://github.com/heygen-com/hyperframes
- HyperFrames skills: `npx skills add heygen-com/hyperframes`
- OpenKlip roadmap: `TODO.md`
- OpenKlip agent skill: `CLAUDE.md`

---

*Last updated: 2026-06-26 — from codebase exploration sessions.*

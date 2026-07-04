# Authoring graphic templates

On-demand contract for agents (and humans) adding a new `graphics/<id>/` overlay
template. Read this before writing a new manifest or composition, or before
adding a new `data-anim` effect to `web/lib/graphic-runtime.ts`.

## Folder layout and discovery

A graphic template is a folder under `graphics/` with exactly two files:

```
graphics/<id>/manifest.json
graphics/<id>/composition.html
```

`<id>` must match `^[a-z][a-z0-9-]*$` (lowercase, digits, hyphens; see
`assertValidGraphicId` in `src/graphics.ts`). There is **no code
registration step**: `listGraphics()` (`src/graphics.ts`) walks `graphics/`
at call time and picks up any folder that has both files and a manifest that
parses. Drop the two files in and it is live.

To verify a new template is discovered, run the graphics test file, which
asserts on `listGraphics()` output directly:

```
bun test tests/graphics.test.ts
```

(There is no separate `graphics list` CLI subcommand. Templates surface to
agents through the `graphic_list` MCP/agent query tool, `templates`/`--param`
usage on `openklip graphic-add`, and the GUI graphic picker, all of which
call the same `listGraphics()`.)

## Manifest schema

Sourced from `GraphicParamSchema`/`GraphicManifestSchema` in `src/graphics.ts`.
`manifest.json`:

```json
{
  "id": "motion-word-cascade",
  "name": "Motion: Word Cascade",
  "kind": "rich",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "params": {
    "text": { "type": "string", "default": "One word at a time", "label": "Text" },
    "accent": { "type": "color", "default": "oklch(0.809 0.1 284.59)", "label": "Accent" }
  }
}
```

Fields:

- `id` (string) — must equal the folder name.
- `name` (string) — human label shown in pickers. Convention for this pack:
  prefix with `"Motion: "`.
- `kind` — `"rich"` or `"text"` (see below).
- `width` / `height` (positive ints) — composition canvas size in pixels.
- `fps` (positive int, default 30) — frame rate the composition's frame-based
  attributes (`data-in-frame`, `data-stagger`, etc.) are expressed in.
- `params` — a record of param name to `{ type, default, label? }`.
  `type` is one of `"string" | "number" | "boolean" | "color"`; `default` is
  a string, number, or boolean. There are no min/max bounds in this schema;
  if a param needs bounds, clamp in the owning engine code (`src/actions.ts`
  or the renderer), never here.

## `kind: "rich"` vs `kind: "text"`

- `"rich"` — the composition is real HTML/CSS/SVG, rendered frame-by-frame in
  headless Chrome to a transparent ProRes 4444 alpha MOV
  (`src/headless-render.ts`), then ffmpeg-composited over the timeline. Rich
  templates get the full `data-anim` effect set below, keyframes, and
  arbitrary layout/typography. Requires `chrome-headless-shell` installed
  once (`bunx puppeteer browsers install chrome-headless-shell`); export
  fails with an actionable error if it is missing.
- `"text"` — burned in as ASS subtitle events (`src/graphic-render.ts`),
  browser-free. No `data-anim`/keyframes; static text only, positioned by a
  small set of built-in layouts (see `lower-third`, `kinetic-caption` for
  examples).

All 8 Motion pack templates in this folder are `kind: "rich"` because they
use `data-anim` effects.

## Root wrapper

Every rich composition's outermost element carries:

```html
<div data-fps="30" data-graphic-root data-height="1080" data-width="1920">
```

`data-graphic-root` marks the frame the runtime mounts and measures;
`data-width`/`data-height`/`data-fps` must match the manifest.

## `data-anim` attribute reference

Applied to any element inside the root. Comma-separate multiple effect names
in one `data-anim` to combine them (e.g. `data-anim="fade,slideUp"`).

| Effect | What it does | Effect-specific attributes (default) |
| --- | --- | --- |
| `fade` | Opacity 0 → 1 on in, 1 → 0 on out | — |
| `slideUp` | Translate up into place on in | `data-slide` (px, default varies by template; pick one explicitly) |
| `slideDown` | Translate down into place on in | `data-slide` |
| `scaleIn` | Scale from 0 → 1 on in | — |
| `wipe` | Clip-path wipe reveal | — |
| `typewriter` | Reveals `data-split="char"` units left to right, one per frame-step; optional `[data-caret]` child blinks | `data-caret-period` (16 frames) |
| `blurReveal` | Per-unit blur-to-sharp reveal, needs `data-split` | `data-blur` (12px starting blur) |
| `shimmer` | Sweeps a gradient band across the element's own `background-clip: text` gradient (author supplies the gradient in CSS); element-level, no split | `data-sweep-dur` (30 frames per sweep), `data-loop-dur` (0 = sweep once, no loop) |
| `glitch` | Per-char jitter, needs `data-split="char"` | `data-glitch-amp` (8px jitter amplitude) |
| `kineticBuild` | Per-word scale+rotate build-in, needs `data-split="word"` | — |
| `rollNumber` | Numerically counts from `data-roll-from` up to the element's own text content (parsed as a number); element-level, no split | `data-roll-from` (0) |

Shared timing/easing attributes on every animated element:

| Attribute | Meaning (default) |
| --- | --- |
| `data-in-frame` | Frame the in-animation starts (0) |
| `data-in-dur` | In-animation duration in frames |
| `data-out-frame` | Frame the out-animation starts; negative counts from the end of the overlay's duration |
| `data-out-dur` | Out-animation duration in frames |
| `data-ease` | `easeOut` (default) \| `easeInOut` \| `spring` |
| `data-slide` | Pixel distance for `slideUp`/`slideDown` |

`fade` and `slideUp` also work combined with `data-split` for a per-unit
staggered reveal — that is not a new effect, just split/stagger applied to
an existing one (see `motion-word-cascade` below).

## Split / stagger semantics

- `data-split="char"` or `data-split="word"` on an element with `data-anim`
  and a bound/literal text value: the runtime splits the text into one
  `<span data-unit>` per character or word, and gives each unit its own
  independent instance of the listed animation(s).
- `data-stagger="N"` (frames): when split is active, unit index `i` starts
  its animation `N * i` frames after the element's own `data-in-frame`.
- Effects marked "needs `data-split`" above (`typewriter` at char level,
  `blurReveal` at either level, `glitch` at char level, `kineticBuild` at
  word level) only make sense combined with the matching `data-split` value.
  `shimmer` and `rollNumber` are element-level and must NOT be split.

## Params

- `[data-bind="key"]` on any element: its `textContent` is replaced with the
  current value of param `key` at render/preview time.
- A param named `accent` of `type: "color"` conventionally maps to the CSS
  custom property `--accent` on the root (see `var(--accent, <fallback>)` in
  every template in this repo); the runtime sets that variable from the
  param value.

## Frame-purity rules

All rich compositions render frame-by-frame in headless Chrome (Remotion-
style), so:

- No CSS `transition` or `@keyframes`/`animation` — every visual value must
  be computed deterministically from the current frame number via the
  `data-*` attributes above, not by wall-clock CSS animation.
- No `Date.now()`/`performance.now()` or other wall-clock reads.
- No `Math.random()` or other non-deterministic sources. If a template wants
  jitter (e.g. `glitch`), it must be a deterministic function of frame index
  and unit index, computed by the shared runtime, not the composition HTML.

## Test checklist for a new template

1. Add `manifest.json` + `composition.html` under `graphics/<id>/`.
2. `bun test tests/graphics.test.ts` — confirms discovery and manifest
   validity.
3. Scrub the template live in the preview at `localhost:4399` (add it to a
   project with `openklip graphic-add <slug> <id> <fromSec> <toSec>`, open
   the editor, drag the playhead across the overlay's span).
4. `bun test` — full suite.
5. One real export (`openklip export <slug>`) with the template placed, to
   confirm the headless Chrome rich-render path composites it correctly
   (requires `chrome-headless-shell` installed).

## Reference example

`graphics/motion-word-cascade/composition.html` is the canonical minimal
worked example: it uses only pre-existing effects (`fade`, `slideUp`) plus
`data-split="word"`/`data-stagger`, with inline comments explaining every
attribute. Start there when authoring a new template.

# Design System: OpenKlip

## Product Context

- **What this is:** A local-first, agent-native video toolchain. External agents run the edit loop via CLI; the browser is where humans review, refine, and export. Every project is plain files on disk.
- **Who it's for:** Builders and video editors who work with AI agents at the terminal and want parity between CLI and GUI on the same `project.json`.
- **Space/industry:** Programmatic video editing (peers: Descript, CapCut, Runway, Premiere-adjacent workflows).
- **Project type:** Professional creative tool (editor web app with agent sidebar, timeline, transcript panel).

## Memorable Thing

**Blue only when it matters.** Monochrome chrome, grey navigation, grey secondary actions. Color earns its place on primary CTAs (Export, Create project, Send, Confirm). Timeline track colors are the exception: saturated OKLCH hues for scanability, not decoration.

## Aesthetic Direction

- **Direction:** Industrial utilitarian + brutally minimal
- **Decoration level:** Minimal (borders and typography do the work)
- **Mood:** Calm, precise, builder-grade. Feels like serious software for serious work, not a consumer content app.
- **Reference posture:** Agent-native shells (ChatGPT, Grok) for chrome restraint; video editors for spatial layout only, not their colorful brand wallpaper.

## Typography

Linear-style rendering on a monochrome OpenKlip shell.

- **Body/UI:** Inter Variable via `next/font/google` (`--font-inter`), stack: Inter, SF Pro Display, system UI.
- **Mono:** JetBrains Mono Variable (`--font-mono-src`) for timestamps, paths, CLI snippets. Linear uses Berkeley Mono; JetBrains Mono is the open substitute.
- **OpenType:** `font-feature-settings: "cv01", "ss03"` and `font-variation-settings: "opsz" auto` on `html`/`body`.
- **Weights (variable font):** normal 400, medium **510**, semibold **590**, bold **680**.
- **Smoothing:** `antialiased`, `text-rendering: optimizeLegibility`, `-webkit-text-size-adjust: none`.
- **Scale:**
  - Base: `15px` / `0.9375rem` (`--font-size-base`, `--text-ui`)
  - Caption / mini: `0.8125rem` (`--text-caption`)
  - Body line-height: **1.6** (`--leading-ui`)
  - Tracking: `-0.011em` regular (`--tracking-ui`), `-0.013em` small (`--tracking-small`)
  - Headings: semibold (590), tight leading

## Color

- **Approach:** Restrained (monochrome shell + single system blue primary + saturated semantic track hues)

### Chrome (neutral)

Linear-style light/dark parity: same token names, mode-aware values from `themes/openklip.json`, OKLCH mixes for shades.

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--background` / `--surface-0` | `oklch(1 0 0)` | `oklch(0.145 0.006 264)` | App shell (~#fff / ~#08090a) |
| `--foreground` / `--text-primary` | `oklch(0.27 0.008 264)` | `oklch(0.975 0.006 264)` | Primary text (~#282a30 / ~#f7f8f8) |
| `--surface-1` | fg 2.5% mix | fg 2.5% mix | Elevated panels (~#f8f8f8 / ~#0f1011) |
| `--surface-2` / `--muted` | fg 4.5% mix | fg 4.5% mix | Hover fills, muted wells |
| `--surface-3` | fg 7% mix | fg 7% mix | Stronger elevation |
| `--text-secondary` | fg 78% mix | fg 78% mix | Subheadings, nav |
| `--text-tertiary` / `--muted-foreground` | fg 55% mix | fg 55% mix | Labels, meta |
| `--text-quaternary` | fg 40% mix | fg 40% mix | Placeholders, hints |
| `--border` | foreground @ 10% | foreground @ 10% | Panels, inputs, cards |
| `--secondary` | foreground @ 5% | foreground @ 5% | Ghost hover fills |
| `--ring` | foreground @ 22% | foreground @ 22% | Focus (not accent) |
| `--overlay` | `oklch(0 0 0 / 0.5)` | same | Modal scrim (both modes) |

Typography (Inter Variable, weights 510/590, cv01+ss03, opsz auto) is identical in light and dark; only chrome colors change.

### Primary (system blue, CTAs only)

| Mode | Token | Value | Usage |
| --- | --- | --- | --- |
| Light | `--accent` / `--primary` | `oklch(0.603 0.218 257.4)` (#007AFF) | Export, Create, Send, Confirm |
| Dark | `--accent` / `--primary` | `oklch(0.624 0.206 255.5)` (#0A84FF) | Same |
| Both | `--primary-foreground` | `oklch(1 0 0)` | Text on primary buttons |

Secondary, ghost, and nav items stay grey. Do not route accent into borders, rings, or selected nav states.

### Semantic (UI status)

Sourced from [oklch.fyi Radix palettes](https://oklch.fyi/color-palettes). Desaturated enough for alerts, more vivid than previous revision.

| Role | Light | Dark |
| --- | --- | --- |
| Success | `oklch(0.579 0.179 145)` | `oklch(0.623 0.178 145)` |
| Destructive | `oklch(0.55 0.18 25)` | `oklch(0.62 0.18 25)` |
| Info | `oklch(0.55 0.03 250)` | `oklch(0.72 0.03 250)` |

### Editor tracks (saturated OKLCH)

Timeline and inspector clips use Radix step 9-10 equivalents from oklch.fyi. Functional color for scanability on grey lanes.

| Track | OKLCH | Palette source |
| --- | --- | --- |
| Live | `var(--success)` (green) | [Green](https://oklch.fyi/color-palettes/green) step 10 light / step 9 dark |
| B-roll | `oklch(0.623 0.178 210)` | [Cyan](https://oklch.fyi/color-palettes/cyan) step 9 |
| Zoom | `oklch(0.676 0.184 75)` | [Amber](https://oklch.fyi/color-palettes/amber) step 10 |
| Title | `oklch(0.657 0.183 25)` | [Tomato](https://oklch.fyi/color-palettes/tomato) step 9 |

Defined in `themes/openklip.json` (`editor` block) and `app/theme-base.css` fallbacks. Alternate theme presets (Catppuccin, Nord, etc.) may override; default skin follows the table above.

## Spacing

- **Base unit:** 4px (`--spacing: 0.25rem`)
- **Density:** Comfortable-compact (dense editor, slightly more air in onboarding/empty states)
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48)

## Layout

- **Approach:** Grid-disciplined
- **Editor regions:** Fixed zones (sidebar, player, transcript, timeline, agent panel). Borders separate regions; no drop shadows.
- **Max content width:** Full viewport (editor tool, not marketing)
- **Border radius:** `--radius: 0.5rem` (8px) default; `--radius-sm` 6px for controls

## Icons

- **Library:** [Phosphor](https://phosphoricons.com) via `@phosphor-icons/react`, **fill** weight only in chrome.
- **Import path:** `@/lib/icon` (`web/lib/icon.tsx`). Do not import `lucide-react` or Phosphor directly in components.
- **Wrapper:** Every export sets `weight="fill"` and `data-ui-icon` for default chrome coloring.
- **Sizes:** `size-3` (12px) for dense lists; `size-3.5` (14px) for sidebar rows and timeline track glyphs; `size-4` (16px) for controls and menus. Match existing component scale; do not oversize fill icons.
- **Color:**
  - Standalone chrome icons: `--icon-foreground` (55% foreground mix, same step as `--text-tertiary`). Applied via `[data-ui-icon]` in `app/theme-base.css`.
  - Icons inside `<button>` / `[role="button"]`: `color: inherit` so primary, ghost, and destructive buttons keep correct contrast.
  - Explicit overrides: `text-tertiary`, `text-destructive`, `text-white/75` (player chrome) beat the default when needed.
- **Exceptions:** Agent provider logos stay custom SVGs in `web/components/ui/svgs/` (`AgentProviderIcon`). Timeline track colors stay semantic (green/cyan/amber/tomato), not icon-library decoration.
- **Adding an icon:** Export a new Lucide-compatible name from `web/lib/icon.tsx` mapping to the Phosphor glyph; keep fill default.

## Motion

- **Approach:** Minimal-functional
- **Easing:** `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`
- **Duration:** micro 50-100ms, short 150-200ms (panels, menus, sheets), medium 250-400ms (modals only)
- **Rule:** Motion aids comprehension (open/close, drag feedback). No decorative entrance choreography.

## Theme Architecture

- **Stack:** shadcn/ui v4 (new-york) + Tailwind v4 + Radix primitives
- **Presets:** JSON files in `themes/*.json`, injected by theme engine into `#openklip-theme-vars`
- **Default preset:** `openklip` (monochrome + system blue)
- **Token dialect:** Prefer semantic tokens (`border-border`, `bg-secondary`) in components; `foreground-N` mixes for editor-specific tints

## Anti-patterns

- Purple/violet gradients or accent-heavy chrome
- Blue on secondary, ghost, nav selected, focus rings, or badges
- Shadow-heavy cards in the editor shell
- Hand-rolled hex in components when a CSS variable exists
- Em dash character in UI copy (project rule)

## Decisions Log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-06-28 | Initial design system | `/design-consultation`: agent-native builder posture, memorable thing "blue only when it matters" |
| 2026-06-28 | Inter retained | User preference; matches ChatGPT-adjacent monochrome shell |
| 2026-06-28 | Saturated OKLCH track colors | Radix palettes from oklch.fyi (green/cyan/amber/tomato steps 9-10) for timeline scanability |
| 2026-06-28 | System blue primary only | #007AFF / #0A84FF on primary CTAs; grey everything else in chrome |
| 2026-06-28 | Linear-style typography | Inter Variable, weights 510/590, cv01+ss03, opsz auto, 1.6 leading, JetBrains Mono for code |
| 2026-06-28 | Light/dark chrome parity | OKLCH surface ladder, text hierarchy tokens, Linear-aligned base fg/bg, shared overlay |
| 2026-06-28 | Phosphor fill icons | Solid glyphs at 55% `--icon-foreground` soften monochrome chrome vs Lucide strokes; buttons inherit parent color |
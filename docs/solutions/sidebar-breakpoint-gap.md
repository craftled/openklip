---
title: "Hide shadcn sidebar gaps at the layout boundary"
status: active
created: 2026-07-06
source: compound
kind: pitfall
confidence: high
tags:
  - "sidebar"
  - "responsive-layout"
  - "right-rail"
  - "shadcn"
files:
  - "web/components/editor/editor-right-rail.tsx"
  - "web/components/ui/sidebar.tsx"
  - "tests/editor-right-rail.test.tsx"
---

# Hide shadcn sidebar gaps at the layout boundary

## Problem

The shadcn `Sidebar` primitive renders a desktop gap element separately from the fixed sidebar container. Hiding only the sidebar container with responsive classes can leave an invisible-but-layout-affecting gap at widths where the app does not intend to show that sidebar.

## Context / Evidence

PR #81 moved the right chat rail onto the shared `Sidebar` primitive. A review found that `className="hidden xl:flex"` on the `Sidebar` hid the fixed chat rail below `xl`, but the primitive still rendered its `md:block` gap. The symptom was a blank 20rem right column on tablet/small-desktop widths. The fix wrapped the whole right rail in `hidden xl:contents`, so both the primitive gap and fixed rail disappear below `xl`.

## Solution Pattern

When a sidebar should not participate in layout at a breakpoint, hide a parent wrapper around the entire `Sidebar` instance, not only the primitive's inner container. Use `contents` at the active breakpoint when the wrapper itself should not add another box.

## Reuse When

- Adding a conditional left or right rail with `web/components/ui/sidebar.tsx`.
- Applying breakpoint-specific visibility to a `Sidebar`.
- Debugging unexpected blank columns or layout shrinkage around editor rails.

## Do Not Reuse When

- The sidebar should remain collapsed but still reserve icon/gap space.
- The primitive itself is being changed for all sidebars; prefer a shared primitive update only when both left and right rails need the same behavior.

## Verification

- `bun test tests/editor-right-rail.test.tsx tests/editor-column.test.tsx tests/chat-timeline.test.ts`
- `bun test`
- `bun run check`
- `bun run typecheck`
- `bun run build`
- Puppeteer responsive check at 1024px, 1279px, and 1280px: one nonzero sidebar gap below `xl`, two at `xl`, no console errors, no failed requests.

## Tradeoffs / Risks

`display: contents` intentionally removes the wrapper's box. Do not attach layout styles that rely on the wrapper box itself unless replacing this pattern.

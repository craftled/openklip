---
title: "Keep Turbopack runtime externals behind explicit runtime boundaries"
status: active
created: 2026-07-07
source: compound
kind: pitfall
confidence: high
tags:
  - "turbopack"
  - "next-dev"
  - "ffmpeg-static"
  - "ffprobe-static"
  - "shiki"
  - "ssr"
files:
  - "src/ffmpeg.ts"
  - "web/components/history-transcript-diff.tsx"
---

# Keep Turbopack runtime externals behind explicit runtime boundaries

## Problem

Next dev with Turbopack can rewrite external packages into hashed module ids during server rendering. If a server chunk then tries to resolve a native binary package or a heavy syntax-highlighting dependency through that hashed id, dev startup can fail even though the same package is installed.

## Context / Evidence

On 2026-07-07 the local editor failed at `http://localhost:4400/` with two Turbopack resolver errors:

- `Cannot find package 'ffmpeg-static-...'` from `src/ffmpeg.ts`
- `Cannot find package 'shiki-...'` while rendering the history transcript diff path

The code truth fix was:

- `src/ffmpeg.ts` now resolves `ffmpeg-static` and `ffprobe-static` at Node runtime through `createRequire`, with `ffmpeg` / `ffprobe` CLI fallbacks.
- `web/components/history-transcript-diff.tsx` dynamically imports the `@pierre/diffs` transcript diff renderer with `ssr: false`, so Shiki stays out of the server render path.

## Solution Pattern

For packages that are native binaries, optional runtime tools, or browser-heavy renderers, avoid top-level server-render imports from shared modules. Use a Node runtime resolver for binary paths and put browser-only visualization dependencies behind a client component or dynamic import with server rendering disabled.

## Reuse When

- Adding another static binary package used by CLI, API routes, or server actions.
- Importing syntax highlighting, rich diff, WebGL, or browser-first rendering code from a component that can be reached during SSR.
- Debugging a Next dev error that names a package with a hashed suffix such as `package-name-<hash>`.

## Do Not Reuse When

- The dependency is a normal ESM/CJS library that must participate in server rendering and is already resolved reliably by Next.
- The code path runs only in the CLI outside the Next app and does not enter bundled server chunks.

## Verification

- `bun run typecheck`
- Targeted `bun run check` on the touched source files.
- `bun test` on 2026-07-07: 1904 tests, 1901 pass, 3 skip without `OPENKLIP_INTEGRATION=1`.
- Local browser check at `http://localhost:4400/` after the runtime fixes.

## Tradeoffs / Risks

Runtime `createRequire` keeps the binary lookup explicit, but it means missing static packages fall back to the system `ffmpeg` / `ffprobe` binaries and can fail later if neither exists. Client-only dynamic imports avoid SSR resolver failures, but the first render of that panel waits for the browser bundle.

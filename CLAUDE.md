# CLAUDE.md

Project guidance for AI agents working in OpenKlip.

## Design System

The visual language uses default shadcn/ui tokens with Base UI primitives: `app/globals.css` and `app/editor-tokens.css`.
Light/dark mode is toggled via the `.dark` class (`web/lib/theme-preferences.ts`).
Icon imports go through `@/lib/icon`.

## Agent workflow

See `AGENTS.md` for the full OpenKlip edit loop, CLI commands, MCP tools, and guardrails.

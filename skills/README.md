# OpenKlip agent skills

Optional playbooks for Cursor, Claude Code, Codex, and other agents that support the [skills CLI](https://github.com/vercel-labs/skills).

These mirror `templates/<id>/skill.md` in the repo. Install one skill or the whole set:

```bash
npx skills add <owner>/openklip --skill openklip-motion-canvas
npx skills add <owner>/openklip --skill openklip-motion-graphics
npx skills add <owner>/openklip --skill openklip-motion-shorts
npx skills add <owner>/openklip --skill openklip-editing
```

When OpenKlip MCP is enabled, agents can also call `load_skill` with template ids (`motion-canvas`, `motion-graphics`, …) without installing these files.

| Skill folder | Template id | Use for |
| --- | --- | --- |
| `openklip-motion-canvas` | `motion-canvas` | Blank-canvas motion pieces |
| `openklip-motion-graphics` | `motion-graphics` | Motion overlays on footage |
| `openklip-motion-shorts` | `motion-shorts` | Beat-synced shorts |
| `openklip-editing` | `talking-head` | Talking-head cut and polish |

See `AGENTS.md` for the full CLI and MCP surface.

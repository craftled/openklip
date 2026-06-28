# AGENTS.md

Single source of truth for AI agents working in this repo: OpenKlip editing workflow, guardrails, copy rules, and code standards.

---

# OpenKlip agent skill

OpenKlip is a local-first, agent-native video toolchain: external agents run the edit loop via CLI; the browser reviews the same `project.json`.

## The file model (read this first)

Each project lives as plain files under `projects/<slug>/` in a layered layout. The parent directory is resolved by `projectsRoot()`:

1. `OPENKLIP_PROJECTS_ROOT` if set
2. else `.openklip/projects-root` in the app cwd (GUI folder picker)
3. else `~/Movies/OpenKlip`

```
projects/<slug>/
  project.json            the EDL - the edit itself (the only file you edit)
  assets/                 user originals (flat): drop b-roll, music, stills here
  working/                derived media + scratch: proxy.mp4, transcript.json,
                          audio16k.f32, frames/, asset proxies, chats.json…
  output/out.mp4          the rendered export
```

Edit templates (repo root, not per project):

```
templates/<id>/skill.md   agent playbook (cuts, overlays, export loop)
```

Optional `template` field on `project.json` points at a template id (e.g. `talking-head`).

**`project.json` IS the edit.** It holds every transcribed word with a `deleted` flag, b-roll overlays, still (Ken Burns) overlays, push-in zooms, title cards, captions settings, and look flags. Everything under `working/` and `output/` is regenerated from it. The GUI editor and these CLI commands both read and write this same file; they are **equivalent (parity)**. Edit it through the CLI; the browser editor will show the same result, and vice-versa.

Time is integer audio samples at 48 kHz. The CLI takes seconds where a human number is natural (overlay spans) and converts for you.

## Capability map

| User action (GUI) | Agent command |
| --- | --- |
| List projects | `openklip list` |
| Ingest a video | `openklip ingest <video> [--force]` |
| Open editor | `openklip serve [slug]` |
| Read transcript (full) | `openklip transcript <slug>` |
| Grep transcript | `openklip transcript grep`, `span`, `phrase` |
| Review edit (JSON) | `openklip status <slug> --json`, `ranges`, `overlays` |
| Cut / restore words | `openklip cut`, `openklip restore` |
| Register b-roll file | `openklip broll <slug> <file>` |
| List b-roll assets | `openklip assets <slug>` |
| Place / patch / remove b-roll | `openklip broll-add`, `broll-set`, `broll-rm`, `broll-add-phrase` |
| Place / remove still (Ken Burns) | `openklip still-add`, `still-rm` |
| Place / patch / remove title | `openklip title-add`, `title-set`, `title-rm`, `title-add-phrase` |
| Add / patch / remove zoom | `openklip zoom-add`, `zoom-set`, `zoom-rm`, `zoom-add-phrase` |
| Reorder overlay (paint order) | `openklip reorder <slug> <broll\|title\|zoom> <id> <toIndex>` |
| Apply brand preset (look defaults) | `openklip brand <slug> <name>` |
| Set edit template (agent skill) | `openklip template set <slug> <id>` |
| List / show edit templates | `openklip template list`, `openklip template show <id>` |
| Toggle captions | `openklip captions <slug> on\|off` |
| Caption line length | `openklip captions-max <slug> <n>` |
| Toggle vignette | `openklip look <slug> vignette on\|off` |
| Cut boundary padding | `openklip pad <slug> <ms>` |
| Review edit | `openklip status <slug>` (`--json` for agents) |
| Kept ranges / overlays | `openklip ranges <slug>`, `openklip overlays <slug>` |
| Check environment / project health | `openklip doctor [slug]` |
| List ingester plugins | `openklip ingesters` |
| List the action registry (mutations only) | `openklip actions` |
| List all agent tools (query + mutate + export) | `openklip tools` |
| MCP server (stdio) | `openklip mcp` or `bun run mcp` |
| Export MP4 | `openklip export <slug>` |
| Post-export packaging (HyperFrames) | `openklip package <slug> <pass>` |

## Commands

Run as `bun run src/cli.ts <command>` (or the `openklip` bin).

### Discovery

| Command | What it does |
| --- | --- |
| `openklip list` | List all projects, most recent first. |
| `openklip assets <slug>` | List registered b-roll assets with ids and durations. |

### Transcript (read)

Prefer bounded reads over dumping the full transcript. Use `--json` for machine parsing.

| Command | What it does |
| --- | --- |
| `openklip transcript <slug>` | Print every word as `index  id  mm:ss  text  [cut]`. Use on short clips only. |
| `openklip transcript grep <slug> "phrase" [--all] [--json]` | Find phrase runs: word ids, seconds, matched text. |
| `openklip transcript span <slug> <w12\|w12-w20> [--context N] [--json]` | Slice words around ids (default context 0). |
| `openklip transcript phrase <slug> "phrase" [--json]` | First match span (`fromSec`, `toSec`, ids) for overlay placement. |

### Transcript edits

| Command | What it does |
| --- | --- |
| `openklip transcript <slug>` | Print every word as `index  id  mm:ss  text  [cut]`. Read this before editing. |
| `openklip cut <slug> <tokens...>` | Mark words deleted. Tokens are word ids (`w12`) or inclusive ranges (`w12-w20`). |
| `openklip cut <slug> --text "phrase"` | Cut the first contiguous run matching the phrase (case/punctuation-insensitive). |
| `openklip cut <slug> --text "phrase" --all` | Cut **every** matching run (e.g. repeated filler words). |
| `openklip cut <slug> <tokens...> --restore` | Restore the listed words instead of cutting them. |
| `openklip restore <slug>` | Restore every word (clear all cuts). |

### Overlays

| Command | What it does |
| --- | --- |
| `openklip broll <slug> <file>` | Register a b-roll clip (builds preview proxy, returns asset id). |
| `openklip broll-add <slug> <assetId> <fromSec> <toSec>` | Cover a source-time span with a registered asset. |
| `openklip broll-add-phrase <slug> <assetId> "spoken phrase"` | Cover the span of the first spoken phrase match. |
| `openklip broll-set <slug> <brollId>` | Patch b-roll: `--asset`, `--from`, `--to`, `--src-in` (seconds). |
| `openklip broll-rm <slug> <brollId>` | Remove a b-roll clip. |
| `openklip title-add <slug> <fromSec> <toSec> <text>` | Burn a title card. `--position lower\|center\|hero` (default lower). Use `\n` for two lines. |
| `openklip title-add-phrase <slug> "spoken" "title text"` | Place a title at the first spoken phrase match (min 2s span). |
| `openklip title-set <slug> <titleId>` | Patch title: `--text`, `--position`, `--from`, `--to`. |
| `openklip title-rm <slug> <titleId>` | Remove a title card. |
| `openklip zoom-add <slug> <fromSec> <toSec>` | Push-in zoom. `--scale 1.15` (1–3), `--ramp 0.6` (0–5 sec). |
| `openklip zoom-add-phrase <slug> "spoken phrase"` | Push-in zoom at the first spoken phrase match. |
| `openklip zoom-set <slug> <zoomId>` | Patch zoom: `--scale`, `--ramp`, `--from`, `--to`. |
| `openklip zoom-rm <slug> <zoomId>` | Remove a push-in zoom. |
| `openklip still-add <slug> <assetId> <fromSec> <toSec>` | Overlay a registered **still** image with a Ken Burns push-in. `--scale 1.2` (1–3), `--focus-x 0.5` / `--focus-y 0.5` (0–1 image coords). |
| `openklip still-rm <slug> <stillId>` | Remove a still overlay. |
| `openklip reorder <slug> <broll\|title\|zoom> <id> <toIndex>` | Restack an overlay within its track. Array order is paint order: a later index paints on top (matters when b-roll covers overlap). |

### Look & captions

| Command | What it does |
| --- | --- |
| `openklip captions <slug> <on\|off>` | Toggle burned captions for export. |
| `openklip captions-max <slug> <n>` | Words per caption line (1–12). |
| `openklip look <slug> vignette <on\|off>` | Toggle vignette. |
| `openklip pad <slug> <ms>` | Symmetric padding around kept ranges (0–500 ms). |
| `openklip brand <slug> <name>` | Apply a brand preset (`brands/<name>.json`): sets caption/vignette/pad **defaults** only. `project.json` stays the edit; words and overlays are untouched. Also available at ingest: `openklip ingest <video> --brand <name>`. |
| `openklip template list` | List edit templates (`templates/<id>/skill.md`): agent playbooks for cuts, overlays, and export. |
| `openklip template show <id>` | Print a template skill file. |
| `openklip template set <slug> <id>` | Attach a template id to `project.json` (GUI template dropdown writes the same field). |

### Review & export

| Command | What it does |
| --- | --- |
| `openklip status <slug>` | Full edit summary: words, ranges, overlays, look, captions, runtime. |
| `openklip status <slug> --json` | Same data as compact JSON (preferred for agents). |
| `openklip ranges <slug> [--json]` | Kept source-time segments after cuts and pad. |
| `openklip overlays <slug> [--json]` | All b-roll, titles, zooms, stills with ids and spans. |
| `openklip export <slug>` | Render the current cut to `out.mp4`. `--height 1080` for max output height. |
| `openklip doctor [slug]` | Health check: ffmpeg/ffprobe binaries, Whisper script, and (with a slug) the project's `project.json`, source/proxy media, and asset proxies. Exits non-zero if any check fails. Run it when the agent loop fails deep inside a subprocess. |
| `openklip ingesters` | List ingester plugins (`ingesters/<id>/ingester.json`): declarative seams for non-file media import (URL, batch, etc.). |
| `openklip actions` | **Mutations only:** every `project.json` edit action (cut, broll, title, zoom, still, captions, look, pad, reorder). `--json` emits JSON Schema (`inputSchema` shape). |
| `openklip tools` | **Full agent surface:** query tools (`transcript_grep`, `project_status`, …), registry mutations, phrase-add helpers, and `export`. Same manifest the MCP server exposes. `--json`; `--surface mcp` filters. |
| `openklip mcp` | Start the MCP stdio server (`src/mcp-server.ts`). Cursor: `.cursor/mcp.json` in repo root. Set `OPENKLIP_PROJECTS_ROOT` in the server env if projects live outside the repo. |
| `openklip package <slug> <pass>` | Optional post-export pass on `output/out.mp4` via the HyperFrames CLI: `remove-background` (→ transparent `.webm`, the matte primitive for embed-behind-subject) or `transcribe` (→ `.srt`). Uses the local `node_modules/.bin/hyperframes` if installed (`bun add -d hyperframes`); runs Chrome + our bundled ffmpeg. Fails with install instructions if absent. |

## Recommended workflow

1. **Discover.** `openklip list` to pick a project, or `openklip ingest <video>` to create one. Re-ingest requires `--force` (wipes the project).
2. **Read first.** `openklip transcript grep <slug> "phrase"` or `transcript phrase` for spans; use full `transcript` only on short clips. `openklip status <slug> --json` for edit health.
3. **Decide cuts.** Identify filler, false starts, and tangents. Prefer cutting whole sentences, not single words.
4. **Edit.** `openklip cut <slug> w12-w20` (or `--text "the part to remove"`). Add overlays with `broll-add`, `title-add`, `zoom-add`. Patch with `*-set` commands. Toggle look with `look` and `captions`.
5. **Check.** `openklip status <slug>`: confirm runtime, overlay ids, and range count look right.
6. **Export.** `openklip export <slug>` when the cut is good.

## MCP (Cursor, Claude Desktop, Codex)

All MCP tools route through `src/agent-tools.ts` → `mutateProject` / `runAction` / query helpers. The browser GUI writes the same `project.json`; reload the editor after MCP edits.

**Enable in Cursor:** the repo ships `.cursor/mcp.json`. Restart MCP or reload the window after pulling.

**Tool layers:**

| Layer | MCP tool names | Same as CLI |
| --- | --- | --- |
| Query | `list_projects`, `transcript_grep`, `transcript_phrase`, `project_status`, `project_overlays`, … | `openklip transcript grep`, `status --json`, `overlays --json` |
| Mutate | `cut`, `cut-text`, `broll-add`, `title-set`, … | `openklip cut`, `broll-add`, … |
| Phrase compose | `title-add-phrase`, `zoom-add-phrase`, `broll-add-phrase` | `openklip title-add-phrase`, … |
| Render | `export` | `openklip export` |

**Inspect the manifest:** `openklip tools --json --surface mcp`

**Parity rule:** every registry action with `surfaces` including `mcp` is an MCP tool with `{ slug, … }` input. Query tools use snake_case names; mutations keep registry kebab-case names (`broll-add`).

## Agent loop

OpenKlip ships no LLM. An external agent (Claude Code, Codex, Cursor, Grok) drives the loop:

```
read  → openklip list / status --json / transcript grep / overlays
plan  → decide phrases, spans, overlays (agent judgment)
act   → openklip cut / broll-add / zoom-add / …
verify→ openklip status
done  → openklip export
```

**Demo script** (deterministic, no LLM): cuts a phrase list and optionally exports.

```bash
bun run agent-demo <slug> --phrases scripts/example-phrases.txt
bun run agent-demo <slug> --all "you know" "sort of" --export
bun run agent-demo <slug> --phrases phrases.txt --dry-run   # preview only
```

## Editing guardrails

- **Cut whole sentences, not single words.** Removing one word mid-sentence usually leaves an audible jump; cut the full thought.
- **Keep b-roll spans short**: roughly 2–6 seconds. Long covers hide the speaker and feel like a different video.
- **Captions are on by default.** Only turn them off if the project explicitly shouldn't have them.
- **Never hand-edit `project.json`** when a command exists for the change. The commands validate the schema and keep the GUI in sync; manual edits can desync or corrupt the file.
- After cutting, run `openklip status` before `openklip export` so you don't render an empty or near-empty cut.
- Run `openklip assets <slug>` before `broll-add` so you have valid asset ids.
- Reload the browser after CLI edits to see changes in the editor.
- Server-side `project.json` writes serialize per-slug in-process (`mutateProject`). Concurrent **processes** (CLI + running server) can still race; prefer one writer at a time.

## Context at session start

When working on a project, gather state before editing:

```
openklip list                          # which projects exist
openklip status <slug>                 # current edit health + overlay ids
openklip transcript grep <slug> "phrase"  # bounded read (prefer over full dump)
openklip status <slug> --json             # edit health + overlay ids
openklip overlays <slug> --json           # structured overlay list
openklip assets <slug>                 # b-roll asset ids (if adding b-roll)
```

The agent and the GUI share the same `projects/` directory.

---

# Project rules

## No em dashes

Do **not** use the em dash character (`—`, U+2014) anywhere in this project.

This applies to:

- README, AGENTS.md, TODO.md, CHANGELOG.md, and other docs
- User-facing UI strings (labels, tooltips, errors, assistant hints)
- GitHub release notes and commit messages when writing project copy

Use instead:

- **Colon** for title: detail (`Agent-native video toolchain: CLI edit loop`)
- **Comma** or **period** for clause breaks
- **Hyphen** `-` only for compound words and flags (not as a sentence dash)

En dashes (`–`) for numeric ranges (e.g. `2-6 seconds`) are fine; em dashes are not.

## README policy

**README = what exists in code today.** Philosophy and principles should describe implemented behavior. Roadmap, aspirations, and post-MVP items belong in **TODO.md** only.

---

# Ultracite code standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

### Documentation

- Add comments for complex logic, but prefer self-documenting code
- **No em dashes** in docs, UI copy, release notes, or user-visible strings (see above)

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code
7. **No em dashes** - Do not use `—` in docs, UI copy, or release notes

Run `bun x ultracite fix` before committing to ensure compliance.

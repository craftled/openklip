# Changelog

## 0.8.8.0 - 2026-06-28

Grade control room: continuous color knobs on top of the base grade, with a live single-frame preview, across CLI, GUI, and MCP.

### Added
- **Color adjust (`look.color`)**: five continuous knobs layered on the named grade: temperature, tint, brightness, contrast, saturation. Maps to a deterministic ffmpeg chain: colorbalance (temp/tint), then eq (contrast/brightness/saturation), in the deck's order. Absent or all-neutral emits no filter and is dropped from the EDL.
- **`openklip look <slug> color`**: set any subset of knobs (`--temp`, `--tint`, `--bright`, `--contrast`, `--sat`) or `--reset`. Only the passed knobs change. Mirrored as the `look-color` registry action, so the GUI and an MCP agent drive the same mutation.
- **Grade control room (GUI)**: a dialog with the five knobs as live sliders, a base-grade picker, and hold-to-compare. Each slider previews on a real frame and writes `project.json` on release: no "copy a prompt" round trip, unlike the source deck. The agent can set the look from chat; the human nudges here.
- **Preview-frame endpoint** (`GET /api/projects/<slug>/preview-frame`): renders one graded frame (LUT then grade then color, the exact export order) so tuning is instant. Query overrides let the GUI preview unsaved values; with no overrides it shows the committed look.

## 0.8.7.1 - 2026-06-28

Hotfix the 0.8.7.0 release: green up typecheck/CI, sync the version, and refine the player transport bar.

### Fixed
- **Typecheck**: `web/lib/timeline-zoom.ts` `sampleToPx` was missing `zoom` in its parameter type, so `tsc --noEmit` (and CI) failed on the 0.8.7.0 release.
- **Version drift**: `package.json` was left at 0.8.6.0 while `VERSION` read 0.8.7.0; both now read 0.8.7.1.

### Changed
- **Player controls**: smaller transport icons and tighter spacing, bold tabular timecodes, slimmer scrubber handle.

## 0.8.7 - 2026-06-28

Editable timeline with CLI parity, export verify loop, color grade/LUT, and inbox ingest.

### Added
- **Timeline editor**: drag overlay clips, trim edges, click words to cut/restore (shift for range select). Toolbar snap toggle and zoom (25%-400%). Snaps to word edges, overlay boundaries, and playhead.
- **`still-set`**: patch still overlays on CLI and registry (GUI timeline writes the same mutations).
- **Verify cut**: `openklip verify <slug>` re-transcribes `output/out.mp4` and diffs against the EDL (filler survivors, leaked cuts, coverage). **Verify cut** button in the editor runs the same loop locally.
- **Color grade + LUT**: `openklip look <slug> grade <name>` and `openklip look <slug> lut <name>`; bundled `luts/` for portable `.cube` references.
- **Motion feel**: `openklip motion <slug> --speed` scales overlay animation durations at export.
- **Inbox ingest**: loose videos in the projects root auto-ingest via folder watch (`scan-inbox` API + GUI hook).

### Changed
- **Properties panel**: removed duplicate app settings (export height, theme, default agent); left sidebar Settings is the single source.
- **Agent chat**: removed the `working/chats.json` footer under the chatbox (documented in README).

### Tests
- Timeline clip edit, snap, and zoom unit tests; verify, grade, LUT, inbox, and ingest-jobs coverage.

## 0.8.6 - 2026-06-28

**Describe media** now logs the main video's scenes, not just b-roll cards.

### Added
- **Scene log**: `openklip analyze` and **Describe media** run a subagent over ingest frames (`working/frames/`) to write `sceneLog` on `project.json`: what is on screen per span, optional `onScreen` type, and `brollOpportunity` flags. Chat and MCP edit prompts include the log so the agent targets cover opportunities.
- **MCP query `scene_log`**: agents can read the persisted scene log without dumping `project.json`.

### Changed
- **Describe media** button always visible (scene log can run even with no b-roll in the bin). Label copy: "reading your media" / "Describe media".

## 0.8.5 - 2026-06-28

Chat does edits, not advice; editor layout puts chat in a resizable right column; plus asset cards and an icon pass.

### Added
- **Agentic chat edits**: for Claude, free-text chat now loads the openklip MCP server and calls the edit tools (cut, zoom, b-roll, title, template, export) to DO the edit, replying with a one-line confirmation instead of CLI instructions. Verified end-to-end (a chat "add a push-in zoom on hello world" wrote the zoom to project.json). Non-Claude agents fall back to a read-only answer.
- **Resizable chat sidebar**: chat lives in a full-height right column; drag the edge handle to resize (340–760px), width persists in localStorage, keyboard-accessible.
- **Asset cards / Analyze assets**: click **Describe assets** in the asset bin or run `openklip analyze <slug>` to fan out per-asset subagents that write summary, tags, and bestFor onto each b-roll/still so the editing agent places media by meaning.
- **Phosphor fill icons**: replaced Lucide stroke icons with `@phosphor-icons/react` (fill weight) via a shared `web/lib/icon.tsx` wrapper across the editor shell.

### Changed
- **Editor layout**: chat moved from below the video to the right sidebar; Settings + Inspector ("Properties") moved below the video, toggled with the transcript. More vertical room for reading chat.
- **Icon chrome**: default UI icon color uses `--icon-foreground` (55% foreground mix) so fill icons sit softer on grey chrome; icons inside buttons still inherit parent color.
- **Prompts**: the chat assistant no longer emits CLI commands or how-to text.

### Fixed
- **Invisible chat text**: assistant messages used `text-secondary` (the 5%-opacity fill token); switched to `text-foreground`.

## 0.8.4 - 2026-06-28

Free-text chat now drives the selected agent CLI for real, instead of replying with a canned hint.

### Added
- **Live chat replies**: typing in the agent chat spawns the selected agent (`claude -p`, etc.) with the project transcript as context and shows its real answer. `chatWithAgent` server action + `runAgentText`/`buildChatPrompt` in the agent driver. Verified end-to-end against the live Claude CLI (`--output-format json` → `.result`).
- **Graceful fallback**: when no agent is installed/connected, chat still returns the deterministic "run this CLI loop" hint.
- **Conversation UI**: chat transcript uses the AI SDK `Conversation` element (`@ai-elements/conversation`) for auto-scroll-to-bottom and a scroll-to-latest button, replacing the manual `ScrollArea`.

### Changed
- **Agent driver generalized**: `runFillerAgent` now composes `runAgentText` (the generic headless runner); filler-cut behavior is unchanged. Spawns close stdin so a headless CLI never blocks on input.
- **Removed template picker** from the player header (templates are applied via the skills selector).

### Fixed
- **Invisible chat text**: assistant messages used `text-secondary`, which resolves to the 5%-opacity `--secondary` fill token, not the `--text-secondary` text token. Switched to `text-foreground`.
- **Path tests**: `withDefaultProjectsRoot` now pins `OPENKLIP_PROJECTS_ROOT` to a temp `projects/` dir, decoupling the layered-layout assertions from the projects-root default (which moved to `~/Movies/OpenKlip` in 0.8.3).

## 0.8.3 - 2026-06-28

Workspace folder is user-chosen; the repo is no longer used as scratch.

### Changed
- **Projects root fallback**: defaults to `~/Movies/OpenKlip` (macOS video convention, matching iMovie/Final Cut) instead of `./projects` inside the repo. Resolution order unchanged: `OPENKLIP_PROJECTS_ROOT` → GUI-picked folder (`.openklip/projects-root`) → `~/Movies/OpenKlip`.

### Removed
- **In-repo `projects/` folder**: deleted the bundled scratch directory and dropped its `.gitignore` entry; project data now lives outside the repo.

## 0.8.2 - 2026-06-28

Full Linear-style UI refactor: semantic tokens wired through components, CTA hierarchy enforced, timeline colors aligned.

### Changed
- **CTA hierarchy**: Export and Choose video use primary blue; skill tokens stay grey (blue only when it matters).
- **Semantic tokens**: `text-tertiary`, `text-quaternary`, `bg-surface-*` adopted across editor shell; `text-muted-foreground` removed from `web/`.
- **Timeline tracks**: music, stills, and titles use theme tokens (`info`, `zoom`, `title`); violet and arbitrary Tailwind hues removed.
- **Primitives**: inputs use `text-ui`, placeholders `text-quaternary`, focus rings normalized to 1px, hover-card and skills menu use `popover-styled`.
- **Typography**: transcript and chat panels use `text-ui` / `text-section-label`; caption inactive words use `text-white/70` on player.

### Fixed
- **Typecheck**: `defineQueryTool` generics, MCP `ZodRawShapeCompat`, and `StepPill` boolean props (`agent-tools.ts`, `mcp-server.ts`, `new-project-dialog.tsx`).
- **Asset folder sync loop**: `AssetBin` stores `onAssetsUpdated` in a ref so parent re-renders no longer retrigger hundreds of sync polls per second.

## 0.8.1 - 2026-06-28

Linear-style design system: OKLCH surfaces, Inter Variable typography, and light/dark parity.

### Added
- **DESIGN.md**: design source of truth for typography, color, spacing, and motion.
- **CLAUDE.md**: points agents at DESIGN.md before any UI work.
- **JetBrains Mono**: mono font for timestamps, paths, and CLI snippets.
- **Surface ladder**: `--surface-0` through `--surface-3` and text hierarchy tokens (`--text-primary` through `--text-quaternary`).

### Changed
- **Inter Variable**: smooth 400-900 weights with Linear recipe (510/590/680, cv01+ss03, opsz auto).
- **OpenKlip preset**: light/dark foreground and background tuned for parity (~#fff / ~#08090a).
- **OKLCH mixes**: foreground shades and semantic text colors use oklch instead of srgb/oklab.
- **Modal overlays**: dialog, sheet, drawer, and alert-dialog use `bg-overlay` token.

## 0.8.0 - 2026-06-28

Agent query layer, MCP server, edit templates, and Codex-style skills in chat.

### Added
- **Bounded query reads**: `openklip transcript grep/span/phrase`, `ranges --json`, `overlays --json`, `status --json` for agent discovery without loading full transcripts.
- **Phrase placement helpers**: `title-add-phrase`, `zoom-add-phrase`, `broll-add-phrase` locate spoken spans and place overlays in one step.
- **MCP server**: `openklip mcp` (stdio) exposes 35 tools with CLI/GUI parity on `project.json`; `.cursor/mcp.json` wired for Cursor.
- **Edit templates**: `templates/` playbooks (e.g. talking-head), `openklip brand` / ingest `--brand`, template API route, and template skills in chat.
- **Skills chat UX**: `/` slash menu, Skills dropdown, and Codex-style inline skill tokens with follow-up text before send.
- **Empty workspace flow**: folder picker landing, new-project dialog, project create overlay, and Sonner toasts for uploads and actions.
- **84 new tests**: query, phrase-match, cli-query, agent-tools, skills-catalog, templates, motion, and toast coverage (387 total).

### Changed
- **AGENTS.md**: capability map for query commands, MCP, and phrase helpers.
- **Theme polish**: OpenKlip preset refresh, sidebar/chat motion, relative timestamps on chat list.
- **Project switcher**: inline create flow replaces `no-projects.tsx` empty state.

### Fixed
- **`projectMutations.ts`**: restore `edl.ts` schema imports broken when template support landed.

## 0.7.0 - 2026-06-28

Editor layout refresh, export options dialog, and configurable projects root (PR #12, PR #13).

### Added
- **Center chat panel**: agent threads and prompt input in the center column (`AgentChatPanel`, AI Elements `prompt-input`); chat list stays in the left sidebar.
- **Chat / Transcript toggle**: switch the center panel between agent chat and word-level transcript editing.
- **Timeline drawer**: edit timeline opens in a bottom drawer instead of a fixed footer strip.
- **Compact preview**: preview and chat capped at `max-w-2xl` with a shorter portrait height for readability on wide screens.
- **Find filler** above the preview (moved out of the sidebar footer).
- **Export options dialog** on the toolbar: pick 720p / 1080p / 4K before render; shows pixel dimensions and rough size/time estimates.
- **Workspace folder picker**: empty-state landing chooses a macOS folder via `POST /api/workspace`; path persists in `.openklip/projects-root`.
- **`GET /api/workspace`**: returns `{ root, pickerSupported }` for the active projects root.
- **Collapsible sidebar sections**: chats, assets, and settings use shadcn collapsible panels; settings moved to left sidebar (`SidebarSettingsPanel`).
- **Shared asset upload helpers** (`web/lib/asset-upload.ts`) used by the asset bin and chat `+` upload.

### Changed
- **Agent sidebar slimmed**: thread messages, model picker, find-filler, and send form removed from the footer; chat UX lives in the center panel.
- **Projects root resolution**: `OPENKLIP_PROJECTS_ROOT` env wins, then `.openklip/projects-root`, then `./projects` (`src/paths.ts`, `src/workspace-config.ts`).
- **Empty projects landing**: browser video upload replaced with folder picker + CLI ingest hint (`openklip ingest <video>`).

### Fixed
- **Nested-button hydration** in project switcher folder action (`ProjectInlineFolderAction` moved outside the dropdown trigger).
- **`paths.test.ts`** isolates default `./projects` layout from a local `.openklip/projects-root` file.

### Notes
- Export dialog **compression**, **frame rate**, and **clipboard** controls are visible but disabled until the ffmpeg pipeline supports them; only **resolution** (`maxHeight`) is wired today.
- Folder picker requires **macOS** (`osascript`); other platforms should set `OPENKLIP_PROJECTS_ROOT` or ingest from the CLI.

## 0.6.2 - 2026-06-28

Sidebar UX pass: asset bin fidelity, project lifecycle in the switcher, chat previews, and polish from PR #11.

### Added
- **Chat preview cards** on hover (`ChatPreviewRow`): title, project path, source video, edit stats, and message count.
- **In-progress chat indicator**: subtle spinner before the title while an agent run is active.
- **Project and assets folder actions**: reveal `projects/<slug>/` or `assets/` in Finder from the switcher and Assets heading (`POST /api/projects/:slug/reveal`).
- **Asset delete in sidebar**: hover trash with double confirmation; `DELETE /api/projects/:slug/assets/:assetId` prunes timeline overlays.
- **Project delete in switcher**: hover trash with double confirmation; `DELETE /api/projects/:slug` removes the project folder and switches to the next project.
- **Empty projects landing** when no projects exist, with **Create new project** (video picker) instead of "Ingest video".

### Fixed
- **Asset bin matches the drop folder.** Folder sync and page load prune registrations whose `src` is outside `projects/<slug>/assets/` or no longer exists on disk, and drop b-roll/still overlays that referenced them. Sync API returns updated `broll`/`stills` so client state stays in sync.
- **Page load survives sync errors.** `loadEditorProject` treats folder sync as best-effort so a bad drop or proxy build does not break the editor.
- **Find filler while chats load.** Button shows "Loading chats…" and disabled state; auto-ensures a thread if none is active when clicked.
- **SSR keyboard hints**: `useModShortcut` avoids hydration mismatch for ⌘ vs Ctrl labels.

## 0.6.1 - 2026-06-28

Reliability pass after the 0.6.0 editor shell refresh: serialize server-side writes, harden chats persistence, and fix sidebar layout.

### Changed
- **Project-wide write serialization.** All `project.json` mutations from the server (server actions, agent-driven filler cuts, asset sync, upload) go through one per-slug lock (`src/project-lock.ts`) via `mutateProject(slug, fn)`, so concurrent tabs or agent sessions cannot race the read-modify-write and lose an edit. `chats.json` mutations use a separate per-slug lock (`withChatsLock`) so chat writes stay responsive while an agent run holds the project lock. Replaces the narrower asset-only lock from early 0.6.0. Scope: in-process (one running server); concurrent processes still need OS file locking.

### Fixed
- **Sidebar asset overflow.** Long filenames in the asset bin no longer force horizontal scroll (`flex flex-col` + `min-w-0 overflow-hidden` on section rows).
- **`chats.json` no longer silently wipes on corruption.** `saveProjectChats` writes atomically (tmp + rename); `loadProjectChats` moves a corrupt file to `chats.json.bad-<ts>` and throws instead of returning empty.
- **Chats API returns 404 for unknown threads.** `append`/`rename`/`archive` respond 404 when `threadId` does not exist; `setActive` validates the thread before pinning.
- **Stills from outside `assets/` are copied in.** External still originals copy into `assets/` instead of storing a fragile `../../…` relative proxy.
- **Re-ingest no longer silently wipes an existing project.** `ingest` refuses when `project.json` already exists unless `--force` (CLI) or `?force=1` (upload API returns 409 Conflict).
- **Folder sync is POST, not a mutating GET.** `POST /api/projects/:slug/assets/sync` registers files dropped into `assets/`; `GET /assets` is read-only.

## 0.6.0 - 2026-06-26

Editor shell refresh: the asset bin, project chats, and theme picker now live in the left sidebar; the center column is preview, transcript, and timeline only.

### Added
- **Asset bin in sidebar**: drag-and-drop upload, grouped b-roll/music/stills, folder sync poll, and hover previews (`AssetBin`, `AssetPreviewRow`).
- **Project switcher**: switch projects, ingest video from the sidebar, ⌘1–⌘9 shortcuts.
- **Persisted chats API**: threads stored in `working/chats.json` with archive/rename/delete (`src/chats.ts`, `/api/projects/:slug/chats`).
- **Theme engine**: swappable presets (OpenKlip, Catppuccin, GitHub, Nord, Dracula, Tokyo Night) with light/dark scheme and no-flash boot script.
- **Keyboard shortcuts**: ⌘B toggles agent sidebar, ⌘I toggles inspector (`EditorSidebarShortcuts`).
- **Asset folder scanner**: CLI/GUI parity when files land in `projects/<slug>/assets/` (`src/asset-scanner.ts`).

### Changed
- Removed the asset strip below the timeline; assets render only under **Assets** in the agent sidebar.
- Agent threads moved from browser localStorage to per-project disk via the chats API.
- Inspector settings grouped under a Paper-style right sidebar with theme and default-agent pickers.
- Unified `registerAsset` path for b-roll, music, and stills; dropped standalone `src/broll.ts`.

### Fixed
- Lint/test hygiene for theme re-exports, vendored agents-ui shader component, and `AgentModelSelect` extraction.

## 0.5.0 - 2026-06-26

Linear-parity video player: the editor preview and a new fullscreen "cinema" mode share one transport bar that matches Linear's player chrome: white-on-dark controls over a gradient scrim, a hairline scrubber with a dot handle, and play, volume, time, remaining, speed, captions, picture-in-picture, and fullscreen.

### Added
- **Cinema player** (`web/components/cinema-player.tsx`): fullscreen overlay with the project name top-left, Export top-right, auto-hiding controls, keyboard shortcuts (space/k, arrows, f, m, c, Esc), real fullscreen + picture-in-picture, and a center play affordance.
- **Shared transport bar** (`web/components/player-controls.tsx`): the Linear control row, used by both the cinema overlay and the inline preview. Custom hairline scrubber with buffered fill, drag-to-seek, and a dot handle.

### Changed
- The inline preview renders the shared transport bar overlaid on the video (revealed on hover) instead of the old gray control row. Fullscreen opens the cinema overlay; volume, speed, and PiP drive the preview `<video>` directly; scrubbing seeks in cut-space via `sourceAtOutput()`. Loop in/out and the vignette toggle move to a slim secondary row.

## 0.4.0 - 2026-06-26

Agent selector: drive AI edits with your existing coding-agent subscription. No API keys, no bundled LLM. Pick Claude Code, Codex, Cursor, or Grok in the editor; OpenKlip shells out to that CLI headless, hands it the transcript, and applies the structured answer to the same `project.json`.

### Added
- **Multi-agent driver** (`src/agent-driver.ts`): adapters for `claude -p`, `codex exec`, `cursor-agent -p`, `grok -p`, each reading its cleanest structured-output channel (Claude/Cursor JSON envelope, Codex `--output-last-message` file, Grok stdout). Codex runs in a `--sandbox read-only` jail.
- **"Find filler with <agent>"**: the selected agent reads the transcript and cuts filler words via a server action, applied to the live `project.json`. Verified end-to-end against all four real CLIs.
- **Connection detection + badges**: `detectAgents()` reports installed (PATH) + signed-in (per-CLI status subcommand / auth file / host) with a compact "Signed in / Sign in / Not installed" badge per provider.
- Provider logos via the svgl shadcn registry; single-logo selector trigger.

### Fixed
- Strip `--bun` from `NODE_OPTIONS` when spawning agent CLIs so their bundled Node does not crash under the `bun --bun` dev server.
- Unique agent-thread message ids (`nextId`) + composite render keys: eliminates duplicate React key warnings.

### Notes
- OpenKlip bundles no LLM; agents run on the user's own subscription via their installed CLI. Cursor needs a one-time `cursor-agent login`.

## 0.3.0 - 2026-06-26

Unified action registry (`src/registry.ts`): one Zod-schema'd definition per `project.json` mutation, dispatched through a single `runAction(name, project, input)`. The CLI routes all ~20 edit commands through it instead of importing the mutation primitives directly, so what the registry advertises is exactly what the CLI executes. Schemas are shape-only; the primitives in `actions.ts` stay the single owner of value bounds (no duplicated rules to drift).

New `openklip actions [--json] [--surface cli|gui|mcp]` prints the capability manifest: the Zod schemas render to JSON Schema (the MCP `inputSchema` shape), so an external agent can read every editing action from one place without bespoke wiring. Schema failures surface as one concise, field-tagged line instead of a raw validation dump.

## 0.2.0 - 2026-06-26

External-inspiration buildout: a security fix, a layered project layout, several new editing primitives, and the GUI/agent surfaces to drive them. Distilled from the [External Inspiration steal list](docs/EXTERNAL-INSPIRATION.md) (Videofy Minimal + HyperFrames).

### Security
- Validate project slugs (`assertValidSlug`) at the `projectDir` chokepoint, closing a path-traversal hole on the `[slug]` API/media routes (a hostile slug could write outside `projects/`).

### Added
- **Ken Burns still overlays**: a `stills` EDL type with an animated `zoompan` push-in (focus point + ramp); `openklip still-add`/`still-rm`, exporter + compiled-timeline support. Verified with a real ffmpeg render.
- **Brand presets**: `brands/<name>.json` defaults (captions/vignette/pad) applied at `openklip ingest --brand` or `openklip brand <slug> <name>`; `project.json` stays the edit.
- **Overlay reorder**: `reorderBroll/Title/Zoom` + `openklip reorder`, plus `@dnd-kit` drag-to-restack of b-roll paint order in the inspector.
- **`openklip doctor`**: ffmpeg/whisper/project health check; also gates `serve`.
- **Export API route**: `POST /api/projects/[slug]/export` (Zod body, empty-cut + traversal guards).
- **Ingester plugin manifests**: `ingesters/<id>/ingester.json` + loader + `openklip ingesters`.
- **HyperFrames post-export seam**: `openklip package <slug> remove-background|transcribe` against the (opt-in, unbundled) `hyperframes` CLI; verified end-to-end.
- **Derived `CompiledTimeline`**: never-persisted authoring→preview view (kept ranges, overlays in output time, caption groups).
- **Agent skill router**: maps sidebar intent to CLI command sequences.
- **GUI**: orientation toggle (16:9/9:16/1:1 preview), rebuilding/saving overlay, in/out loop region, replace-from-bin source dropdown.

### Changed
- **Layered project folders**: `project.json` stays at the project root; derived media (proxy, transcript, audio, frames, asset proxies, export scratch) live under `working/`, renders under `output/`. Big-bang, no back-compat.
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

# Agent-Native Editor Checklist

This is the build checklist for turning OpenKlip from a working local editor into a capable agent-first video editor that can compete with Descript on core editing, while going further on done-for-you agent workflows.

Use this file as the execution board. Each item should be small enough to ship in a focused PR or agent task. Check items only after the listed verification passes.

## Product target

OpenKlip should let a user drop raw footage, b-roll, music, images, scripts, brand assets, and rough ideas into a project, then ask Claude, Codex, Cursor, Grok, or any CLI/MCP agent to edit a finished video. The user can then prompt again or manually tweak every cut, caption, overlay, audio choice, graphic, and export setting in the UI.

The product promise:

> Done-for-you video editing with full manual control when you want it.

The architecture promise:

> Every meaningful editing outcome is available through shared project state and schema-validated actions, with parity across UI, CLI, MCP, and API-style surfaces.

## Non-negotiable product direction

OpenKlip is not trying to become Premiere, Final Cut, or a generic legacy timeline editor.

Manual controls exist so users can inspect, correct, and refine agent work. They are not the primary product loop. The primary loop is:

1. Drop raw materials into a project.
2. Describe the desired outcome.
3. Agent inspects project state.
4. Agent edits through structured actions.
5. Agent exports and verifies.
6. Human reviews, prompts revisions, or tweaks manually.

When choosing between two implementations, prefer the one that makes agents better at finishing videos while preserving human inspectability. Do not add complex manual timeline features unless they improve agent output, review, correction, or trust.

## Feature priority rule

A feature belongs if it improves at least one of:

- Agent can understand the project better.
- Agent can make a better edit.
- Agent can verify its work.
- Human can review agent work faster.
- Human can correct agent work precisely.
- Repeated user requests can become prompts, templates, or small domain actions.

A feature is suspect if it only makes OpenKlip resemble a traditional video editor without improving the agent-first loop. When in doubt, ship the smallest primitive that helps the agent complete the outcome and lets the user inspect or correct the result.

## Anti-drift rules

- Do not build a large manual timeline feature just because legacy editors have it.
- Do not hide important state in React-only UI state.
- Do not create one-off workflow buttons when a prompt plus atomic tools can prove the workflow first.
- Do not add effects that only work in preview. Preview and export parity is required for shipped style primitives.
- Do not add UI-only editing capabilities without an agent-accessible path.
- Do not add agent-only capabilities that the UI cannot inspect or correct.
- Do not prioritize polish that cannot be represented in `project.json` or project files.
- Do not optimize for making demos look magical at the cost of inspectability, reversibility, or verification.

## Working rules for every feature

- [ ] Define the user outcome before implementation.
- [ ] Add or reuse atomic actions instead of one workflow-shaped mega action.
- [ ] Keep `project.json` and project files as the source of truth.
- [ ] Keep UI, CLI, MCP, and server action behavior aligned.
- [ ] Add bounded read tools for agent discovery before adding write tools.
- [ ] Make agent actions visible in the UI.
- [ ] Add focused tests for the core mutation or query logic.
- [ ] Add at least one end-to-end smoke path when the feature crosses ingest, preview, export, or agent chat.
- [ ] Update docs only after the behavior exists in code.

## Definition of a capable editor

A capable OpenKlip editor can complete these jobs end to end:

- [ ] Turn one raw talking-head video into a clean export with cuts, captions, titles, b-roll, music, and color.
- [ ] Turn a folder of raw footage, b-roll, images, music, and a script into a polished draft with minimal user intervention.
- [ ] Generate several short clips from a long video, each with vertical framing, captions, hooks, and export presets.
- [ ] Let the user manually fix any agent decision without leaving the UI.
- [ ] Let the agent inspect and revise the user’s manual edits without losing state.
- [ ] Verify the rendered output against the edit plan before declaring done.

## Milestone 0: Baseline audit

Goal: know exactly what exists, what is missing, and which gaps block done-for-you editing.

- [x] Create a current feature matrix.
  - [x] List every UI editing action.
  - [x] List matching CLI commands.
  - [x] List matching MCP tools.
  - [x] List matching server actions or API routes.
  - [x] Mark orphan UI actions the agent cannot achieve.
  - [x] Mark orphan CLI/MCP actions the UI cannot inspect or tweak.
  - Verification: matrix committed below on 2026-07-01.
- [x] Run a CRUD completeness audit for project entities.
  - [x] Project.
  - [x] Transcript words.
  - [x] B-roll assets.
  - [x] Still assets.
  - [x] Music assets.
  - [x] Titles.
  - [x] Zooms.
  - [x] Graphics.
  - [x] Captions.
  - [x] Look and color.
  - [x] Takes.
  - [x] Exports.
  - [x] Agent chats.
  - Verification: CRUD table committed below on 2026-07-01.
- [ ] Add a product smoke project.
  - [x] One talking-head source.
  - [ ] At least three b-roll clips.
  - [ ] At least two still images.
  - [x] One music track.
  - [ ] One rough script or brief.
  - [x] One brand preset or template.
  - Verification: `openklip doctor demo` and `openklip doctor edgaras-raw` pass, but no current project has the full smoke fixture shape. `demo` has one b-roll and one music asset. `edgaras-raw` has source media and `talking-head` template, but no registered assets.

### 0.1 Current feature parity matrix

Legend: Full means the surface can achieve the same outcome. Partial means the surface can achieve a subset or uses a separate path. Missing means the capability is not available on that surface today.

| Capability | UI | CLI | MCP | API / server | Audit result |
| --- | --- | --- | --- | --- | --- |
| List projects | Full | Full: `list` | Full: `list_projects` | Full: `GET /api/projects` | Good parity. |
| Create project from video | Full: browser upload and ingest job route exist | Full: `ingest` | Missing direct create tool | Full: `POST /api/projects`, ingest job polling | MCP cannot create a project directly. |
| Inbox ingest from loose videos | Full: scan-inbox hook | Partial: manual `ingest` | Missing | Full: `POST /api/projects/scan-inbox` | Agent cannot trigger inbox scan through MCP. |
| Delete project | Full | Missing direct CLI command | Missing | Full: `DELETE /api/projects/[slug]` | UI/API only. Add CLI/MCP if agents should clean projects. |
| Workspace folder picker | Full on macOS | Partial via env/config file | Missing | Full: `/api/workspace` | Acceptable local app gap for now. |
| Project status | Full | Full: `status --json` | Full: `project_status` | Partial through page data, no public status route | Good agent parity except HTTP query route. |
| Transcript list | Full: transcript panel | Full: `transcript` | Full: `transcript_list` | Partial through page data | Good CLI/MCP parity. |
| Transcript grep/span/phrase | Missing UI phrase search | Full | Full | Missing public route | Biggest near-term Descript gap. |
| Word cut and restore | Full: word click and batch save | Full: `cut`, `restore` | Full: `cut`, `restore-all` | Full via server actions | Good parity for word ids. |
| Phrase cut | Full: transcript search with batch cuts | Full: `cut --text` | Full: `cut-text` | Missing public route | UI shipped 2026-07-02. |
| Restore all | Full through actions where exposed | Full | Full | Full via registry server action | Good parity. |
| Transcript text correction | Partial: server action accepts `text` | Missing dedicated CLI | Missing dedicated MCP | Partial through `saveProjectEdits` | Needs explicit action and query behavior. |
| Cut snap settings | Full config path exists | Full registry action | Full registry tool | Full via registry server action | VAD implementation still incomplete. |
| Captions on/off and max words | Full | Full | Full | Full via registry server action | Good parity. |
| Caption style presets | Missing | Missing | Missing | Missing | Product gap. |
| Pad around cuts | Full | Full | Full | Full via server action | Good parity. |
| Asset upload/register | Full: upload and folder sync | Full: `asset-add`, `broll` | Missing direct upload/register | Full: assets POST and sync | MCP can list assets but cannot register files. CLI covers external agents. |
| Asset list | Full | Full: `assets` | Full: `list_assets` | Full: assets GET | Good parity. |
| Asset delete | Full | Missing | Missing | Full: asset DELETE route | UI/API only. |
| Asset cards and analysis | Full: Describe assets | Full: `analyze` | Full read: `asset_cards`; missing write/analyze trigger | Partial through server actions | Agent can read cards, but MCP cannot trigger analysis or edit cards. |
| Scene log | Full: Describe media path | Full: `analyze` | Full read: `scene_log` | Partial page data only | Good read parity, weak HTTP parity. |
| B-roll add/set/remove | Full | Full | Full | Full via registry server action | Good parity. |
| B-roll reorder | Full drag reorder | Full: `reorder` | Full: `reorder` | Full via registry server action | Good parity. |
| B-roll PiP and audio modes | Missing | Missing | Missing | Missing | Product gap. |
| Still add/set/remove | Full | Full | Full | Full via registry server action | Good parity. |
| Still region motion variants | Partial focus and scale only | Partial | Partial | Partial | Needs richer motion model. |
| Title add/set/remove | Full | Full | Full | Full via registry server action | Good parity. |
| Title phrase placement | Partial UI via selection, not phrase search | Full | Full | Full if registry action called | UI phrase gap. |
| Zoom add/set/remove | Full | Full | Full | Full via registry server action | Good parity. |
| Zoom phrase placement | Partial UI via selection, not phrase search | Full | Full | Full if registry action called | UI phrase gap. |
| Graphic add/set/remove | Full | Full | Full | Full via registry server action | Good parity. |
| JSON product announcement graphics | Full | Full | Full | Full via registry server action | Good parity. |
| Look: vignette, filter, LUT, color | Full | Full | Full | Full via server action or registry action | Good parity. |
| Motion feel | Full speed control, partial full knobs | Full | Full | Full via registry action | UI does not expose every motion knob. |
| Template set/list/show | Full select and skills | Full | Full | Full list route, set via server action | Good enough. |
| Brand preset apply | Partial ingest/apply path not prominent in UI | Full: `brand` | Missing | Missing public route | CLI-only for now. |
| Export MP4 | Full | Full | Full | Full: export route and server action | Good parity for height only. |
| Export compression and frame rate | Full: export dialog | Full: `--compression`, `--fps` | Full: export tool inputs | Full: export route body | Shipped 2026-07-02. Format and destination controls remain disabled. |
| Verify export | Full button | Full | Full | Partial server action path | Good CLI/MCP parity. |
| Package post-export | Missing UI | Full: `package` | Missing | Missing | CLI-only optional feature. |
| Multi-take add/list/transcript/assemble | Missing UI | Full | Full query/assemble tools | Missing public route | Strong agent feature, weak UI parity. |
| Chat threads | Full | Missing | Missing | Full chats route | UI/API only, acceptable but history should become agent-readable. |
| Agent chat edits | Full for Claude MCP edits, read-only or CLI hints for others | N/A | Full tool surface for MCP clients | N/A | Codex/Grok/Cursor chat mutation parity still missing. |
| Action manifest | Missing UI except implicit | Full: `actions`, `tools` | N/A | Missing route | CLI is source of truth. |
| OS-level write safety | In-process lock only | In-process only per command | In-process only through server | In-process lock only | Cross-process races remain. |

### 0.2 Current CRUD completeness audit

| Entity | Create | Read | Update | Delete | Main gaps |
| --- | --- | --- | --- | --- | --- |
| Project | UI/API upload, CLI ingest | UI, CLI, MCP, API | Template, look, cuts, overlays | UI/API delete | No CLI/MCP delete. No MCP project create. |
| Transcript words | Ingest only | UI, CLI, MCP | Cut/restore full parity, text correction partial | Not intentionally deletable | Add explicit transcript correction action. |
| B-roll asset | UI/API upload, CLI register | UI, CLI, MCP | Asset card via analyze only, metadata edit missing | UI/API only | Add CLI/MCP delete and asset-card edit if needed. |
| Still asset | UI/API upload, CLI register | UI, CLI, MCP | Asset card via analyze only, metadata edit missing | UI/API only | Same asset CRUD gap. |
| Music asset | UI/API upload, CLI register | UI, CLI, MCP | Placement via `music-add`/`music-set`/`music-rm` | UI/API only | Music timeline model shipped 2026-07-02; ducking and loudness normalization pending. |
| Titles | UI, CLI, MCP | UI, CLI, MCP | UI, CLI, MCP | UI, CLI, MCP | Good parity. Needs richer styles. |
| Zooms | UI, CLI, MCP | UI, CLI, MCP | UI, CLI, MCP | UI, CLI, MCP | Good parity. Needs target point/crop variants. |
| B-roll overlays | UI, CLI, MCP | UI, CLI, MCP | UI, CLI, MCP | UI, CLI, MCP | Needs PiP/audio modes. |
| Still overlays | UI, CLI, MCP | UI, CLI, MCP | UI, CLI, MCP | UI, CLI, MCP | Needs richer motion modes. |
| Graphics | UI, CLI, MCP | UI, CLI, MCP | UI, CLI, MCP | UI, CLI, MCP | Good parity. |
| Captions | Ingest default | UI, CLI, MCP | UI, CLI, MCP | Off toggle, not deleted | Needs style presets and safe areas. |
| Look and color | Project defaults | UI, CLI, MCP | UI, CLI, MCP | Reset by setting neutral values | Needs vignette strength/blur controls. |
| Takes | CLI/MCP add and assemble | CLI/MCP | Assemble creates new source | File-level only | Missing UI take browser and API routes. |
| Exports | UI, CLI, MCP, API | File output, status, verify | Re-export overwrites | Manual file delete only | Needs presets, settings, history. |
| Agent chats | UI/API | UI/API | UI/API rename/archive/append | UI/API | Not exposed to CLI/MCP as context or task log. |
| Brief/context | Missing | Missing | Missing | Missing | Needed for done-for-you agent workflows. |
| Action history | Append-only log on every registry mutation | History route + Config panel section | Not applicable (append-only) | Not applicable (append-only) | No filters or undo; non-registry CLI mutations do not log yet. |

### 0.3 Baseline audit conclusion

The current architecture is strong where it uses the registry: cuts by id, captions, pad, look, zooms, titles, b-roll, stills, graphics, JSON graphics, reorder, reanchor, export, and verify have good CLI/MCP parity and mostly good UI parity.

The biggest blockers to a capable agent-first editor are:

1. UI phrase search and phrase cuts are missing even though CLI/MCP already support them.
2. Music exists as an asset kind but not as a first-class placed timeline track.
3. Agent task progress, completion, checkpoints, and action history are missing.
4. Project briefs and style recipes are missing, so agents lack persistent creative context.
5. Multi-take assembly is powerful but CLI/MCP-only.
6. Export settings beyond height are not wired.
7. Process safety is in-process only, so CLI plus server concurrent writes can race.

2026-07-02 update: blockers 1 (UI phrase search/cuts) and 6 (export settings) are resolved; blocker 2 is partially resolved (music placement, preview bed, and export mix shipped; ducking and loudness remain); blocker 3 is partially resolved (append-only action history with UI visibility shipped; task progress and checkpoints remain).

Recommended next code task: **UI phrase search and phrase cuts**. It closes a visible Descript-level gap, reuses existing phrase-match and registry primitives, and is smaller than music, task state, or reframing.

## Milestone 1: Frictionless project intake

Goal: users can drop a messy folder of materials and OpenKlip turns it into agent-readable project context.

### 1.1 Browser project creation from raw media

- [x] Add browser upload for a first video on the empty workspace screen.
  - [x] Accept common video formats.
  - [x] Copy source into a new project folder.
  - [x] Start ingest job from the UI.
  - [x] Show ingest progress.
  - [x] Show ingest failure with actionable error.
  - [x] Open the editor when ingest completes.
  - Agent parity: CLI already has `ingest`; MCP/API should expose project creation or document why CLI is the path.
  - Verification: browser smoke creates a project from a video file. Verified 2026-07-02: browser smoke created a project from a real video; source persisted into the project folder.
- [ ] Add drag-and-drop project intake.
  - [ ] Drop a video onto empty workspace.
  - [ ] Drop a folder containing video plus assets.
  - [ ] Detect likely primary footage.
  - [ ] Register remaining files as assets.
  - [ ] Ask user to confirm if multiple primary videos are found.
  - Verification: fixture folder imports into one project with assets registered.
  - Note: single-video drop onto the empty workspace shipped 2026-07-02; folder intake, primary detection, and multi-primary confirm remain open.

### 1.2 Asset registration and classification

- [ ] Make asset kinds complete.
  - [ ] B-roll video.
  - [ ] Still image.
  - [ ] Music.
  - [ ] Voiceover or audio-only source.
  - [ ] Script or brief document.
  - [ ] Brand asset.
  - [ ] Logo.
  - [ ] LUT.
  - Verification: asset scanner identifies each kind from fixture files.
- [ ] Add script and brief ingestion.
  - [ ] Support `.txt`.
  - [ ] Support `.md`.
  - [ ] Store as project context, not timeline media.
  - [ ] Expose through CLI/MCP query tools.
  - [ ] Show in UI context panel.
  - Verification: agent prompt context includes the brief without dumping huge files.
- [ ] Add brand kit ingestion.
  - [ ] Detect logo files.
  - [ ] Detect color palette files if present.
  - [ ] Allow user to write or paste brand notes.
  - [ ] Store brand notes in a human-readable file or validated project field.
  - [ ] Expose brand context to agent chat.
  - Verification: agent can read brand context and use it in a title or graphic.

### 1.3 Project context files

- [ ] Add an explicit project brief artifact.
  - [ ] Define `brief.md` or equivalent project context location.
  - [ ] Include audience, goal, tone, must-use assets, avoid list, target length, and export formats.
  - [ ] Add UI editor for the brief.
  - [ ] Add CLI/MCP read and write tools for the brief.
  - Verification: changing the brief changes the agent context on the next chat request.
- [ ] Add agent log or edit rationale artifact.
  - [ ] Record high-level actions taken by an agent.
  - [ ] Link actions to project mutations where possible.
  - [ ] Keep log human-readable.
  - [ ] Surface latest log in UI.
  - Verification: an agent edit leaves a readable trace.

## Milestone 2: Agent task loop

Goal: an agent can pursue a video outcome in a visible loop until it produces a draft or reports a blocker.

### 2.1 Structured agent tasks

- [ ] Add an agent task model.
  - [ ] Task id.
  - [ ] User request.
  - [ ] Status: pending, in progress, blocked, failed, completed, cancelled.
  - [ ] Step list.
  - [ ] Per-step status and notes.
  - [ ] Started and completed timestamps.
  - [ ] Associated chat id.
  - Verification: task state persists across reload.
- [ ] Show task progress in the UI.
  - [ ] Current step.
  - [ ] Completed steps.
  - [ ] Tool calls that changed the edit.
  - [ ] Current blocker if any.
  - [ ] Cancel button.
  - Verification: live agent run visibly progresses through steps.
- [ ] Add explicit completion signal.
  - [ ] Agent can mark task complete.
  - [ ] Agent can mark task blocked with a question.
  - [ ] Agent can mark partial completion with remaining work.
  - [ ] UI shows completion separately from last chat message.
  - Verification: no heuristic completion detection is needed for the happy path.

### 2.2 Done-for-you edit workflows as prompts

- [ ] Add a `make-draft` workflow prompt.
  - [ ] Inspect project status.
  - [ ] Read brief.
  - [ ] Read transcript summary and spans.
  - [ ] Inspect asset list and cards.
  - [ ] Cut filler and false starts.
  - [ ] Add titles and captions.
  - [ ] Place b-roll or stills.
  - [ ] Add music if available.
  - [ ] Export draft.
  - [ ] Verify draft.
  - Verification: runs on smoke project and produces `output/out.mp4`.
- [ ] Add a `make-short` workflow prompt.
  - [ ] Find candidate hook.
  - [ ] Pick 20-60 second span.
  - [ ] Tighten pacing.
  - [ ] Set vertical format.
  - [ ] Add captions and title.
  - [ ] Export short.
  - Verification: produces one vertical draft from a long source.
- [ ] Add a `revise-draft` workflow prompt.
  - [ ] Read current overlays and cuts.
  - [ ] Read user feedback.
  - [ ] Apply minimal changes.
  - [ ] Export new draft.
  - [ ] Summarize what changed.
  - Verification: user can ask for a specific revision and see exact edits.

### 2.3 Agent checkpoints and recovery

- [ ] Persist task checkpoints after every mutating tool call.
  - [ ] Store task state.
  - [ ] Store last known project revision or mtime.
  - [ ] Store last tool result summary.
  - [ ] Store resumable next step.
  - Verification: restart dev server and resume visible task state.
- [ ] Add cancellation and safe stop.
  - [ ] Cancel running process if local agent process is active.
  - [ ] Mark task cancelled.
  - [ ] Preserve edits already applied.
  - [ ] Offer restore or continue path if action history exists.
  - Verification: cancellation does not corrupt `project.json`.

## Milestone 3: Descript-level transcript editing

Goal: text-based editing feels fast, safe, and obvious for humans and agents.

### 3.1 Phrase search and batch editing in UI

- [x] Add transcript search.
  - [x] Search exact text.
  - [x] Search punctuation-insensitive phrases.
  - [x] Show all matches.
  - [x] Click match to seek.
  - [x] Select match as editable span.
  - Verification: UI search returns same spans as CLI phrase tools. Verified 2026-07-02: parity test pins UI search spans against `grepTranscript`.
- [x] Add batch phrase cuts.
  - [x] Cut first match.
  - [x] Cut all matches.
  - [x] Preview affected words before applying.
  - [x] Add optional note.
  - [x] Re-anchor overlays after cut.
  - Verification: batch cut matches CLI `cut --text --all` behavior. Verified 2026-07-02: browser smoke cut a phrase on real footage and the cut persisted.
- [x] Add restore by search.
  - [x] Search cut words.
  - [x] Restore phrase.
  - [x] Restore all matches.
  - Verification: restored words appear in preview and export. Verified 2026-07-02: browser smoke restored cut words on real footage and the restore persisted.

### 3.2 Filler and dead-air removal

- [ ] Add deterministic filler detection.
  - [ ] Configurable filler phrase list.
  - [ ] Detect repeated fillers.
  - [ ] Detect isolated filler words.
  - [ ] Avoid cutting words inside meaningful phrases.
  - [ ] Show proposed cuts before applying.
  - Verification: unit tests for safe and unsafe filler cases.
- [ ] Add silence and dead-air detection.
  - [ ] Generate or reuse audio analysis data.
  - [ ] Detect silence longer than threshold.
  - [ ] Convert silence spans to candidate cuts.
  - [ ] Let user apply all or selected cuts.
  - Verification: fixture with known silence produces expected candidates.
- [ ] Add an agent-readable cleanup report.
  - [ ] Count fillers found.
  - [ ] Count dead-air spans found.
  - [ ] Estimated duration removed.
  - [ ] Risk warnings for tight cuts.
  - Verification: MCP/CLI can read cleanup candidates before mutation.

### 3.3 Better cut quality

- [ ] Add VAD snap-to-silence.
  - [ ] Analyze speech activity near word boundaries.
  - [ ] Snap cut starts and ends to nearby silence.
  - [ ] Preserve sample-accurate timing.
  - [ ] Expose snap setting in CLI and UI.
  - Verification: cut boundary fixture snaps to expected samples.
- [ ] Add equal-power audio crossfades at cuts.
  - [ ] Define crossfade duration setting.
  - [ ] Apply to preview if feasible.
  - [ ] Apply to export.
  - [ ] Avoid crossfade across very short kept ranges.
  - Verification: export graph includes fades and audio has no clicks in smoke test.
- [ ] Add transcript correction.
  - [ ] Edit word text without changing timing.
  - [ ] Preserve original transcript text if needed.
  - [ ] Update captions from corrected text.
  - [ ] Expose through CLI/MCP.
  - Verification: corrected word appears in captions and export.

## Milestone 4: Audio, music, and sound design

Goal: exported videos can sound polished without leaving OpenKlip.

### 4.1 Music placement

- [x] Add music track placement model.
  - [x] Start and end sample.
  - [x] Source in-point.
  - [x] Gain.
  - [x] Fade in and fade out.
  - [x] Loop or trim mode.
  - Verification: project schema parses existing projects and new music placements.
- [x] Add music CLI/MCP actions.
  - [x] `music-add`.
  - [x] `music-set`.
  - [x] `music-rm`.
  - [x] `music-list` or include in overlays query (covered: the overlays query and status `musicCount` include music placements).
  - Verification: action registry tests cover music CRUD.
- [ ] Add music UI controls.
  - [x] Add music from asset bin (placement happens in the Config panel Music section).
  - [ ] Trim music on timeline.
  - [x] Adjust gain.
  - [x] Set fades.
  - [x] Mute music in preview.
  - Verification: manual smoke adds background music and exports it.

### 4.2 Ducking and loudness

- [ ] Add voice-aware music ducking.
  - [ ] Lower music during speech.
  - [ ] Configurable duck amount.
  - [ ] Configurable attack and release.
  - [ ] Export through ffmpeg.
  - Verification: fixture export has expected filter chain and audible ducking.
- [ ] Add loudness normalization.
  - [ ] Analyze source loudness.
  - [ ] Normalize voice track.
  - [ ] Normalize music output level.
  - [ ] Add UI toggle and CLI option.
  - Verification: ffmpeg loudness stats are within target range.
- [ ] Add basic audio cleanup.
  - [ ] Noise reduction option if feasible with ffmpeg filters.
  - [ ] High-pass voice filter.
  - [ ] De-esser or documented non-goal if too heavy.
  - Verification: audio filter tests and export smoke.

## Milestone 5: Rich manual timeline editing

Goal: the UI can correct any agent edit precisely.

### 5.1 Timeline completeness

- [ ] Show all editable tracks.
  - [ ] Source kept ranges.
  - [ ] B-roll.
  - [ ] Stills.
  - [ ] Titles.
  - [ ] Graphics.
  - [ ] Zooms.
  - [ ] Music.
  - Verification: timeline reflects `project.json` after reload.
- [ ] Add track-level visibility and lock controls.
  - [ ] Hide track in preview.
  - [ ] Lock track from dragging.
  - [ ] Persist only intentional project state, keep UI-only state local.
  - Verification: locked clips cannot be moved in UI.
- [ ] Add multi-select timeline editing.
  - [ ] Select multiple overlays.
  - [ ] Move selected overlays together.
  - [ ] Delete selected overlays.
  - [ ] Nudge selected overlays by keyboard.
  - Verification: mutation results are deterministic and undoable when history lands.

### 5.2 Overlay modes and inspectors

- [ ] Add b-roll display modes.
  - [ ] Full cover.
  - [ ] Picture-in-picture.
  - [ ] Split screen.
  - [ ] Background blur with foreground crop.
  - Verification: preview and export match for each mode.
- [ ] Add b-roll audio options.
  - [ ] Silent.
  - [ ] Use original b-roll audio.
  - [ ] Mix with voice.
  - [ ] Duck source or duck b-roll.
  - Verification: export includes expected audio mix.
- [ ] Add richer title styles.
  - [ ] Lower third.
  - [ ] Center title.
  - [ ] Hero title.
  - [ ] Quote card.
  - [ ] Section divider.
  - [ ] Callout label.
  - Verification: all styles render in preview and export.
- [ ] Add keyframe-like property changes where needed.
  - [ ] Keep MVP scoped to opacity, scale, position if added.
  - [ ] Store as simple keyframes, not arbitrary code.
  - [ ] Expose through CLI/MCP only if UI ships it.
  - Verification: export matches preview for one keyframed property.

## Milestone 6: Visual intelligence and asset matching

Goal: agents can choose the right media, not just any media.

### 6.1 Scene understanding

- [ ] Improve main footage scene log.
  - [ ] Detect visual scene changes.
  - [ ] Summarize each scene.
  - [ ] Mark b-roll opportunities.
  - [ ] Mark screen recordings or product footage.
  - [ ] Mark talking-head spans.
  - Verification: scene log query returns bounded spans and summaries.
- [ ] Add visual frame browser for scene log.
  - [ ] Show representative frames.
  - [ ] Jump to source span.
  - [ ] Let user mark useful or avoid.
  - [ ] Expose user marks to agent.
  - Verification: user marks persist and agent context includes them.

### 6.2 Asset cards and semantic matching

- [ ] Make asset cards editable.
  - [ ] Edit summary.
  - [ ] Edit tags.
  - [ ] Edit best-for.
  - [ ] Edit suggested focus.
  - [ ] Expose through CLI/MCP.
  - Verification: edited card affects later agent placement.
- [ ] Add b-roll match suggestions.
  - [ ] Input: transcript span.
  - [ ] Output: ranked assets with reason.
  - [ ] Use existing cards first.
  - [ ] Optionally use embeddings later.
  - [ ] Let user or agent apply suggestion.
  - Verification: deterministic fixture ranks expected asset from card tags.
- [ ] Add must-use and do-not-use asset flags.
  - [ ] UI controls.
  - [ ] CLI/MCP actions.
  - [ ] Agent prompt context.
  - [ ] Export unaffected unless asset is placed.
  - Verification: agent does not use flagged avoid asset in smoke workflow.

### 6.3 Highlight detection

- [ ] Add candidate highlight query.
  - [ ] Find strong hooks.
  - [ ] Find concise claims.
  - [ ] Find surprising or emotional moments.
  - [ ] Find product-demo moments.
  - [ ] Return spans with reasons.
  - Verification: query returns bounded spans, not full transcript dumps.
- [ ] Add clip plan artifact.
  - [ ] Store proposed shorts as draft plans.
  - [ ] Include hook, span, title, caption style, target platform.
  - [ ] Let user approve or edit before creating derived project.
  - Verification: approved clip plan creates a new edit or export target.

## Milestone 7: Shorts and aspect ratios

Goal: OpenKlip can produce social clips that look intentional.

### 7.1 Aspect ratio as project or export state

- [ ] Define aspect ratio model.
  - [ ] 16:9 landscape.
  - [ ] 9:16 vertical.
  - [ ] 1:1 square.
  - [ ] Per-export override if needed.
  - Verification: preview and export use same dimensions.
- [ ] Add safe area overlays.
  - [ ] TikTok/Reels caption safe area.
  - [ ] YouTube Shorts safe area.
  - [ ] Generic center safe area.
  - Verification: captions and titles avoid safe areas in vertical preview.

### 7.2 Reframe and crop

- [ ] Add manual crop controls.
  - [ ] Position x/y.
  - [ ] Scale.
  - [ ] Per-span crop.
  - [ ] Reset to center.
  - Verification: export crop matches preview.
- [ ] Add subject-aware auto reframe.
  - [ ] Start with face or center heuristic.
  - [ ] Store reframe spans in project state.
  - [ ] Let user manually override.
  - [ ] Expose reframe actions to agent.
  - Verification: vertical export keeps face or subject visible on fixture.
- [ ] Add split-screen vertical layout.
  - [ ] Talking head top, screen/product bottom.
  - [ ] Product top, talking head bottom.
  - [ ] Configurable ratio.
  - Verification: preview and export match.

## Milestone 8: Export quality and formats

Goal: exports are fast, configurable, verified, and ready to publish.

### 8.1 Export settings

- [x] Wire compression setting.
  - [x] UI selection.
  - [x] CLI flag.
  - [x] MCP/API input.
  - [x] ffmpeg encoder parameters.
  - Verification: output bitrate changes as expected.
- [x] Wire frame rate setting.
  - [x] Preserve source.
  - [x] 24 fps.
  - [x] 30 fps.
  - [x] 60 fps.
  - Verification: ffprobe reports selected frame rate.
- [ ] Add export destination options.
  - [ ] Project output folder.
  - [ ] User-selected folder if feasible.
  - [ ] Copy path to clipboard if supported.
  - Verification: export lands in selected destination.
- [ ] Add export presets.
  - [ ] YouTube 16:9.
  - [ ] Shorts/Reels/TikTok 9:16.
  - [ ] LinkedIn square or landscape.
  - [ ] Custom.
  - Verification: preset sets dimensions, captions, and safe areas.

### 8.2 Export performance and quality

- [ ] Add faster segment seeking for long sources.
  - [ ] Seek per kept range.
  - [ ] Avoid decoding full source when exporting short clips.
  - [ ] Preserve sample-accurate boundaries.
  - Verification: benchmark long-source short-export before and after.
- [ ] Add exported transitions.
  - [ ] Match preview transition style or choose export-safe variant.
  - [ ] Add transition duration setting.
  - [ ] Avoid transitions across cuts that should stay invisible.
  - Verification: exported MP4 includes transitions where expected.
- [ ] Add export verification dashboard.
  - [ ] Transcript coverage.
  - [ ] Deleted word leakage.
  - [ ] Missing assets.
  - [ ] Stale anchors.
  - [ ] Duration mismatch.
  - [ ] Audio loudness.
  - Verification: failed check blocks agent from claiming final success unless user overrides.

## Milestone 9: Revision, history, and trust

Goal: users trust agents because every change is inspectable, reversible, and reviewable.

### 9.1 Action history

- [x] Add append-only action log.
  - [x] Action name.
  - [x] Input summary.
  - [x] Result summary.
  - [x] Actor: human, agent, CLI, MCP.
  - [x] Timestamp.
  - [x] Project revision before and after.
  - Verification: every registry mutation records a log entry. Scope note 2026-07-02: every registry mutation logs across GUI/CLI/MCP; non-registry CLI paths (assets, template, assembly) do not log yet.
- [ ] Show action history in UI.
  - [ ] Filter by actor.
  - [ ] Filter by action type.
  - [ ] Jump to affected span or overlay.
  - [ ] Show note or rationale.
  - Verification: user can inspect what an agent changed.
- [ ] Add undo and redo.
  - [ ] Start with single-action undo for registry actions.
  - [ ] Add batch undo for one agent task.
  - [ ] Preserve redo until new mutation.
  - [ ] Handle export artifacts separately.
  - Verification: undo restores project JSON exactly for supported actions.

### 9.2 Diff and review

- [ ] Add edit diff summary.
  - [ ] Words cut and restored.
  - [ ] Overlays added, removed, moved.
  - [ ] Look changes.
  - [ ] Music changes.
  - [ ] Export changes.
  - Verification: diff summary is stable in tests.
- [ ] Add before and after preview review.
  - [ ] Compare prior export or checkpoint.
  - [ ] Jump through changed spans.
  - [ ] Accept or revert agent task.
  - Verification: user can review an agent task without reading raw JSON.
- [ ] Add Git-friendly project snapshots.
  - [ ] Optional initialize Git in project folder.
  - [ ] Commit before agent task.
  - [ ] Commit after agent task.
  - [ ] Show command or UI flow without requiring Git.
  - Verification: sample project can diff two agent edits.

## Milestone 10: API and external automation parity

Goal: OpenKlip can be driven by external agents and scripts without relying on the browser.

### 10.1 Public action surface

- [ ] Decide the supported external HTTP API shape.
  - [ ] Local-only API first.
  - [ ] Auth or localhost trust model.
  - [ ] Project scoping.
  - [ ] Error response shape.
  - Verification: API design doc approved in this checklist or linked doc.
- [ ] Expose registry actions over HTTP where safe.
  - [ ] Validate with the same schemas.
  - [ ] Return the same result shape as CLI/MCP.
  - [ ] Include project revision in response.
  - [ ] Use project locks.
  - Verification: one test proves CLI and HTTP produce same mutation for same input.
- [ ] Expose query tools over HTTP.
  - [ ] Project status.
  - [ ] Transcript grep/span/phrase.
  - [ ] Assets.
  - [ ] Overlays.
  - [ ] Scene log.
  - [ ] Verify status.
  - Verification: HTTP query tests match CLI query fixtures.

### 10.2 Process safety

- [ ] Add OS-level file locking.
  - [ ] Protect CLI plus running server writes.
  - [ ] Time out with clear error.
  - [ ] Avoid deadlocks on process crash.
  - [ ] Keep tests isolated.
  - Verification: concurrent write test cannot corrupt project JSON.
- [ ] Add project revision checks.
  - [ ] Read revision before mutation.
  - [ ] Fail or merge when project changed since read.
  - [ ] Surface conflict in UI and CLI.
  - Verification: stale write test fails safely.
- [ ] Add machine-readable errors.
  - [ ] Error code.
  - [ ] Human message.
  - [ ] Suggested next tool or fix when possible.
  - [ ] Include whether retry is safe.
  - Verification: MCP and CLI tests assert error shape for common failures.

## Milestone 11: Descript match checklist

Goal: match the core jobs people expect from a modern transcript-first editor.

- [ ] Transcript-based cuts.
  - [x] Word click cuts.
  - [x] CLI phrase cuts.
  - [x] UI phrase cuts.
  - [ ] Batch filler cuts with review.
  - [ ] Dead-air cuts with review.
- [ ] Captions.
  - [x] Preview captions.
  - [x] Export captions.
  - [ ] Caption style presets.
  - [ ] Per-platform safe areas.
  - [ ] Transcript correction flows into captions.
- [ ] Media overlays.
  - [x] B-roll full cover.
  - [x] Still overlays.
  - [x] Titles.
  - [x] Graphics.
  - [ ] B-roll PiP.
  - [ ] Split screen.
  - [ ] Manual crop and scale.
- [ ] Audio.
  - [x] Music placement.
  - [x] Music fades.
  - [ ] Music ducking.
  - [ ] Loudness normalization.
  - [ ] Basic audio cleanup.
- [ ] Multi-take and composition.
  - [x] CLI multi-take assembly.
  - [ ] UI take browser.
  - [ ] Agent pick-best-take workflow.
  - [ ] Manual take replacement.
- [ ] Export.
  - [x] MP4 export.
  - [x] 720p, 1080p, 4K height choices.
  - [x] Compression setting.
  - [x] Frame rate setting.
  - [ ] Social presets.
  - [ ] Fast long-source export.
- [ ] Collaboration and trust.
  - [x] Action history.
  - [ ] Undo and redo.
  - [ ] Before and after review.
  - [ ] Agent task log.

## Milestone 12: Agent-first advantage checklist

Goal: go beyond Descript by making the agent the primary editor.

- [ ] Bring-your-own-agent works across primary surfaces.
  - [x] CLI for external agents.
  - [x] MCP for Cursor and Claude-style tool use.
  - [x] Claude chat edits through MCP.
  - [ ] Codex chat edits through equivalent tool loop.
  - [ ] Grok chat edits through equivalent tool loop.
  - [ ] Cursor chat edits through equivalent tool loop.
- [ ] Done-for-you draft workflow.
  - [ ] One prompt creates a full draft.
  - [ ] Agent uses assets by meaning.
  - [ ] Agent adds music when available.
  - [ ] Agent exports and verifies.
  - [ ] User can revise by prompt.
- [ ] Agent can explain its edit.
  - [ ] Why cuts were made.
  - [ ] Why assets were chosen.
  - [ ] Why music was placed.
  - [ ] What remains weak or uncertain.
  - [ ] What user should review.
- [ ] Agent learns project preferences.
  - [ ] Project brief.
  - [ ] Brand notes.
  - [ ] Avoid list.
  - [ ] Preferred pacing.
  - [ ] Preferred caption style.
- [ ] Agent discovers latent workflows.
  - [ ] Store user requests in analyzable form.
  - [ ] Track failed requests by missing tool or missing context.
  - [ ] Promote repeated prompts into templates.
  - [ ] Promote repeated slow tool loops into domain actions only after patterns are clear.

## Milestone 13: Polished editorial motion language

Goal: let agents and humans recreate the common grammar of well-edited explainer, launch, and essay videos with explicit primitives instead of one-off manual hacks.

### 13.1 Global look and camera energy

- [ ] Add reusable look presets for focus and depth.
  - [x] Vignette toggle.
  - [ ] Vignette strength and radius controls.
  - [ ] Background blur strength controls for overlay scenes.
  - [ ] Center-focus preset for talking-head videos.
  - Agent parity: UI, CLI, MCP, and API-style surfaces can read and set the same look fields.
  - Verification: preview and export match for vignette and blur settings.
- [ ] Add shot energy presets for speaker footage.
  - [x] Push-in zoom primitive.
  - [ ] Aggressive 10-20% intro push-in preset.
  - [ ] Subtle 3-8% drift preset.
  - [ ] Manual target point for zooms.
  - [ ] Phrase-anchored zoom preset.
  - Agent parity: agent can apply a named zoom feel without hardcoding sample spans by hand.
  - Verification: intro push-in exports with expected scale curve.
- [ ] Add pseudo-angle variants when source footage allows it.
  - [ ] Crop left/right to simulate profile or interviewer angle.
  - [ ] Add rule that this is a synthetic crop, not a real second camera.
  - [ ] Let agent use sparingly for visual variety.
  - Verification: crop preset keeps subject in frame on fixture.

### 13.2 Transition language

- [ ] Promote transition presets to first-class edit state.
  - [ ] Hard cut.
  - [ ] Glimm shader sweep.
  - [ ] Fast slide.
  - [ ] Flash or light wipe.
  - [ ] Subtle zoom cut.
  - [ ] Randomized but bounded variety mode.
  - Agent parity: agent can choose transition style per cut or apply a project transition policy.
  - Verification: preview and export use the same transition list.
- [ ] Add transition sound effects.
  - [ ] Register short SFX assets.
  - [ ] Place SFX at transition boundaries.
  - [ ] Set gain and fade.
  - [ ] Add default subtle whoosh/click library or document user-supplied requirement.
  - Agent parity: `sfx-add`, `sfx-set`, `sfx-rm`, and query surfaces exist if SFX becomes project state.
  - Verification: transition SFX exports at the correct time and level.
- [ ] Add transition policy prompts.
  - [ ] Conservative documentary mode.
  - [ ] Energetic YouTube essay mode.
  - [ ] Product launch mode.
  - [ ] Data-heavy explainer mode.
  - Verification: agent applies varied transitions without overusing effects.

### 13.3 Static image and screenshot motion

- [ ] Expand still overlay motion presets.
  - [x] Ken Burns push-in.
  - [ ] Slow zoom out.
  - [ ] Pan left/right.
  - [ ] Zoom to a specific region, such as a map or graph point.
  - [ ] Hold then punch in.
  - Agent parity: still motion fields are editable through UI, CLI, MCP, and API-style surfaces.
  - Verification: region zoom preview and export match.
- [ ] Add screenshot presentation modes.
  - [ ] Slide in from bottom.
  - [ ] Slide in from side.
  - [ ] Fast entrance then slow scroll.
  - [ ] Browser-frame or device-frame wrapper.
  - [ ] Shadow and border controls.
  - [ ] Sound effect cue on entrance.
  - Verification: static screenshot can enter, scroll, and export correctly.
- [ ] Add blurred-background screenshot composition.
  - [ ] Use talking-head video as blurred background.
  - [ ] Place data, graph, or screenshot above it.
  - [ ] Maintain readable contrast.
  - [ ] Add agent rule to use for data-heavy sections.
  - Verification: graph screenshot over blurred video exports with correct layering.

### 13.4 Text reveal and caption choreography

- [ ] Add lower text card style.
  - [ ] Dark fading background at bottom.
  - [ ] High-contrast text.
  - [ ] Bright but subtle text shadow or glow.
  - [ ] Ease in from bottom.
  - [ ] Safe area awareness.
  - Agent parity: style can be selected by name from tools.
  - Verification: lower text card remains readable on bright footage.
- [ ] Add centered big-text reveal style.
  - [ ] Slide from bottom.
  - [ ] Centered composition.
  - [ ] Background shot changes while text remains readable.
  - [ ] Optional emphasis word styling.
  - Verification: preview and export match for centered reveal.
- [ ] Add word-by-word reveal captions.
  - [ ] Words appear as spoken.
  - [ ] Optional one-by-one entrance animation.
  - [ ] Optional typing or tick sound per word or phrase group.
  - [ ] Rate-limit SFX so captions do not become annoying.
  - Agent parity: agent can choose normal captions, kinetic captions, or word-by-word reveal.
  - Verification: reveal timing aligns to transcript words in export.

### 13.5 Layered video compositions

- [ ] Add video-over-video composition modes.
  - [ ] Small video over main video.
  - [ ] Screenshot over video background.
  - [ ] Product video over blurred speaker background.
  - [ ] Speaker PiP over product footage.
  - Agent parity: composition mode is a structured overlay option, not just a UI-only transform.
  - Verification: audio and video layering export correctly.
- [ ] Add background shot sequencing behind text.
  - [ ] Keep big text stable while background clips change.
  - [ ] Let agent select background shots by asset card or scene log.
  - [ ] Add transition between background shots.
  - Verification: text remains stable while background sequence changes.
- [ ] Add drone or far-shot motion treatment.
  - [ ] Slow push-in.
  - [ ] Slow lateral pan.
  - [ ] Stabilized crop if feasible.
  - [ ] Mark as good for establishing shots in asset cards.
  - Verification: establishing shot preset produces slow motion in export.

### 13.6 Style recipe extraction

- [ ] Add a reverse-engineered style recipe format.
  - [ ] Global look.
  - [ ] Pacing rules.
  - [ ] Transition rules.
  - [ ] Text styles.
  - [ ] Screenshot styles.
  - [ ] Sound design rules.
  - [ ] B-roll placement rules.
  - Verification: recipe can be saved as a template and read by the agent.
- [ ] Add a `style-from-notes` workflow prompt.
  - [ ] Accept rough notes like the list above.
  - [ ] Convert them into a structured recipe.
  - [ ] Identify which primitives exist and which are missing.
  - [ ] Apply available primitives to a draft.
  - [ ] Report missing capabilities instead of pretending.
  - Verification: agent turns notes into a reusable project template.
- [ ] Add style recipe application.
  - [ ] Apply to current project.
  - [ ] Apply to future project as a template.
  - [ ] Allow user edits to the recipe.
  - [ ] Keep recipe separate from generated timeline edits.
  - Verification: the same recipe produces consistent style choices on two fixture projects.

## Parallel execution plan

These tracks can run in parallel as long as each PR keeps `project.json` migrations backward-compatible and preserves action parity.

### Track A: Intake and context

- Owners can work mostly in `app/`, `web/components`, `src/assets.ts`, `src/asset-scanner.ts`, and project context storage.
- First shippable slice: browser video upload creates a project.
- Next slice: folder drop registers assets and brief files.
- Acceptance: a non-technical user can create a project without CLI.

### Track B: Agent task loop

- Owners can work mostly in agent chat, task persistence, and UI progress components.
- First shippable slice: persisted task model and visible step list.
- Next slice: explicit completion and blocked states.
- Acceptance: agent work is visible and resumable after reload.

### Track C: Transcript quality

- Owners can work mostly in transcript search UI, phrase tools, cleanup candidates, VAD, and export audio cuts.
- First shippable slice: UI phrase search and cut.
- Next slice: filler and silence candidate review.
- Acceptance: Descript-style text cleanup is usable without CLI.

### Track D: Audio and music

- Owners can work mostly in EDL schema, action registry, exporter audio graph, asset bin, and timeline tracks.
- First shippable slice: add music with gain and fades.
- Next slice: ducking and loudness normalization.
- Acceptance: a draft can ship with background music mixed under speech.

### Track E: Visual overlays and timeline

- Owners can work mostly in timeline UI, overlay schemas, preview overlays, and exporter filters.
- First shippable slice: b-roll PiP mode.
- Next slice: split screen and richer title styles.
- Acceptance: user can fix the most common visual agent mistakes manually.

### Track F: Shorts and reframing

- Owners can work mostly in aspect ratio state, preview layout, crop model, and exporter filters.
- First shippable slice: vertical export preset with manual crop.
- Next slice: auto reframe.
- Acceptance: agent can produce a usable vertical short.

### Track G: Export and verification

- Owners can work mostly in export settings, ffmpeg graph, verify, and export UI.
- First shippable slice: compression and frame rate settings actually affect export.
- Next slice: fast long-source export.
- Acceptance: export is configurable, faster, and self-checking.

### Track H: Trust and history

- Owners can work mostly in mutation wrappers, action log, UI history, and undo.
- First shippable slice: append-only action log.
- Next slice: task-level revert.
- Acceptance: user can see and undo what an agent did.

### Track I: API and process safety

- Owners can work mostly in registry dispatch, route handlers, locks, and error shape.
- First shippable slice: HTTP query and one mutation parity test.
- Next slice: OS-level locking.
- Acceptance: external automation can safely drive the same core actions.

### Track J: Editorial motion language

- Owners can work mostly in overlay schemas, text styles, transition state, preview overlays, exporter filters, and template prompts.
- First shippable slice: lower text card style plus screenshot slide-in preset.
- Next slice: transition SFX and word-by-word reveal captions.
- Acceptance: an agent can recreate a simple polished reference-video grammar from a style recipe.

## Suggested incremental build order

1. Baseline audit.
2. Browser project creation from raw media.
3. UI phrase search and phrase cuts.
4. Music placement and export.
5. Agent task model with visible progress.
6. Done-for-you `make-draft` workflow prompt.
7. Filler and dead-air candidate review.
8. B-roll PiP and richer overlay controls.
9. Vertical preset and manual crop.
10. Export settings and verification dashboard.
11. Action history and task-level revert.
12. OS-level locking and HTTP parity.
13. Editorial motion language recipes.

This order makes the product feel more capable every few steps while keeping agent-native architecture intact.

## Release gates

### Alpha gate: capable local editor

- [x] Browser project creation works.
- [x] UI phrase search and batch cuts work.
- [x] Music placement works in preview and export.
- [x] Export settings are real.
- [x] Basic action history exists.
- [x] `bun run check` passes.
- [x] `bun run typecheck` passes.
- [x] `bun test` passes.
- [x] `bun run build` passes.

### Beta gate: done-for-you agent draft

- [ ] Project brief exists and is included in agent context.
- [ ] Agent task progress is visible.
- [ ] `make-draft` prompt can produce a full draft on the smoke project.
- [ ] Agent adds cuts, captions, b-roll or stills, music, and export.
- [ ] Verify catches at least one intentional bad export fixture.
- [ ] User can manually revise the agent draft in the UI.
- [ ] User can ask the agent to revise after manual edits.

### Descript-match gate

- [ ] Transcript editing is fast enough for full manual cleanup.
- [ ] Filler and dead-air cleanup works with review.
- [ ] Captions are styleable and export reliably.
- [ ] Music, ducking, and loudness are usable.
- [ ] Multi-take can be inspected or corrected in UI.
- [ ] Export presets cover common platforms.
- [ ] Undo or task-level revert exists.

### Agent-first gate

- [ ] A user can drop a messy folder and ask for a finished draft.
- [ ] The agent can complete the draft without browser driving.
- [ ] The UI shows progress and every applied edit.
- [ ] The user can refine by prompt or manual tweak.
- [ ] The agent can verify the export and explain remaining weaknesses.
- [ ] Common repeated requests are promoted into templates or prompts, not premature workflow-shaped tools.

### Polished reference-video gate

- [ ] A user can paste rough style notes and get a structured style recipe.
- [ ] The agent can apply vignette, zoom energy, still motion, screenshot motion, text reveal, transition variety, and SFX where available.
- [ ] The UI can inspect and tweak each applied style choice.
- [ ] CLI, MCP, and API-style surfaces can read and mutate the same style primitives.
- [ ] Preview and export match for every style primitive used in the reference smoke project.

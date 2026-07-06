export interface OpenKlipFeature {
  description: string;
  title: string;
}

export interface OpenKlipFeatureGroup {
  features: ReadonlyArray<OpenKlipFeature>;
  id: string;
  title: string;
}

/** Product capabilities shipped in the current release (see README "What works today"). */
export const OPENKLIP_FEATURE_GROUPS: ReadonlyArray<OpenKlipFeatureGroup> = [
  {
    id: "editing",
    title: "Editing",
    features: [
      {
        title: "Ingest",
        description:
          "Video to local transcript, preview proxy, and project.json. Re-ingest requires --force.",
      },
      {
        title: "Transcript editing",
        description:
          "Click words to toggle deleted in the browser; cut, phrase cut, and restore on the CLI.",
      },
      {
        title: "Phrase search and batch cuts",
        description:
          "Mod+F search with exact and fuzzy matching, Cut first / Cut all, Restore all, and optional notes.",
      },
      {
        title: "Bounded transcript reads",
        description:
          "CLI grep, span, and phrase helpers for agents without dumping full transcripts.",
      },
      {
        title: "Cleanup review",
        description:
          "Filler-word and dead-air candidates with safe vs review risk; apply-all-safe batch action.",
      },
      {
        title: "VAD snap and seam crossfades",
        description:
          "Cut boundaries snap to silence; export joins seams with equal-power crossfades.",
      },
      {
        title: "Written rationale",
        description:
          "Optional --note on cuts and overlays records why a pick was made (metadata only).",
      },
      {
        title: "Phrase-anchored cues",
        description:
          "Phrase-placed overlays re-resolve onto kept words after a re-cut; stale when phrase is cut.",
      },
      {
        title: "Multi-take assembly",
        description:
          "Splice the best take per line into one source; browse, upload, and assemble in the Config panel.",
      },
    ],
  },
  {
    id: "preview",
    title: "Preview and player",
    features: [
      {
        title: "Preview",
        description:
          "All-intra proxy; scheduler plays kept ranges only in a compact center column.",
      },
      {
        title: "Editor layout",
        description:
          "Resizable chat sidebar, Properties/Settings below video, transcript toggle, timeline drawer.",
      },
      {
        title: "Cinema player",
        description:
          "Fullscreen overlay with transport bar and the same overlay stack as inline preview.",
      },
      {
        title: "Preview cut transitions",
        description:
          "WebGL glimm sweep at cut boundaries; respects prefers-reduced-motion.",
      },
      {
        title: "Fullscreen overlays",
        description:
          "Graphics, titles, and captions render in cinema mode, synced to playback.",
      },
      {
        title: "Config shell and responsive panels",
        description:
          "Right-side Config with color pad and timing controls; mobile overlay buttons.",
      },
    ],
  },
  {
    id: "overlays",
    title: "Overlays and assets",
    features: [
      {
        title: "Assets",
        description:
          "Register b-roll, music, and stills; sidebar bin with upload and assets/ folder sync.",
      },
      {
        title: "Overlays",
        description:
          "B-roll cover, Ken Burns stills, push-in zooms, title cards, and vignette.",
      },
      {
        title: "Asset cards",
        description:
          "Describe assets runs subagents that write summary, tags, and bestFor for placement.",
      },
      {
        title: "B-roll suggest",
        description:
          "Rank registered assets for a spoken span using asset cards; respects must-use and avoid.",
      },
      {
        title: "Blank canvas projects",
        description:
          "Create motion-from-scratch projects without camera footage.",
      },
    ],
  },
  {
    id: "graphics",
    title: "Graphics and motion",
    features: [
      {
        title: "Rich graphics templates",
        description:
          "HTML/CSS templates via headless Chrome; motion pack, shader pack, and project-local overrides.",
      },
      {
        title: "Motion graphics workflow",
        description:
          "Phrase placement, beat-snapped spans, BPM detect, and cut-seam transitions.",
      },
      {
        title: "Graphic keyframe animation",
        description:
          "Declarative keyframes with seven easings; preview and export render identically.",
      },
      {
        title: "Graphic template previews",
        description:
          "Hover and button previews in Config, including live WebGL shader previews.",
      },
      {
        title: "Product announcement graphics",
        description:
          "Catalog-constrained json-render graphic with validated JSON spec.",
      },
      {
        title: "Map motion graphics",
        description:
          "Animated route reveals, arcs, globe flyovers, and markers via MapLibre GL.",
      },
      {
        title: "Agent motion playbooks",
        description:
          "motion-canvas, motion-graphics, and motion-shorts templates; installable via npx skills add.",
      },
    ],
  },
  {
    id: "audio-look",
    title: "Audio, look, and captions",
    features: [
      {
        title: "Captions",
        description:
          "Preview overlay and ASS burn-in on export; five style presets shared by preview and export.",
      },
      {
        title: "Music placement",
        description:
          "Background bed with gain, fades, source in-point, trim/loop mode, and timeline drag-trim.",
      },
      {
        title: "Ducking, loudness, and voice polish",
        description:
          "Export-only ducking, loudness normalization, voice highpass, and de-essing.",
      },
      {
        title: "Color grade and LUT",
        description:
          "Named grades, continuous color knobs, and .cube LUTs applied at export.",
      },
    ],
  },
  {
    id: "export",
    title: "Export and delivery",
    features: [
      {
        title: "Export",
        description:
          "ffmpeg composes kept ranges, overlays, and captions; GUI dialog with height, compression, fps, and GIF.",
      },
      {
        title: "Export platform presets",
        description:
          "YouTube, X, LinkedIn, and Shorts presets with aspect, fps, height, and loudness defaults.",
      },
      {
        title: "Vertical reframe",
        description:
          "9:16, 1:1, manual/scene/vision crop, fill/split layout, and caption safe-area inset.",
      },
      {
        title: "Vision reframe sidecar",
        description:
          "macOS face and saliency focus plus on-frame OCR; enriches sceneLog segments.",
      },
      {
        title: "LLM highlight detection",
        description:
          "Find short-form clip candidates; export each to output/highlights/.",
      },
      {
        title: "Make short",
        description:
          "agent-make-short script: Vision enrich, 9:16 reframe, shorts export, and verify.",
      },
    ],
  },
  {
    id: "agent",
    title: "Agent and automation",
    features: [
      {
        title: "Agent chat",
        description:
          "Slash skills menu; Claude applies edits via MCP; other agents suggest CLI commands.",
      },
      {
        title: "Agent tasks with live progress",
        description:
          "Visible task steps, 2s polling, cancel kills the agent process.",
      },
      {
        title: "Action history",
        description:
          "Append-only log with actor, revision, filters, and transcript diff on cut mutations.",
      },
      {
        title: "Revert",
        description:
          "Restore project.json to an earlier revision, task start, or last edit.",
      },
      {
        title: "Project brief",
        description:
          "brief.md for audience, goal, tone, and ship targets; brief audit before export.",
      },
      {
        title: "Edit templates and playbooks",
        description:
          "make-draft, make-short, make-highlights, and revise-draft skills.",
      },
      {
        title: "Agent selector",
        description:
          "Drive filler cuts via Claude Code, Codex, Cursor, or Grok subscription CLIs.",
      },
      {
        title: "Agent demo",
        description:
          "Deterministic phrase-list cut script with optional export.",
      },
    ],
  },
  {
    id: "surfaces",
    title: "CLI, MCP, and workspace",
    features: [
      {
        title: "CLI",
        description:
          "Full edit surface; actions --json mutations manifest and tools --json agent tool list.",
      },
      {
        title: "MCP server",
        description:
          "stdio server with 89 tools across query, mutation, task progress, revert, and export.",
      },
      {
        title: "Browser project creation",
        description:
          "Upload, import folder, import from URL, or drop files on the empty workspace.",
      },
      {
        title: "Browser editor",
        description: "Script-first editing at localhost after openklip serve.",
      },
      {
        title: "Workspace",
        description:
          "macOS folder picker, inline project create, projects root in .openklip/projects-root.",
      },
      {
        title: "Edit templates and brand presets",
        description:
          "templates/<id>/skill.md playbooks and brand presets at ingest.",
      },
      {
        title: "Design system",
        description:
          "shadcn/ui tokens with Base UI primitives; light and dark via .dark class.",
      },
    ],
  },
];

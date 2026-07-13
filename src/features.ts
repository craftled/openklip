// Product capability registry: human-facing features shipped in the current release.
// Operations (mutations, agent tools) live in registry.ts and agent-tools.ts; this
// layer groups them for Settings, CLI, MCP, API, and README parity tests.
import { z } from "zod";
import type { Surface } from "./registry.ts";

export const FEATURE_GROUP_IDS = [
  "editing",
  "preview",
  "overlays",
  "graphics",
  "audio",
  "export",
  "agent",
  "surfaces",
] as const;

export type FeatureGroupId = (typeof FEATURE_GROUP_IDS)[number];

export const FEATURE_STATUSES = ["shipped", "beta", "experimental"] as const;

export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

const FeatureLinksSchema = z
  .object({
    tools: z.array(z.string()).optional(),
    actions: z.array(z.string()).optional(),
    templates: z.array(z.string()).optional(),
    cli: z.array(z.string()).optional(),
  })
  .optional();

const FeatureRequiresSchema = z
  .object({
    platform: z.enum(["darwin"]).optional(),
    bins: z.array(z.string()).optional(),
  })
  .optional();

export const FeatureDefSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1),
  description: z.string().min(1),
  group: z.enum(FEATURE_GROUP_IDS),
  status: z.enum(FEATURE_STATUSES).default("shipped"),
  since: z.string().optional(),
  surfaces: z.array(z.enum(["cli", "gui", "mcp"])),
  links: FeatureLinksSchema,
  requires: FeatureRequiresSchema,
});

export type FeatureDef = z.infer<typeof FeatureDefSchema>;

export const featureGroups: ReadonlyArray<{
  id: FeatureGroupId;
  title: string;
}> = [
  { id: "editing", title: "Editing" },
  { id: "preview", title: "Preview and player" },
  { id: "overlays", title: "Overlays and assets" },
  { id: "graphics", title: "Graphics and motion" },
  { id: "audio", title: "Audio, look, and captions" },
  { id: "export", title: "Export and delivery" },
  { id: "agent", title: "Agent and automation" },
  { id: "surfaces", title: "CLI, MCP, and workspace" },
];

const RAW_FEATURES: FeatureDef[] = [
  {
    id: "ingest",
    title: "Ingest",
    description:
      "Video to local transcript, preview proxy, and project.json. Re-ingest requires --force.",
    group: "editing",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: { cli: ["ingest"] },
  },
  {
    id: "transcript-editing",
    title: "Transcript editing",
    description:
      "Click words to toggle deleted in the browser; cut, phrase cut, and restore on the CLI.",
    group: "editing",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: ["cut", "cut-text", "restore-all"],
      tools: ["cut", "cut-text", "restore-all"],
    },
  },
  {
    id: "phrase-search-batch-cuts",
    title: "Phrase search + batch cuts",
    description:
      "Mod+F search with exact and fuzzy matching, Cut first / Cut all, Restore all, and optional notes.",
    group: "editing",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: ["cut", "cut-text", "restore-all"],
      tools: ["transcript_grep", "transcript_phrase", "cut-text"],
    },
  },
  {
    id: "bounded-transcript-reads",
    title: "Bounded transcript reads",
    description:
      "CLI grep, span, and phrase helpers for agents without dumping full transcripts.",
    group: "editing",
    status: "shipped",
    surfaces: ["cli", "mcp"],
    links: {
      cli: ["transcript"],
      tools: ["transcript_grep", "transcript_span", "transcript_phrase"],
    },
  },
  {
    id: "cleanup-review",
    title: "Cleanup review",
    description:
      "Filler cleanup by category (hesitation, hedging, repeat) plus dead-air candidates with persisted minSec/keepPadSec thresholds; apply-all-safe or apply-enabled batch actions.",
    group: "editing",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      cli: ["cleanup"],
      tools: ["cleanup_report"],
      actions: [
        "cut",
        "dead-air-add",
        "dead-air-rm",
        "cleanup-config",
        "cleanup-apply",
      ],
    },
  },
  {
    id: "cleanup-silence-waveform",
    title: "Cleanup silence waveform",
    description:
      "Silence waveform on the Cleanup tab plus categorized AI cleanup apply: dead-air from audio analysis, peaks API, and batch cleanup-apply with undo-safe created-vs-extended span tracking.",
    group: "editing",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      tools: ["cleanup_report"],
      actions: [
        "cleanup-apply",
        "cleanup-config",
        "dead-air-add",
        "dead-air-rm",
      ],
    },
  },
  {
    id: "vad-snap-seam-crossfades",
    title: "VAD snap + seam crossfades",
    description:
      "Cut boundaries snap to silence; export joins seams with equal-power crossfades.",
    group: "editing",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: { actions: ["cuts-snap"], cli: ["cuts-snap"] },
  },
  {
    id: "written-rationale",
    title: "Written rationale",
    description:
      "Optional --note on cuts and overlays records why a pick was made (metadata only).",
    group: "editing",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: ["cut", "broll-add", "title-add", "zoom-add", "graphic-add"],
    },
  },
  {
    id: "phrase-anchored-cues",
    title: "Phrase-anchored cues",
    description:
      "Phrase-placed overlays re-resolve onto kept words after a re-cut; stale when phrase is cut.",
    group: "editing",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: ["reanchor"],
      cli: ["reanchor"],
      tools: [
        "title-add-phrase",
        "zoom-add-phrase",
        "broll-add-phrase",
        "graphic-add-phrase",
      ],
    },
  },
  {
    id: "multi-take-assembly",
    title: "Multi-take assembly",
    description:
      "Splice the best take per line into one source; browse, upload, and assemble in the Config panel.",
    group: "editing",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      cli: ["take-add", "takes", "assemble"],
      tools: ["take_add", "list_takes", "assemble"],
    },
  },
  {
    id: "preview",
    title: "Preview",
    description:
      "All-intra proxy; scheduler plays kept ranges only in a compact center column.",
    group: "preview",
    status: "shipped",
    surfaces: ["gui"],
  },
  {
    id: "editor-layout",
    title: "Editor layout",
    description:
      "Fixed 20rem shadcn sidebars, unified chat timeline, preview header, transcript, and timeline drawer.",
    group: "preview",
    status: "shipped",
    surfaces: ["gui"],
  },
  {
    id: "cinema-player",
    title: "Cinema player",
    description:
      "Fullscreen overlay with transport bar and the same overlay stack as inline preview.",
    group: "preview",
    status: "shipped",
    surfaces: ["gui"],
  },
  {
    id: "preview-cut-transitions",
    title: "Preview cut transitions",
    description:
      "WebGL glimm sweep at cut boundaries; respects prefers-reduced-motion.",
    group: "preview",
    status: "shipped",
    surfaces: ["gui"],
    links: { actions: ["look-transition"] },
  },
  {
    id: "fullscreen-overlays",
    title: "Fullscreen overlays",
    description:
      "Graphics, titles, and captions render in cinema mode, synced to playback.",
    group: "preview",
    status: "shipped",
    surfaces: ["gui"],
  },
  {
    id: "config-shell-responsive-panels",
    title: "Config shell + responsive panels",
    description:
      "Right-side Config with color pad and timing controls; Settings lists shipped capabilities; mobile overlay buttons.",
    group: "preview",
    status: "shipped",
    surfaces: ["gui"],
  },
  {
    id: "agent-chat",
    title: "Agent chat",
    description:
      "Slash skills menu; Claude applies edits via MCP; other agents suggest CLI commands.",
    group: "agent",
    status: "shipped",
    surfaces: ["gui", "mcp"],
    links: {
      tools: ["load_skill", "template_list"],
      cli: ["tools"],
    },
  },
  {
    id: "asset-cards",
    title: "Asset cards",
    description:
      "Describe assets runs subagents that write summary, tags, and bestFor for placement.",
    group: "overlays",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: { cli: ["analyze"], tools: ["asset_cards"] },
  },
  {
    id: "assets",
    title: "Assets",
    description:
      "Register b-roll, music, and stills; sidebar bin with upload and assets/ folder sync.",
    group: "overlays",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      cli: ["broll", "asset-add", "assets"],
      tools: ["list_assets"],
    },
  },
  {
    id: "overlays",
    title: "Overlays",
    description:
      "B-roll cover, Ken Burns stills, push-in zooms, title cards, and vignette.",
    group: "overlays",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: [
        "broll-add",
        "still-add",
        "zoom-add",
        "title-add",
        "look-vignette",
      ],
      tools: ["project_overlays"],
    },
  },
  {
    id: "broll-suggest",
    title: "B-roll suggest",
    description:
      "Rank registered assets for a spoken span using asset cards; respects must-use and avoid.",
    group: "overlays",
    status: "shipped",
    since: "0.41.1.0",
    surfaces: ["cli", "mcp"],
    links: { cli: ["broll-suggest"], tools: ["broll_suggest"] },
  },
  {
    id: "blank-canvas-projects",
    title: "Blank canvas projects",
    description: "Create motion-from-scratch projects without camera footage.",
    group: "overlays",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: { cli: ["ingest"], tools: ["blank_ingest"] },
  },
  {
    id: "captions",
    title: "Captions",
    description:
      "Preview overlay and ASS burn-in on export; five style presets shared by preview and export.",
    group: "audio",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: ["captions", "captions-style", "captions-max", "captions-inset"],
    },
  },
  {
    id: "music-placement",
    title: "Music placement",
    description:
      "Background bed with gain, fades, source in-point, trim/loop mode, and timeline drag-trim.",
    group: "audio",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: ["music-add", "music-set", "music-rm"],
      tools: ["music_bpm"],
    },
  },
  {
    id: "ducking-loudness-voice-polish",
    title: "Ducking, loudness, voice highpass, and de-essing",
    description:
      "Export-only ducking, loudness normalization, voice highpass, and de-essing.",
    group: "audio",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: ["audio"],
      cli: ["audio"],
      tools: ["audio_measure"],
    },
  },
  {
    id: "rich-graphics-templates",
    title: "Rich graphics templates",
    description:
      "HTML/CSS templates via headless Chrome; motion pack, shader pack, and project-local overrides.",
    group: "graphics",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: ["graphic-add", "graphic-set", "graphic-rm"],
      tools: ["graphic_list", "graphic_show"],
      cli: ["graphic"],
    },
    requires: { bins: ["chrome-headless-shell"] },
  },
  {
    id: "motion-graphics-workflow",
    title: "Motion graphics workflow",
    description:
      "Phrase placement, beat-snapped spans, BPM detect, cut-seam transitions, and Config Graphics picker.",
    group: "graphics",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: ["graphic-add", "graphic-add-cuts"],
      tools: [
        "graphic_list",
        "graphic_show",
        "music_bpm",
        "graphic-add-phrase",
      ],
      templates: ["motion-graphics", "motion-shorts"],
    },
  },
  {
    id: "agent-motion-playbooks",
    title: "Agent motion playbooks",
    description:
      "motion-canvas, motion-graphics, and motion-shorts templates; installable via npx skills add.",
    group: "graphics",
    status: "shipped",
    surfaces: ["cli", "mcp"],
    links: {
      templates: ["motion-canvas", "motion-graphics", "motion-shorts"],
      tools: ["load_skill", "template_list"],
    },
  },
  {
    id: "graphic-keyframe-animation",
    title: "Graphic keyframe animation",
    description:
      "Declarative keyframes with seven easings; preview and export render identically.",
    group: "graphics",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: { actions: ["graphic-set"] },
  },
  {
    id: "product-announcement-graphics",
    title: "Product announcement graphics",
    description:
      "Catalog-constrained json-render graphic with validated JSON spec.",
    group: "graphics",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: ["json-graphic-add", "json-graphic-set"],
      templates: ["product-announcement"],
    },
  },
  {
    id: "map-motion-graphics",
    title: "Map motion graphics",
    description:
      "Animated route reveals, arcs, globe flyovers, and markers via MapLibre GL.",
    group: "graphics",
    status: "shipped",
    since: "0.41.1.0",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: ["json-graphic-add", "json-graphic-set"],
      templates: ["map-motion"],
    },
  },
  {
    id: "graphic-template-previews",
    title: "Graphic template previews",
    description:
      "Hover and button previews in Config, including live WebGL shader previews.",
    group: "graphics",
    status: "shipped",
    since: "0.41.1.0",
    surfaces: ["gui"],
  },
  {
    id: "export",
    title: "Export",
    description:
      "ffmpeg composes kept ranges, overlays, and captions; GUI dialog with height, compression, fps, and GIF.",
    group: "export",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: { cli: ["export"], tools: ["export"] },
  },
  {
    id: "export-platform-presets",
    title: "Export platform presets",
    description:
      "YouTube, X, LinkedIn, and Shorts presets with aspect, fps, height, and loudness defaults.",
    group: "export",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: { cli: ["export"], tools: ["export"] },
  },
  {
    id: "vertical-reframe-shorts",
    title: "Vertical reframe (Shorts)",
    description:
      "9:16, 1:1, manual/scene/vision crop, fill/split layout, and caption safe-area inset.",
    group: "export",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      actions: ["export-set", "captions-inset"],
      cli: ["export-set", "captions-inset"],
    },
  },
  {
    id: "vision-reframe-sidecar",
    title: "Vision reframe sidecar",
    description:
      "macOS face and saliency focus plus on-frame OCR; enriches sceneLog segments.",
    group: "export",
    status: "shipped",
    surfaces: ["cli", "gui"],
    links: { cli: ["vision-focus"] },
    requires: { platform: "darwin" },
  },
  {
    id: "llm-highlight-detection",
    title: "LLM highlight detection",
    description:
      "Find short-form clip candidates; export each to output/highlights/.",
    group: "export",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      cli: ["highlights-detect", "export-highlight"],
      tools: ["highlights_detect", "highlights_list", "export_highlight"],
    },
  },
  {
    id: "make-short",
    title: "Make short",
    description:
      "agent-make-short script: Vision enrich, 9:16 reframe, shorts export, and verify.",
    group: "export",
    status: "shipped",
    surfaces: ["cli"],
    links: { templates: ["make-short"], cli: ["export", "verify"] },
    requires: { platform: "darwin" },
  },
  {
    id: "action-history",
    title: "Action history",
    description:
      "Append-only log with actor, revision, filters, and transcript diff on cut mutations.",
    group: "agent",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: { cli: ["history"], tools: ["history_list"] },
  },
  {
    id: "revert-undo",
    title: "Revert (undo)",
    description:
      "Restore project.json to an earlier revision, task start, or last edit.",
    group: "agent",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: { cli: ["revert"], tools: ["revert"] },
  },
  {
    id: "project-brief",
    title: "Project brief",
    description:
      "brief.md for audience, goal, tone, and ship targets; brief audit before export.",
    group: "agent",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      cli: ["brief"],
      tools: ["brief_get", "brief_set", "brief_audit"],
    },
  },
  {
    id: "agent-tasks-live-progress",
    title: "Agent tasks with live progress",
    description:
      "Visible task steps, 2s polling, cancel kills the agent process.",
    group: "agent",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      cli: ["tasks"],
      tools: ["task_list", "task_step", "task_complete"],
    },
  },
  {
    id: "edit-playbooks",
    title:
      "Make-a-draft, make-short, make-highlights, revise-draft, and viral-launch playbooks",
    description:
      "Agent playbooks for first draft, shorts, highlights, revisions, and launch edits.",
    group: "agent",
    status: "shipped",
    surfaces: ["cli", "mcp"],
    links: {
      templates: [
        "make-draft",
        "make-short",
        "make-highlights",
        "revise-draft",
        "viral-launch",
      ],
      tools: ["load_skill", "template_list"],
    },
  },
  {
    id: "agent-selector",
    title: "Agent selector",
    description:
      "Drive filler cuts via Claude Code, Codex, Cursor, or Grok subscription CLIs.",
    group: "agent",
    status: "shipped",
    surfaces: ["gui"],
  },
  {
    id: "agent-demo",
    title: "Agent demo",
    description: "Deterministic phrase-list cut script with optional export.",
    group: "agent",
    status: "shipped",
    surfaces: ["cli"],
  },
  {
    id: "browser-project-creation",
    title: "Browser project creation",
    description:
      "Upload, import folder, import from URL, or drop files on the empty workspace.",
    group: "surfaces",
    status: "shipped",
    surfaces: ["gui"],
    requires: { bins: ["yt-dlp"] },
  },
  {
    id: "browser-editor",
    title: "Browser editor",
    description: "Script-first editing at localhost after openklip serve.",
    group: "surfaces",
    status: "shipped",
    surfaces: ["gui"],
    links: { cli: ["serve", "dev"] },
  },
  {
    id: "workspace",
    title: "Workspace",
    description:
      "macOS folder picker, inline project create, projects root in .openklip/projects-root.",
    group: "surfaces",
    status: "shipped",
    surfaces: ["gui", "cli"],
    requires: { platform: "darwin" },
  },
  {
    id: "cli",
    title: "CLI",
    description:
      "Full edit surface; actions --json mutations manifest and tools --json agent tool list.",
    group: "surfaces",
    status: "shipped",
    surfaces: ["cli"],
    links: { cli: ["actions", "tools"] },
  },
  {
    id: "mcp-server",
    title: "MCP server",
    description:
      "stdio server with query, mutation, task progress, revert, and export tools.",
    group: "surfaces",
    status: "shipped",
    surfaces: ["mcp"],
    links: { cli: ["mcp", "tools"] },
  },
  {
    id: "edit-templates",
    title: "Edit templates",
    description:
      "templates/<id>/skill.md playbooks and brand presets at ingest.",
    group: "surfaces",
    status: "shipped",
    surfaces: ["cli", "gui", "mcp"],
    links: {
      cli: ["template"],
      tools: ["template_list", "template_show", "template_set", "load_skill"],
    },
  },
  {
    id: "design-system",
    title: "Design system",
    description:
      "shadcn/ui tokens with Base UI primitives; light and dark via .dark class.",
    group: "surfaces",
    status: "shipped",
    surfaces: ["gui"],
  },
];

export const features: ReadonlyArray<FeatureDef> = z
  .array(FeatureDefSchema)
  .parse(RAW_FEATURES);

export interface ListFeaturesOptions {
  group?: FeatureGroupId | string;
  status?: FeatureStatus;
  surface?: Surface;
}

export function listFeatures(opts?: ListFeaturesOptions): FeatureDef[] {
  let list = [...features];
  if (opts?.group) {
    list = list.filter((f) => f.group === opts.group);
  }
  if (opts?.status) {
    list = list.filter((f) => f.status === opts.status);
  }
  if (opts?.surface) {
    const surface = opts.surface;
    list = list.filter((f) => f.surfaces.includes(surface));
  }
  return list;
}

export function getFeature(id: string): FeatureDef | undefined {
  return features.find((f) => f.id === id);
}

export interface FeatureManifestEntry {
  description: string;
  group: FeatureGroupId;
  id: string;
  links?: FeatureDef["links"];
  requires?: FeatureDef["requires"];
  since?: string;
  status: FeatureStatus;
  surfaces: Surface[];
  title: string;
}

export function featureManifest(opts?: ListFeaturesOptions): {
  features: FeatureManifestEntry[];
  groups: typeof featureGroups;
} {
  return {
    groups: featureGroups,
    features: listFeatures(opts).map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      group: f.group,
      status: f.status,
      since: f.since,
      surfaces: f.surfaces,
      links: f.links,
      requires: f.requires,
    })),
  };
}

export function featureTable(opts?: ListFeaturesOptions): string {
  const lines: string[] = [
    "| Feature | Group | Surfaces |",
    "| --- | --- | --- |",
  ];
  for (const f of listFeatures(opts)) {
    lines.push(`| ${f.title} | ${f.group} | ${f.surfaces.join(", ")} |`);
  }
  return lines.join("\n");
}

export function normalizeFeatureTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\(v[\d.]+\)\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s*\+\s*/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

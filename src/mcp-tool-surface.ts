/**
 * Deferred MCP tool surface (CRAFT-6169).
 *
 * Default: only a small core set is enabled at connect so hosts pay schema
 * tokens for the common edit loop, not all ~98 tools. Agents discover the
 * rest via tools_catalog, enable them with tools_load (list_changed), or
 * call any tool by name with tools_invoke.
 *
 * OPENKLIP_MCP_SURFACE=all restores the previous "everything enabled" mode
 * (used by the in-app tool-calling edit agent).
 */

export type McpSurfaceMode = "core" | "all";

/** Always enabled at connect in "core" mode (plus meta tools). */
export const MCP_CORE_TOOL_NAMES = [
  "list_projects",
  "project_status",
  "project_overlays",
  "project_ranges",
  "transcript_grep",
  "transcript_phrase",
  "transcript_span",
  "transcript_list",
  "cut",
  "cut-text",
  "restore-all",
  "word-text",
  "export",
  "doctor",
  "verify",
  "load_skill",
  "template_list",
  "template_show",
  "template_set",
  "features_list",
  "brief_get",
  "brief_set",
  "brief_audit",
  "task_step",
  "task_complete",
  "history_list",
  "task_list",
  "revert",
] as const;

export type McpCoreToolName = (typeof MCP_CORE_TOOL_NAMES)[number];

const CORE_SET = new Set<string>(MCP_CORE_TOOL_NAMES);

/** Named groups for tools_load({ group }). */
export const MCP_TOOL_GROUPS: Record<string, readonly string[]> = {
  core: MCP_CORE_TOOL_NAMES,
  overlays: [
    "broll-add",
    "broll-set",
    "broll-rm",
    "broll-add-phrase",
    "still-add",
    "still-set",
    "still-rm",
    "title-add",
    "title-set",
    "title-rm",
    "title-add-phrase",
    "zoom-add",
    "zoom-set",
    "zoom-rm",
    "zoom-add-phrase",
    "music-add",
    "music-set",
    "music-rm",
    "graphic-add",
    "graphic-set",
    "graphic-rm",
    "graphic-add-phrase",
    "graphic-add-cuts",
    "json-graphic-add",
    "json-graphic-set",
    "reorder",
    "reanchor",
    "graphic_list",
    "graphic_show",
  ],
  look: [
    "look-vignette",
    "look-filter",
    "look-lut",
    "look-color",
    "look-transition",
    "motion",
    "captions",
    "captions-max",
    "captions-style",
    "captions-inset",
    "pad",
    "cuts-snap",
    "audio",
    "audio_measure",
    "luts",
  ],
  cleanup: [
    "cleanup_report",
    "cleanup-config",
    "cleanup-apply",
    "dead-air-add",
    "dead-air-rm",
  ],
  assets: [
    "list_assets",
    "asset_cards",
    "broll_suggest",
    "asset-flags",
    "blank_ingest",
    "music_bpm",
  ],
  multicam: [
    "cam_add",
    "list_cams",
    "cam_set",
    "cam_mix",
    "cam_override",
    "take_add",
    "list_takes",
    "take_transcript",
    "assemble",
  ],
  export: [
    "export",
    "export-set",
    "export_highlight",
    "highlights_list",
    "highlights_detect",
    "verify",
  ],
  search: ["moment_search", "scene_log", "broll_suggest"],
};

export const MCP_META_TOOL_NAMES = [
  "tools_catalog",
  "tools_load",
  "tools_invoke",
] as const;

export function parseMcpSurfaceMode(
  raw: string | undefined | null
): McpSurfaceMode {
  const v = (raw ?? "core").trim().toLowerCase();
  if (v === "all" || v === "full") {
    return "all";
  }
  return "core";
}

export function isMcpCoreTool(name: string): boolean {
  return CORE_SET.has(name);
}

export function isMcpMetaTool(name: string): boolean {
  return (MCP_META_TOOL_NAMES as readonly string[]).includes(name);
}

export function shouldEnableAtConnect(
  toolName: string,
  mode: McpSurfaceMode
): boolean {
  if (isMcpMetaTool(toolName)) {
    return true;
  }
  if (mode === "all") {
    return true;
  }
  return isMcpCoreTool(toolName);
}

export interface ToolCatalogEntry {
  enabledAtConnect: boolean;
  groupHints: string[];
  name: string;
  summary: string;
}

export function groupHintsForTool(name: string): string[] {
  const hints: string[] = [];
  for (const [group, members] of Object.entries(MCP_TOOL_GROUPS)) {
    if (members.includes(name)) {
      hints.push(group);
    }
  }
  return hints;
}

export function buildToolsCatalog(
  tools: ReadonlyArray<{ name: string; summary: string }>,
  mode: McpSurfaceMode
): ToolCatalogEntry[] {
  return tools
    .filter((t) => !isMcpMetaTool(t.name))
    .map((t) => ({
      name: t.name,
      summary: t.summary,
      enabledAtConnect: shouldEnableAtConnect(t.name, mode),
      groupHints: groupHintsForTool(t.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterToolsCatalog(
  catalog: readonly ToolCatalogEntry[],
  query?: string
): ToolCatalogEntry[] {
  const q = query?.trim().toLowerCase();
  if (!q) {
    return [...catalog];
  }
  return catalog.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q) ||
      t.groupHints.some((g) => g.includes(q))
  );
}

export interface ToolsLoadRequest {
  /** Load every known agent tool. */
  all?: boolean;
  /** Named group from MCP_TOOL_GROUPS. */
  group?: string;
  /** Exact tool names. */
  names?: readonly string[];
  /**
   * Same match rules as tools_catalog: name, summary, or group hint
   * (substring, case-insensitive).
   */
  query?: string;
}

export interface ToolsLoadPlan {
  /** Tool names that should be enabled (excluding meta). */
  toEnable: string[];
  unknownGroups: string[];
  unknownNames: string[];
}

/**
 * Resolve which tool names to enable from a tools_load request.
 * `knownTools` is the full agent tool list (not including meta tools).
 * Query matching uses the same name/summary/group rules as tools_catalog.
 */
export function planToolsLoad(
  request: ToolsLoadRequest,
  knownTools: ReadonlyArray<{ name: string; summary: string }>
): ToolsLoadPlan {
  const knownNames = knownTools.map((t) => t.name);
  const known = new Set(knownNames);
  const want = new Set<string>();
  const unknownNames: string[] = [];
  const unknownGroups: string[] = [];

  if (request.all) {
    for (const n of knownNames) {
      want.add(n);
    }
  }

  if (request.group) {
    const members = MCP_TOOL_GROUPS[request.group];
    if (members) {
      for (const n of members) {
        if (known.has(n)) {
          want.add(n);
        }
      }
    } else {
      unknownGroups.push(request.group);
    }
  }

  if (request.names) {
    for (const n of request.names) {
      if (known.has(n)) {
        want.add(n);
      } else if (!isMcpMetaTool(n)) {
        unknownNames.push(n);
      }
    }
  }

  if (request.query?.trim()) {
    // Parity with tools_catalog: name, summary, and groupHints.
    const catalog = buildToolsCatalog(knownTools, "all");
    for (const entry of filterToolsCatalog(catalog, request.query)) {
      want.add(entry.name);
    }
  }

  return {
    toEnable: [...want].sort((a, b) => a.localeCompare(b)),
    unknownNames,
    unknownGroups,
  };
}

/** Rough UTF-8 size of a tools/list-style payload (name + summary + schema). */
export function estimateToolListBytes(
  tools: ReadonlyArray<{
    inputSchema?: unknown;
    name: string;
    summary: string;
  }>
): number {
  return tools.reduce((sum, t) => {
    const schemaPart = t.inputSchema ? JSON.stringify(t.inputSchema).length : 0;
    return sum + t.name.length + t.summary.length + schemaPart + 24;
  }, 0);
}

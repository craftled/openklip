// Optional per-project agent instructions (Pi-style context files). Lives beside
// project.json as AGENTS.local.md so creators can override global AGENTS.md rules
// for one project without touching the EDL.
import { existsSync, readFileSync } from "node:fs";
import type { Project } from "./edl.ts";
import { projectPaths } from "./paths.ts";
import type { ProjectStatusJson } from "./query.ts";
import { projectStatus } from "./query.ts";

export const PROJECT_CONTEXT_FILENAME = "AGENTS.local.md";

/** Max chars injected into prompts / status JSON (keeps agent context bounded). */
export const PROJECT_CONTEXT_MAX_CHARS = 8000;

export function projectContextPath(slug: string): string {
  return projectPaths(slug).agentsLocal;
}

/** Read trimmed project context markdown, or undefined when absent/empty. */
export function loadProjectContext(slug: string): string | undefined {
  const fp = projectContextPath(slug);
  if (!existsSync(fp)) {
    return;
  }
  const raw = readFileSync(fp, "utf8").trim();
  if (!raw) {
    return;
  }
  if (raw.length <= PROJECT_CONTEXT_MAX_CHARS) {
    return raw;
  }
  return `${raw.slice(0, PROJECT_CONTEXT_MAX_CHARS)}… [context truncated]`;
}

/** Prompt block for buildChatPrompt / buildEditPrompt, or "" when absent. */
export function contextBlock(projectContext?: string): string {
  const text = projectContext?.trim();
  if (!text) {
    return "";
  }
  return `
Project-specific instructions (AGENTS.local.md):
"""
${text}
"""
`;
}

export function projectStatusWithContext(
  project: Project,
  slug: string
): ProjectStatusJson & { context?: string } {
  const base = projectStatus(project);
  const context = loadProjectContext(slug);
  return context ? { ...base, context } : base;
}

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoPath } from "./repo-paths.ts";

const TEMPLATE_ID = /^[a-z][a-z0-9-]*$/;

export interface TemplateListing {
  description: string;
  id: string;
  label: string;
}

export function templatesRoot(): string {
  return repoPath("templates");
}

export function assertValidTemplateId(id: string): string {
  if (typeof id !== "string" || id.length > 64 || !TEMPLATE_ID.test(id)) {
    throw new Error(`invalid template id: ${JSON.stringify(id)}`);
  }
  return id;
}

export function templateDir(id: string): string {
  return join(templatesRoot(), assertValidTemplateId(id));
}

export function templateSkillPath(id: string): string {
  return join(templateDir(id), "skill.md");
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(raw: string): {
  description?: string;
  label?: string;
  name?: string;
  rest: string;
} | null {
  if (!raw.startsWith("---\n") && raw !== "---") {
    return null;
  }
  const lines = raw.split("\n");
  if (lines[0] !== "---") {
    return null;
  }
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) {
    return null;
  }
  const fmLines = lines.slice(1, closingIndex);
  const rest = lines.slice(closingIndex + 1).join("\n");
  const result: { description?: string; label?: string; name?: string } = {};
  for (const line of fmLines) {
    const match = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1].trim();
    const value = stripQuotes(match[2].trim());
    if (key === "description") {
      result.description = value;
    } else if (key === "label") {
      result.label = value;
    } else if (key === "name") {
      result.name = value;
    }
  }
  return { ...result, rest };
}

export function parseSkillMeta(
  raw: string,
  id: string
): { label: string; description: string } {
  const frontmatter = parseFrontmatter(raw);
  const body = frontmatter ? frontmatter.rest : raw;

  const heading = body.match(/^#\s+(.+)$/m);
  const headingLabel = heading?.[1]?.trim() || id;
  // label wins over name when both are present in frontmatter
  const label = frontmatter?.label ?? frontmatter?.name ?? headingLabel;

  const bodyLine = body
    .replace(/^#\s+.+$/m, "")
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));
  const description = frontmatter?.description ?? bodyLine ?? "";

  return { label, description };
}

export function listTemplates(): TemplateListing[] {
  const root = templatesRoot();
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root)
    .map((name) => {
      const skillPath = join(root, name, "skill.md");
      if (!existsSync(skillPath)) {
        return null;
      }
      try {
        assertValidTemplateId(name);
      } catch {
        return null;
      }
      const raw = readFileSync(skillPath, "utf8");
      const meta = parseSkillMeta(raw, name);
      return { id: name, ...meta };
    })
    .filter((item): item is TemplateListing => item !== null)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function loadTemplateSkill(id: string): string {
  const path = templateSkillPath(id);
  if (!existsSync(path)) {
    throw new Error(`template not found: ${id} (${path})`);
  }
  return readFileSync(path, "utf8");
}

export function defaultTemplateId(): string {
  const listed = listTemplates();
  if (listed.some((t) => t.id === "talking-head")) {
    return "talking-head";
  }
  return listed[0]?.id ?? "talking-head";
}

export function applyProjectTemplate(
  project: { template?: string },
  templateId: string | null | undefined
): void {
  if (templateId === null || templateId === undefined || templateId === "") {
    project.template = undefined;
    return;
  }
  assertValidTemplateId(templateId);
  if (!existsSync(templateSkillPath(templateId))) {
    throw new Error(`template not found: ${templateId}`);
  }
  project.template = templateId;
}

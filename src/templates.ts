import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const TEMPLATE_ID = /^[a-z][a-z0-9-]*$/;

export interface TemplateListing {
  description: string;
  id: string;
  label: string;
}

export function templatesRoot(): string {
  return resolve(process.cwd(), "templates");
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

function parseSkillMeta(
  raw: string,
  id: string
): { label: string; description: string } {
  const heading = raw.match(/^#\s+(.+)$/m);
  const label = heading?.[1]?.trim() || id;
  const body = raw
    .replace(/^#\s+.+$/m, "")
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));
  return { label, description: body ?? "" };
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

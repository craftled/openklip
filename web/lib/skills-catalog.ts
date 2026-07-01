import {
  listWorkflowSkills,
  type WorkflowSkillListing,
} from "./skill-router.ts";

export type SkillKind = "template" | "workflow";

export interface SkillEntry {
  description: string;
  id: string;
  invokeText: string;
  kind: SkillKind;
  slash: string;
  templateId?: string;
  title: string;
}

export interface TemplateSkillSource {
  description: string;
  id: string;
  label: string;
}

export function parseSlashQuery(value: string): { query: string } | null {
  if (!value.startsWith("/")) {
    return null;
  }
  return { query: value.slice(1) };
}

export function buildSkillCatalog(
  templates: TemplateSkillSource[] = []
): SkillEntry[] {
  const workflows: SkillEntry[] = listWorkflowSkills().map(
    (skill: WorkflowSkillListing) => ({
      id: skill.id,
      title: skill.title,
      description: skill.description,
      slash: skill.slash,
      invokeText: skill.invokeText,
      kind: "workflow" as const,
    })
  );

  const templateSkills: SkillEntry[] = templates.map((template) => ({
    id: `template:${template.id}`,
    templateId: template.id,
    title: template.label,
    description:
      template.description ||
      `Load the ${template.label} edit playbook for this project.`,
    slash: template.id,
    invokeText: templateInvokeText(template),
    kind: "template" as const,
  }));

  return [...workflows, ...templateSkills];
}

function templateInvokeText(template: TemplateSkillSource): string {
  if (template.id === "product-announcement") {
    return 'Use the product-announcement playbook: call template_show with id "product-announcement", attach it with template_set, then create a validated json-render product announcement graphic with json-graphic-add over the strongest product claim. Use transcript tools to choose a 3-6 second span. Do not only describe JSON.';
  }
  return `Use template ${template.id}: call template_show with id "${template.id}", then apply the playbook to this edit.`;
}

export function filterSkills(
  skills: SkillEntry[],
  query: string
): SkillEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return skills;
  }
  return skills.filter((skill) => {
    const haystack = [
      skill.title,
      skill.description,
      skill.slash,
      skill.kind,
      skill.templateId ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function skillKindLabel(kind: SkillKind): string {
  return kind === "template" ? "Template" : "Workflow";
}

/** Compose the agent message from a selected skill and optional follow-up. */
export function buildSkillMessage(
  skill: SkillEntry,
  followUp?: string
): string {
  const extra = followUp?.trim();
  if (!extra) {
    return skill.invokeText;
  }
  return `${skill.invokeText}. ${extra}`;
}

export function buildSkillsMessage(
  skills: readonly SkillEntry[],
  followUp?: string
): string {
  const invokeText = skills.map((skill) => skill.invokeText).join(". ");
  const extra = followUp?.trim();
  if (!extra) {
    return invokeText;
  }
  return `${invokeText}. ${extra}`;
}

export type { AgentThread, ThreadMessage } from "@engine/chats.ts";

import { routeIntent } from "./skill-router.ts";

export function assistantHint(
  slug: string,
  userText: string,
  templateId?: string
): string {
  const match = routeIntent(userText, slug);
  const templateLine = templateId
    ? `\n\n**Template:** \`${templateId}\`. Read \`templates/${templateId}/skill.md\` or run \`openklip template show ${templateId}\` before editing.`
    : "";
  return `**${match.title}** : run this loop on the same project.json:\n\n${match.steps
    .map((s) => `  ${s}`)
    .join("\n")}${templateLine}`;
}

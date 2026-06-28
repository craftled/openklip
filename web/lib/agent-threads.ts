export type { AgentThread, ThreadMessage } from "@engine/chats.ts";

import { routeIntent } from "./skill-router.ts";

export function assistantHint(slug: string, userText: string): string {
  const match = routeIntent(userText, slug);
  return `**${match.title}** — run this loop on the same project.json:\n\n${match.steps
    .map((s) => `  ${s}`)
    .join("\n")}`;
}

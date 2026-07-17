export const CONFIG_TABS = [
  "edit",
  "look",
  "project",
  "cleanup",
  "tools",
  "history",
  "jobs",
] as const;

export type ConfigTabId = (typeof CONFIG_TABS)[number];

export const CONFIG_TAB_LABELS: Record<ConfigTabId, string> = {
  edit: "Edit",
  look: "Look",
  project: "Project",
  cleanup: "Cleanup",
  tools: "Tools",
  history: "History",
  jobs: "Jobs",
};

export function isConfigTabId(value: string): value is ConfigTabId {
  return (CONFIG_TABS as readonly string[]).includes(value);
}

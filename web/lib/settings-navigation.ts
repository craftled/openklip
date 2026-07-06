import type { ComponentType } from "react";
import {
  Bot,
  Download,
  LayoutTemplate,
  Palette,
  PlugConnected,
} from "@/lib/icon";

export type SettingsSectionId =
  | "appearance"
  | "export"
  | "agent"
  | "integrations"
  | "features";

export interface SettingsNavItem {
  description: string;
  group: SettingsNavGroupId;
  icon: ComponentType<{ className?: string }>;
  id: SettingsSectionId;
  label: string;
}

export type SettingsNavGroupId = "app";

export const SETTINGS_NAV_GROUPS: ReadonlyArray<{
  id: SettingsNavGroupId;
  label: string;
}> = [{ id: "app", label: "App" }];

export const SETTINGS_NAV_ITEMS: ReadonlyArray<SettingsNavItem> = [
  {
    id: "appearance",
    group: "app",
    label: "Appearance",
    description: "Light or dark color scheme.",
    icon: Palette,
  },
  {
    id: "export",
    group: "app",
    label: "Export",
    description: "Defaults for rendered output.",
    icon: Download,
  },
  {
    id: "agent",
    group: "app",
    label: "Agent",
    description: "Default model for new chats.",
    icon: Bot,
  },
  {
    id: "integrations",
    group: "app",
    label: "Integrations",
    description: "Connected services and API keys.",
    icon: PlugConnected,
  },
  {
    id: "features",
    group: "app",
    label: "Features",
    description: "Everything OpenKlip can do in this release.",
    icon: LayoutTemplate,
  },
];

export function normalizeSettingsSection(
  value: string | null | undefined
): SettingsSectionId {
  if (
    value === "export" ||
    value === "agent" ||
    value === "integrations" ||
    value === "features"
  ) {
    return value;
  }
  return "appearance";
}

export function settingsSectionMeta(
  section: SettingsSectionId
): SettingsNavItem {
  const item = SETTINGS_NAV_ITEMS.find((entry) => entry.id === section);
  return item ?? SETTINGS_NAV_ITEMS[0];
}

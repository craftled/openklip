"use client";

import { Bot, Check, Download, Palette } from "lucide-react";
import { AgentModelSelect } from "@/components/agent-model-select";
import { SidebarSettingsLabel } from "@/components/collapsible-sidebar";
import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import type { AgentModelId } from "@/lib/agent-preferences";
import { THEME_CATALOG } from "@/lib/theme-catalog";
import { type AppThemeId, setAppTheme } from "@/lib/theme-preferences";

export function SidebarSettingsPanel({
  appTheme,
  defaultAgent,
  export1080,
  onDefaultAgentChange,
  onExport1080Change,
}: {
  appTheme: AppThemeId;
  defaultAgent: AgentModelId;
  export1080: boolean;
  onDefaultAgentChange: (model: AgentModelId) => void;
  onExport1080Change: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4 px-2 pb-2">
      <div className="space-y-1.5">
        <SidebarSettingsLabel icon={Download}>Export</SidebarSettingsLabel>
        <SidebarMenuSub className="mx-0 gap-1 border-0 px-0 py-0">
          <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild>
              <label className="cursor-pointer">
                <Download className="size-4 shrink-0" />
                <span className="flex-1">Limit to 1080p</span>
                <Switch
                  checked={export1080}
                  id="export-1080"
                  onCheckedChange={onExport1080Change}
                />
              </label>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        </SidebarMenuSub>
      </div>

      <div className="space-y-1.5">
        <SidebarSettingsLabel icon={Palette}>Theme</SidebarSettingsLabel>
        <SidebarMenuSub className="mx-0 gap-1 border-0 px-0 py-0">
          {THEME_CATALOG.map((themeOption) => {
            const active = appTheme === themeOption.id;
            return (
              <SidebarMenuSubItem key={themeOption.id}>
                <SidebarMenuSubButton
                  isActive={active}
                  onClick={() => setAppTheme(themeOption.id)}
                >
                  {active ? (
                    <Check className="size-4 shrink-0" />
                  ) : (
                    <Palette className="size-4 shrink-0 opacity-70" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {themeOption.name}
                  </span>
                  {themeOption.supportedModes.length === 1 &&
                  themeOption.supportedModes[0] === "dark" ? (
                    <span className="shrink-0 opacity-70">dark</span>
                  ) : null}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      </div>

      <div className="space-y-1.5">
        <SidebarSettingsLabel icon={Bot}>Default agent</SidebarSettingsLabel>
        <div className="px-1 pb-0.5">
          <AgentModelSelect
            defaultAgent={defaultAgent}
            onValueChange={onDefaultAgentChange}
            value={defaultAgent}
          />
        </div>
      </div>
    </div>
  );
}

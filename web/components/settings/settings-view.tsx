"use client";

import { SettingsAgentPanel } from "@/components/settings/settings-agent-panel";
import { SettingsAppearancePanel } from "@/components/settings/settings-appearance-panel";
import { SettingsExportPanel } from "@/components/settings/settings-export-panel";
import { SettingsFeaturesPanel } from "@/components/settings/settings-features-panel";
import { SettingsIntegrationsPanel } from "@/components/settings/settings-integrations-panel";
import type { AgentModelId } from "@/lib/agent-preferences";
import {
  type SettingsSectionId,
  settingsSectionMeta,
} from "@/lib/settings-navigation";

export function SettingsView({
  activeSection,
  defaultAgent,
  export1080,
  onDefaultAgentChange,
  onExport1080Change,
}: {
  activeSection: SettingsSectionId;
  defaultAgent: AgentModelId;
  export1080: boolean;
  onDefaultAgentChange: (model: AgentModelId) => void;
  onExport1080Change: (value: boolean) => void;
}) {
  const section = settingsSectionMeta(activeSection);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-8">
          <header className="mb-8">
            <h1 className="font-medium text-foreground text-xl tracking-tight">
              {section.label}
            </h1>
            <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
              {section.description}
            </p>
          </header>

          {activeSection === "appearance" ? <SettingsAppearancePanel /> : null}
          {activeSection === "export" ? (
            <SettingsExportPanel
              export1080={export1080}
              onExport1080Change={onExport1080Change}
            />
          ) : null}
          {activeSection === "agent" ? (
            <SettingsAgentPanel
              defaultAgent={defaultAgent}
              onDefaultAgentChange={onDefaultAgentChange}
            />
          ) : null}
          {activeSection === "integrations" ? (
            <SettingsIntegrationsPanel />
          ) : null}
          {activeSection === "features" ? <SettingsFeaturesPanel /> : null}
        </div>
      </div>
    </div>
  );
}

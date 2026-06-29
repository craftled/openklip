"use client";

import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-panel-primitives";
import { Switch } from "@/components/ui/switch";

export function SettingsExportPanel({
  export1080,
  onExport1080Change,
}: {
  export1080: boolean;
  onExport1080Change: (value: boolean) => void;
}) {
  return (
    <SettingsSection title="Output">
      <SettingsRow
        control={
          <Switch
            checked={export1080}
            id="settings-export-1080"
            onCheckedChange={onExport1080Change}
          />
        }
        description="Cap rendered MP4 height at 1080p. Turn off to allow up to 4K when the source supports it."
        title="Limit to 1080p"
      />
    </SettingsSection>
  );
}

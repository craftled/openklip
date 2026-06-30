"use client";

import { useEffect, useState } from "react";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-panel-primitives";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type ColorScheme,
  getColorScheme,
  setColorScheme,
  subscribeColorScheme,
} from "@/lib/theme-preferences";

function firstToggleValue(
  value: string | readonly string[]
): string | undefined {
  return typeof value === "string" ? value : value[0];
}

export function SettingsAppearancePanel() {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() =>
    getColorScheme()
  );

  useEffect(() => subscribeColorScheme(setColorSchemeState), []);

  return (
    <SettingsSection title="Appearance">
      <SettingsRow
        control={
          <ToggleGroup
            aria-label="Color scheme"
            className="w-full sm:w-auto"
            onValueChange={(value) => {
              const colorSchemeValue = firstToggleValue(value);
              if (colorSchemeValue) {
                setColorScheme(colorSchemeValue as ColorScheme);
              }
            }}
            spacing={0}
            value={[colorScheme]}
            variant="outline"
          >
            <ToggleGroupItem className="flex-1 sm:flex-none" value="light">
              Light
            </ToggleGroupItem>
            <ToggleGroupItem className="flex-1 sm:flex-none" value="dark">
              Dark
            </ToggleGroupItem>
          </ToggleGroup>
        }
        description="Choose the editor color mode."
        title="Color scheme"
      />
    </SettingsSection>
  );
}

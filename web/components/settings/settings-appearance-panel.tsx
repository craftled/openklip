"use client";

import { useEffect, useState } from "react";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-panel-primitives";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  applyColorScheme,
  type ColorScheme,
  getColorScheme,
  setColorScheme,
  subscribeColorScheme,
} from "@/lib/theme-preferences";
import { firstToggleValue } from "@/lib/toggle-value";

function setColorSchemeWithTransition(colorScheme: ColorScheme) {
  const switchTheme = () => {
    setColorScheme(colorScheme);
  };

  if (!document.startViewTransition) {
    switchTheme();
    return;
  }

  document.startViewTransition(switchTheme);
}

export function SettingsAppearancePanel() {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>("light");

  useEffect(() => {
    const storedColorScheme = getColorScheme();
    setColorSchemeState(storedColorScheme);
    applyColorScheme(storedColorScheme);
    return subscribeColorScheme(setColorSchemeState);
  }, []);

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
                setColorSchemeWithTransition(colorSchemeValue as ColorScheme);
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

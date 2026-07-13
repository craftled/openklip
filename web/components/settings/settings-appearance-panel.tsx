"use client";

import { useEffect, useState } from "react";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-panel-primitives";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  readProvenanceDisplayEnabled,
  subscribeProvenanceDisplay,
  writeProvenanceDisplayEnabled,
} from "@/lib/provenance-preferences";
import {
  readInterfaceSoundsEnabled,
  subscribeInterfaceSoundsEnabled,
  writeInterfaceSoundsEnabled,
} from "@/lib/sound-preferences";
import {
  applyColorScheme,
  type ColorScheme,
  getColorScheme,
  setColorScheme,
  subscribeColorScheme,
} from "@/lib/theme-preferences";
import { firstToggleValue } from "@/lib/toggle-value";

export function SettingsAppearancePanel() {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>("light");
  const [provenanceDisplay, setProvenanceDisplay] = useState(false);
  const [interfaceSounds, setInterfaceSounds] = useState(false);

  useEffect(() => {
    const storedColorScheme = getColorScheme();
    setColorSchemeState(storedColorScheme);
    applyColorScheme(storedColorScheme);
    return subscribeColorScheme(setColorSchemeState);
  }, []);

  useEffect(() => {
    setProvenanceDisplay(readProvenanceDisplayEnabled());
    return subscribeProvenanceDisplay(setProvenanceDisplay);
  }, []);

  useEffect(() => {
    setInterfaceSounds(readInterfaceSoundsEnabled());
    return subscribeInterfaceSoundsEnabled(setInterfaceSounds);
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
      <SettingsRow
        control={
          <Switch
            aria-label="Show edit attribution"
            checked={provenanceDisplay}
            onCheckedChange={(checked) =>
              writeProvenanceDisplayEnabled(checked === true)
            }
          />
        }
        description="Show who changed each word or overlay in the script, history, and b-roll list."
        title="Show edit attribution"
      />
      <SettingsRow
        control={
          <Switch
            aria-label="Interface sounds"
            checked={interfaceSounds}
            onCheckedChange={(checked) =>
              writeInterfaceSoundsEnabled(checked === true)
            }
          />
        }
        description="Play subtle interaction sounds for toggles, sliders, and buttons."
        title="Interface sounds"
      />
    </SettingsSection>
  );
}

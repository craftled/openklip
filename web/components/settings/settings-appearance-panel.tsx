"use client";

import { useEffect, useState } from "react";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-panel-primitives";
import { Check } from "@/lib/icon";
import { THEME_CATALOG } from "@/lib/theme-catalog";
import {
  type AppThemeId,
  type ColorScheme,
  getAppTheme,
  getColorScheme,
  setAppTheme,
  setColorScheme,
  subscribeAppTheme,
  subscribeColorScheme,
} from "@/lib/theme-preferences";
import { cn } from "@/lib/utils";

function ThemePreviewMock({ scheme }: { scheme: "light" | "dark" }) {
  const isDark = scheme === "dark";
  return (
    <div
      className={cn(
        "flex h-16 w-full overflow-hidden rounded-md border border-border",
        isDark ? "bg-[#111]" : "bg-[#f8f8f8]"
      )}
    >
      <div
        className={cn(
          "w-[38%] border-border border-r",
          isDark ? "bg-[#0e0e0e]" : "bg-white"
        )}
      />
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div
          className={cn(
            "h-1.5 w-3/5 rounded-full",
            isDark ? "bg-white/20" : "bg-black/10"
          )}
        />
        <div
          className={cn(
            "h-1.5 w-2/5 rounded-full",
            isDark ? "bg-white/12" : "bg-black/6"
          )}
        />
        <div
          className={cn(
            "mt-auto h-4 w-full rounded-sm",
            isDark ? "bg-white/8" : "bg-black/4"
          )}
        />
      </div>
    </div>
  );
}

function ColorSchemeCard({
  active,
  label,
  onSelect,
  scheme,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
  scheme: "light" | "dark";
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex w-full flex-col gap-2 rounded-lg border p-2 text-left transition-colors",
        active
          ? "border-foreground/30 ring-1 ring-foreground/15"
          : "border-border hover:border-foreground/20"
      )}
      onClick={onSelect}
      type="button"
    >
      <ThemePreviewMock scheme={scheme} />
      <span className="text-center text-[12px] text-foreground">{label}</span>
    </button>
  );
}

export function SettingsAppearancePanel() {
  const [appTheme, setAppThemeState] = useState<AppThemeId>(() =>
    getAppTheme()
  );
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() =>
    getColorScheme()
  );

  useEffect(() => subscribeAppTheme(setAppThemeState), []);
  useEffect(() => subscribeColorScheme(setColorSchemeState), []);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3">
        <h2 className="px-2 py-1 text-[12px] text-tertiary/58">Color scheme</h2>
        <div className="grid grid-cols-2 gap-3">
          <ColorSchemeCard
            active={colorScheme === "light"}
            label="Light"
            onSelect={() => setColorScheme("light")}
            scheme="light"
          />
          <ColorSchemeCard
            active={colorScheme === "dark"}
            label="Dark"
            onSelect={() => setColorScheme("dark")}
            scheme="dark"
          />
        </div>
      </section>

      <SettingsSection title="Theme preset">
        {THEME_CATALOG.map((themeOption) => {
          const active = appTheme === themeOption.id;
          return (
            <button
              className="block w-full text-left"
              key={themeOption.id}
              onClick={() => setAppTheme(themeOption.id)}
              type="button"
            >
              <SettingsRow
                control={
                  active ? (
                    <Check className="size-4 text-foreground" />
                  ) : (
                    <span className="text-[12px] text-tertiary">Select</span>
                  )
                }
                description={
                  themeOption.supportedModes.length === 1
                    ? `${themeOption.name} (dark only)`
                    : `${themeOption.name} theme colors for the editor shell.`
                }
                title={themeOption.name}
              />
            </button>
          );
        })}
      </SettingsSection>
    </div>
  );
}

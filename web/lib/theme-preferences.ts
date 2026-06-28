export type { AppThemeId } from "./theme-catalog";
export type { ColorScheme } from "./theme-schema";

import type { AppThemeId } from "./theme-catalog";
import { DEFAULT_APP_THEME, getThemeById, isAppThemeId } from "./theme-catalog";
import {
  buildThemeNoFlashScript,
  injectThemePreset,
  preferredColorScheme,
} from "./theme-engine";
import type { ColorScheme } from "./theme-schema";

const APP_THEME_STORAGE_KEY = "openklip-theme-id";
const COLOR_SCHEME_STORAGE_KEY = "openklip-color-scheme";

const appThemeListeners = new Set<(theme: AppThemeId) => void>();
const colorSchemeListeners = new Set<(scheme: ColorScheme) => void>();

export function applyAppTheme(themeId: AppThemeId, scheme: ColorScheme): void {
  injectThemePreset(themeId, scheme);
}

export function getAppTheme(): AppThemeId {
  if (typeof window === "undefined") {
    return DEFAULT_APP_THEME;
  }
  try {
    const stored = localStorage.getItem(APP_THEME_STORAGE_KEY);
    if (stored && isAppThemeId(stored)) {
      return stored;
    }
  } catch {
    // ignore unavailable storage
  }
  return DEFAULT_APP_THEME;
}

export function setAppTheme(themeId: AppThemeId): void {
  const theme = getThemeById(themeId);
  if (!theme) {
    return;
  }

  try {
    localStorage.setItem(APP_THEME_STORAGE_KEY, themeId);
  } catch {
    // ignore quota / private mode
  }

  let scheme = getColorScheme();
  const nextScheme = preferredColorScheme(theme, scheme);
  if (nextScheme !== scheme) {
    document.documentElement.classList.toggle("dark", nextScheme === "dark");
    try {
      localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, nextScheme);
    } catch {
      // ignore unavailable storage
    }
    for (const listener of colorSchemeListeners) {
      listener(nextScheme);
    }
    scheme = nextScheme;
  }

  injectThemePreset(themeId, scheme);

  for (const listener of appThemeListeners) {
    listener(themeId);
  }
}

export function subscribeAppTheme(
  listener: (theme: AppThemeId) => void
): () => void {
  appThemeListeners.add(listener);
  return () => {
    appThemeListeners.delete(listener);
  };
}

export function applyColorScheme(scheme: ColorScheme): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.classList.toggle("dark", scheme === "dark");
  applyAppTheme(getAppTheme(), scheme);
}

export function getColorScheme(): ColorScheme {
  if (typeof window === "undefined") {
    return "light";
  }
  try {
    const stored = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // ignore unavailable storage
  }
  return "light";
}

export function setColorScheme(scheme: ColorScheme): void {
  applyColorScheme(scheme);
  try {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme);
  } catch {
    // ignore quota / private mode
  }
  for (const listener of colorSchemeListeners) {
    listener(scheme);
  }
}

export function subscribeColorScheme(
  listener: (scheme: ColorScheme) => void
): () => void {
  colorSchemeListeners.add(listener);
  return () => {
    colorSchemeListeners.delete(listener);
  };
}

export const THEME_NO_FLASH_SCRIPT = buildThemeNoFlashScript(
  COLOR_SCHEME_STORAGE_KEY,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME
);

/** Test-only: clear subscribers and stored values between cases. */
export function resetThemePreferencesForTests(): void {
  appThemeListeners.clear();
  colorSchemeListeners.clear();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(APP_THEME_STORAGE_KEY);
      localStorage.removeItem(COLOR_SCHEME_STORAGE_KEY);
    } catch {
      // ignore unavailable storage
    }
  }
}

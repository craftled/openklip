export type ColorScheme = "light" | "dark";

const COLOR_SCHEME_STORAGE_KEY = "openklip-color-scheme";

const colorSchemeListeners = new Set<(scheme: ColorScheme) => void>();

export function applyColorScheme(scheme: ColorScheme): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.classList.toggle("dark", scheme === "dark");
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

export const THEME_NO_FLASH_SCRIPT = `(function(){
try{
var cs=localStorage.getItem("${COLOR_SCHEME_STORAGE_KEY}")||"light";
document.documentElement.classList.toggle("dark",cs==="dark");
}catch(e){}
})();`;

/** Test-only: clear subscribers and stored values between cases. */
export function resetThemePreferencesForTests(): void {
  colorSchemeListeners.clear();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(COLOR_SCHEME_STORAGE_KEY);
    } catch {
      // ignore unavailable storage
    }
  }
}

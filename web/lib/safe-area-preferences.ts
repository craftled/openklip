import {
  parseSafeAreaPlatform,
  type SafeAreaPlatform,
} from "@engine/safe-areas";

const STORAGE_KEY = "openklip-safe-area-guide";

export function getSafeAreaGuidePlatform(): SafeAreaPlatform {
  if (typeof window === "undefined") {
    return "off";
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return parseSafeAreaPlatform(stored);
    }
  } catch {
    // ignore unavailable storage
  }
  return "off";
}

export function setSafeAreaGuidePlatform(platform: SafeAreaPlatform): void {
  try {
    localStorage.setItem(STORAGE_KEY, platform);
  } catch {
    // ignore quota / private mode
  }
}

/** Test-only: clear stored preference between cases. */
export function resetSafeAreaPreferencesForTests(): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore unavailable storage
    }
  }
}

const STORAGE_KEY = "openklip-interface-sounds";

const listeners = new Set<(enabled: boolean) => void>();

export function readInterfaceSoundsEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      return true;
    }
    if (stored === "false") {
      return false;
    }
  } catch {
    // ignore unavailable storage
  }
  return false;
}

export function writeInterfaceSoundsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // ignore quota / private mode
  }
  for (const listener of listeners) {
    listener(enabled);
  }
}

export function subscribeInterfaceSoundsEnabled(
  listener: (enabled: boolean) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: clear subscribers and stored preference between cases. */
export function resetSoundPreferencesForTests(): void {
  listeners.clear();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore unavailable storage
    }
  }
}

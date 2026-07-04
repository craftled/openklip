const PROVENANCE_DISPLAY_STORAGE_KEY = "openklip-provenance-display";

const provenanceDisplayListeners = new Set<(enabled: boolean) => void>();

/** Whether edit attribution UI is shown (advanced; default off). */
export function readProvenanceDisplayEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return localStorage.getItem(PROVENANCE_DISPLAY_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeProvenanceDisplayEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(PROVENANCE_DISPLAY_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(PROVENANCE_DISPLAY_STORAGE_KEY);
    }
  } catch {
    // ignore quota / private mode
  }
  for (const listener of provenanceDisplayListeners) {
    listener(enabled);
  }
}

export function subscribeProvenanceDisplay(
  listener: (enabled: boolean) => void
): () => void {
  provenanceDisplayListeners.add(listener);
  return () => {
    provenanceDisplayListeners.delete(listener);
  };
}

/** Test-only: clear subscribers and stored values between cases. */
export function resetProvenancePreferencesForTests(): void {
  provenanceDisplayListeners.clear();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(PROVENANCE_DISPLAY_STORAGE_KEY);
    } catch {
      // ignore unavailable storage
    }
  }
}

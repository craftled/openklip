export type ModShortcutParts = {
  modifier: string;
  key: string;
};

/** Stable label for SSR and the first client paint (avoids hydration mismatch). */
export function modShortcutNeutral(key: string): string {
  return `Mod+${key.toUpperCase()}`;
}

/** Stable modifier/key parts for SSR and the first client paint. */
export function modShortcutPartsNeutral(key: string): ModShortcutParts {
  return { modifier: "Mod", key: key.toUpperCase() };
}

/** Human-readable modifier+key label for tooltips (⌘B on Apple, Ctrl+B elsewhere). */
export function modShortcut(key: string): string {
  const { modifier, key: shortcutKey } = modShortcutParts(key);
  return modifier.length === 1
    ? `${modifier}${shortcutKey}`
    : `${modifier}+${shortcutKey}`;
}

/** Modifier and key as separate parts for Kbd rendering. */
export function modShortcutParts(key: string): ModShortcutParts {
  const upper = key.toUpperCase();
  if (typeof navigator === "undefined") {
    return modShortcutPartsNeutral(key);
  }
  return /Mac|iPhone|iPad/i.test(navigator.userAgent)
    ? { modifier: "⌘", key: upper }
    : { modifier: "Ctrl", key: upper };
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) {
    return false;
  }
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  return el.isContentEditable;
}

export function isModKeyOnly(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
}

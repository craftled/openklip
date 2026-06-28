/** Human-readable modifier+key label for tooltips (⌘B on Apple, Ctrl+B elsewhere). */
export function modShortcut(key: string): string {
  const upper = key.toUpperCase();
  if (typeof navigator === "undefined") {
    return `⌘${upper}`;
  }
  return /Mac|iPhone|iPad/i.test(navigator.userAgent)
    ? `⌘${upper}`
    : `Ctrl+${upper}`;
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

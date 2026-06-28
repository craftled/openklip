import { modShortcut } from "@/lib/keyboard-shortcuts";
import { cn } from "@/lib/utils";

export function KeyboardHint({
  className,
  shortcutKey,
}: {
  className?: string;
  shortcutKey: string;
}) {
  return (
    <kbd
      className={cn(
        "rounded border border-border bg-foreground/5 px-1 py-0.5 font-medium text-caption text-muted-foreground tabular-nums leading-none",
        className
      )}
    >
      {modShortcut(shortcutKey)}
    </kbd>
  );
}

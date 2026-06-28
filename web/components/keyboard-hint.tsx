"use client";

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useModShortcutParts } from "@/hooks/use-mod-shortcut";
import { cn } from "@/lib/utils";

export function KeyboardHint({
  className,
  shortcutKey,
}: {
  className?: string;
  shortcutKey: string;
}) {
  const { modifier, key } = useModShortcutParts(shortcutKey);

  return (
    <KbdGroup className={cn(className)}>
      <Kbd>{modifier}</Kbd>
      <Kbd>{key}</Kbd>
    </KbdGroup>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "@/lib/icon";
import {
  type ColorScheme,
  getColorScheme,
  setColorScheme,
  subscribeColorScheme,
} from "@/lib/theme-preferences";
import { cn } from "@/lib/utils";

/** Same light/dark toggle as the editor left-sidebar footer. */
export function MarketingThemeToggle({ className }: { className?: string }) {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>("light");

  useEffect(() => {
    setColorSchemeState(getColorScheme());
    return subscribeColorScheme(setColorSchemeState);
  }, []);

  const isDark = colorScheme === "dark";

  return (
    <Button
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "size-8 shrink-0 text-muted-foreground hover:text-foreground",
        className
      )}
      onClick={() => setColorScheme(isDark ? "light" : "dark")}
      size="icon"
      title={isDark ? "Light mode" : "Dark mode"}
      variant="ghost"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

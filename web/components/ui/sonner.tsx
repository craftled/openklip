"use client";

import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  type ColorScheme,
  getColorScheme,
  subscribeColorScheme,
} from "@/lib/theme-preferences";

function Toaster({ ...props }: ToasterProps) {
  const [scheme, setScheme] = useState<ColorScheme>(() =>
    typeof window === "undefined" ? "light" : getColorScheme()
  );

  useEffect(() => subscribeColorScheme(setScheme), []);

  return (
    <Sonner
      className="toaster group"
      closeButton
      position="bottom-right"
      theme={scheme}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-sm",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };

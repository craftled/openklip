"use client";

import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconLoader,
} from "@/lib/icon";
import {
  type ColorScheme,
  getColorScheme,
  subscribeColorScheme,
} from "@/lib/theme-preferences";

const Toaster = ({ ...props }: ToasterProps) => {
  const [colorScheme, setColorScheme] = useState<ColorScheme>("light");

  useEffect(() => {
    setColorScheme(getColorScheme());
    return subscribeColorScheme(setColorScheme);
  }, []);

  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <IconCircleCheck className="size-4" />,
        info: <IconInfoCircle className="size-4" />,
        warning: <IconAlertTriangle className="size-4" />,
        error: <IconAlertOctagon className="size-4" />,
        loading: <IconLoader className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      theme={colorScheme}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

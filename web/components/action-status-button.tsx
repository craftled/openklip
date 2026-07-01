"use client";

import type { ComponentProps, ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActionIcon = ComponentType<{
  className?: string;
  "data-icon"?: string;
}>;

type ActionStatusButtonProps = Omit<
  ComponentProps<typeof Button>,
  "children"
> & {
  busy?: boolean;
  busyLabel?: string;
  icon: ActionIcon;
  iconClassName?: string;
  label: string;
};

export function ActionStatusButton({
  busy = false,
  busyLabel,
  className,
  icon: Icon,
  iconClassName,
  label,
  ...props
}: ActionStatusButtonProps) {
  return (
    <Button
      aria-busy={busy ? true : undefined}
      className={className}
      {...props}
    >
      <Icon
        className={cn(busy && "animate-pulse", iconClassName)}
        data-icon="inline-start"
      />
      {busy ? (busyLabel ?? label) : label}
    </Button>
  );
}

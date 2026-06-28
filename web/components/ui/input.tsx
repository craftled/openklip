import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-foreground/15 bg-transparent px-3 py-1 text-sm transition-colors file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export { Input };

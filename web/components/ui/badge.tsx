import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 font-medium text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-foreground text-background hover:bg-foreground/90",
        secondary:
          "border-transparent bg-foreground/5 text-foreground hover:bg-foreground/10",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border-foreground/15 text-foreground",
        ghost: "border-transparent hover:bg-foreground/3",
        link: "border-transparent text-foreground underline-offset-4 hover:underline",
        broll: "border-broll/25 bg-broll/15 text-broll",
        zoom: "border-zoom/25 bg-zoom/15 text-zoom",
        title: "border-title/25 bg-title/15 text-title",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      className={cn(badgeVariants({ variant }), className)}
      data-slot="badge"
      data-variant={variant}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

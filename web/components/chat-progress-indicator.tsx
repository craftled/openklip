import { cn } from "@/lib/utils";

export function ChatProgressIndicator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-3 shrink-0 items-center justify-center",
        className
      )}
    >
      <span className="size-2.5 animate-spin rounded-full border border-muted-foreground/25 border-t-muted-foreground/70" />
    </span>
  );
}

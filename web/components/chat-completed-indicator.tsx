import { APP_ICON_CLASS, Check } from "@/lib/icon";
import { cn } from "@/lib/utils";

export function ChatCompletedIndicator({ className }: { className?: string }) {
  return (
    <Check
      aria-label="Completed"
      className={cn(APP_ICON_CLASS, className)}
      role="img"
    />
  );
}

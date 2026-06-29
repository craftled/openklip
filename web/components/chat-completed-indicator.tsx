import { cn } from "@/lib/utils";

/** Solid green circle + white check for finished agent chats (sidebar status). */
export function ChatCompletedIndicator({ className }: { className?: string }) {
  return (
    <span
      aria-label="Completed"
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-[#22c55e]",
        className
      )}
      role="img"
    >
      <svg
        aria-hidden="true"
        className="size-2.5"
        fill="none"
        viewBox="0 0 12 12"
      >
        <path
          d="M2.5 6.5 5 9l4.5-6"
          stroke="#ffffff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
      </svg>
    </span>
  );
}

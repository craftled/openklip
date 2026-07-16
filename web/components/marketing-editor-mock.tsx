import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Product-stage shot of the real editor (captured from /parity-demo),
 * framed as a macOS app window.
 */
export function MarketingEditorMock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-black/10 bg-[#1e1e1e] shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_2px_4px_rgba(0,0,0,0.04),0_12px_28px_rgba(0,0,0,0.12),0_28px_60px_rgba(0,0,0,0.14)] dark:border-white/10 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.3),0_16px_40px_rgba(0,0,0,0.45)]",
        className
      )}
    >
      <div className="flex h-6 items-center gap-1.5 border-white/5 border-b bg-[#2a2a2a] px-2.5">
        <span className="size-2 rounded-full bg-[#ff5f57]" />
        <span className="size-2 rounded-full bg-[#febc2e]" />
        <span className="size-2 rounded-full bg-[#28c840]" />
        <span className="ml-1 truncate text-[10px] text-white/50 leading-none">
          OpenKlip
        </span>
      </div>
      <Image
        alt="OpenKlip editor: left sidebar with chats, center preview and transcript cuts, right agent chat"
        className="h-auto w-full"
        height={2000}
        priority
        src="/marketing-editor.png"
        width={3200}
      />
    </div>
  );
}

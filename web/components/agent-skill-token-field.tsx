"use client";

import { Box } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import type { SkillEntry } from "@/lib/skills-catalog";
import { cn } from "@/lib/utils";

interface AgentSkillTokenFieldProps {
  className?: string;
  disabled?: boolean;
  onClearSkill: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  skill: SkillEntry;
}

export function AgentSkillTokenField({
  className,
  disabled,
  onClearSkill,
  onKeyDown,
  skill,
}: AgentSkillTokenFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.querySelector("textarea")?.focus();
  }, [skill.id]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClearSkill();
      return;
    }
    if (
      event.key === "Backspace" &&
      event.currentTarget.value === "" &&
      event.currentTarget.selectionStart === 0
    ) {
      event.preventDefault();
      onClearSkill();
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-16 w-full flex-wrap items-center gap-x-1.5 px-3 py-3",
        className
      )}
      ref={containerRef}
    >
      <span
        aria-label={`Skill: ${skill.title}`}
        className="inline-flex shrink-0 items-center gap-1.5 text-primary"
      >
        <Box aria-hidden className="size-4 shrink-0" />
        <span className="font-medium text-sm">{skill.title}</span>
      </span>
      <PromptInputTextarea
        className="min-h-0 min-w-[8ch] flex-1 border-0 p-0 py-0 text-left shadow-none placeholder:text-left focus-visible:ring-0"
        disabled={disabled}
        onKeyDown={handleKeyDown}
        placeholder="Add details…"
      />
    </div>
  );
}

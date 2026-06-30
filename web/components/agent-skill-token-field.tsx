"use client";

import { type KeyboardEvent, useEffect, useRef } from "react";
import { PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { APP_ICON_CLASS, Box, XIcon } from "@/lib/icon";
import type { SkillEntry } from "@/lib/skills-catalog";
import { cn } from "@/lib/utils";

interface AgentSkillTokenFieldProps {
  className?: string;
  disabled?: boolean;
  onClearSkills: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onRemoveSkill: (skillId: string) => void;
  skills: readonly SkillEntry[];
}

export function AgentSkillTokenField({
  className,
  disabled,
  onClearSkills,
  onKeyDown,
  onRemoveSkill,
  skills,
}: AgentSkillTokenFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.querySelector("textarea")?.focus();
  }, [skills.length]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClearSkills();
      return;
    }
    if (
      event.key === "Backspace" &&
      event.currentTarget.value === "" &&
      event.currentTarget.selectionStart === 0
    ) {
      event.preventDefault();
      const lastSkill = skills.at(-1);
      if (lastSkill) {
        onRemoveSkill(lastSkill.id);
      }
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
      {skills.map((skill) => (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted py-0.5 pr-1 pl-1.5 text-foreground"
          key={skill.id}
        >
          <Box aria-hidden className={APP_ICON_CLASS} />
          <span className="font-medium text-sm">{skill.title}</span>
          <Button
            aria-label={`Remove ${skill.title}`}
            disabled={disabled}
            onClick={() => onRemoveSkill(skill.id)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </span>
      ))}
      <PromptInputTextarea
        className="min-h-0 min-w-[8ch] flex-1 border-0 p-0 py-0 text-left shadow-none placeholder:text-left focus-visible:ring-0"
        disabled={disabled}
        onKeyDown={handleKeyDown}
        placeholder={
          skills.length > 1 ? "Add details for these skills…" : "Add details…"
        }
      />
    </div>
  );
}

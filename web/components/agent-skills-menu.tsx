"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandItem,
  PromptInputCommandList,
} from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APP_ICON_CLASS, Box } from "@/lib/icon";
import {
  filterSkills,
  type SkillEntry,
  skillKindLabel,
} from "@/lib/skills-catalog";
import { cn } from "@/lib/utils";

interface AgentSkillsMenuProps {
  children?: ReactNode;
  className?: string;
  embedded?: boolean;
  highlightedIndex?: number;
  onHighlight?: (index: number) => void;
  onSelect: (skill: SkillEntry) => void;
  open: boolean;
  query: string;
  skills: SkillEntry[];
}

function SkillsMenuPanel({
  className,
  highlightedIndex = -1,
  onHighlight,
  onSelect,
  query,
  skills,
}: {
  className?: string;
  highlightedIndex?: number;
  onHighlight?: (index: number) => void;
  onSelect: (skill: SkillEntry) => void;
  query: string;
  skills: SkillEntry[];
}) {
  const filtered = useMemo(() => filterSkills(skills, query), [query, skills]);

  return (
    <div className={cn("overflow-hidden text-popover-foreground", className)}>
      <div className="border-border border-b px-3 py-2">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Skills
        </p>
      </div>
      <PromptInputCommand shouldFilter={false}>
        <PromptInputCommandList className="max-h-72">
          {filtered.length === 0 ? (
            <PromptInputCommandEmpty className="py-4 text-left text-sm">
              No skills match.
            </PromptInputCommandEmpty>
          ) : (
            <PromptInputCommandGroup>
              {filtered.map((skill, index) => (
                <PromptInputCommandItem
                  className="items-start gap-3 py-2.5"
                  data-highlighted={index === highlightedIndex ? "" : undefined}
                  key={skill.id}
                  onMouseEnter={() => onHighlight?.(index)}
                  onSelect={() => onSelect(skill)}
                  value={`${skill.title} ${skill.description} ${skill.slash}`}
                >
                  <Box className={APP_ICON_CLASS} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-sm">
                      {skill.title}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">
                      {skill.description}
                    </div>
                  </div>
                  <Badge
                    className="shrink-0 font-normal text-xs"
                    variant="secondary"
                  >
                    {skillKindLabel(skill.kind)}
                  </Badge>
                </PromptInputCommandItem>
              ))}
            </PromptInputCommandGroup>
          )}
        </PromptInputCommandList>
      </PromptInputCommand>
    </div>
  );
}

export function AgentSkillsMenu({
  children,
  className,
  embedded = false,
  highlightedIndex = -1,
  onHighlight,
  onSelect,
  open,
  query,
  skills,
}: AgentSkillsMenuProps) {
  if (embedded) {
    return (
      <SkillsMenuPanel
        className={cn("rounded-lg bg-popover", className)}
        highlightedIndex={highlightedIndex}
        onHighlight={onHighlight}
        onSelect={onSelect}
        query={query}
        skills={skills}
      />
    );
  }

  return (
    <DropdownMenu modal={false} open={open}>
      <div className="relative w-full">
        <DropdownMenuTrigger
          render={
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-0"
            />
          }
        />
        {children}
      </div>
      <DropdownMenuContent
        align="start"
        className={cn(
          "w-[min(100vw-2rem,28rem)] overflow-hidden p-0",
          className
        )}
        side="top"
      >
        <SkillsMenuPanel
          highlightedIndex={highlightedIndex}
          onHighlight={onHighlight}
          onSelect={onSelect}
          query={query}
          skills={skills}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function useSkillsSlashMenu(options: {
  inputValue: string;
  onClearInput: () => void;
  onSelectSkill: (skill: SkillEntry) => void;
  skills: SkillEntry[];
}) {
  const { inputValue, onClearInput, onSelectSkill, skills } = options;
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const pendingSelect = useRef(false);

  useEffect(() => {
    const slash = parseSlashFromValue(inputValue);
    if (slash) {
      setMenuOpen(true);
      setSlashQuery(slash.query);
      return;
    }
    if (!pendingSelect.current) {
      setMenuOpen(false);
      setSlashQuery("");
    }
  }, [inputValue]);

  const filtered = useMemo(
    () => filterSkills(skills, slashQuery),
    [skills, slashQuery]
  );

  useEffect(() => {
    if (!menuOpen || filtered.length === 0) {
      setHighlightedIndex(0);
      return;
    }
    setHighlightedIndex((current) => Math.min(current, filtered.length - 1));
  }, [filtered.length, menuOpen]);

  const selectSkill = useCallback(
    (skill: SkillEntry) => {
      pendingSelect.current = true;
      onClearInput();
      setMenuOpen(false);
      setSlashQuery("");
      onSelectSkill(skill);
      queueMicrotask(() => {
        pendingSelect.current = false;
      });
    },
    [onClearInput, onSelectSkill]
  );

  const openMenu = useCallback(() => {
    setMenuOpen(true);
    setSlashQuery("");
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setSlashQuery("");
  }, []);

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!menuOpen || filtered.length === 0) {
        if (event.key === "Escape" && menuOpen) {
          event.preventDefault();
          closeMenu();
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((current) => (current + 1) % filtered.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex(
          (current) => (current - 1 + filtered.length) % filtered.length
        );
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setHighlightedIndex(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setHighlightedIndex(filtered.length - 1);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const selected = filtered[highlightedIndex] ?? filtered[0];
        if (selected) {
          selectSkill(selected);
        }
      }
    },
    [closeMenu, filtered, highlightedIndex, menuOpen, selectSkill]
  );

  return {
    closeMenu,
    filtered,
    handleInputKeyDown,
    highlightedIndex,
    menuOpen,
    openMenu,
    selectSkill,
    setHighlightedIndex,
    slashQuery,
  };
}

function parseSlashFromValue(value: string): { query: string } | null {
  if (!value.startsWith("/")) {
    return null;
  }
  return { query: value.slice(1) };
}

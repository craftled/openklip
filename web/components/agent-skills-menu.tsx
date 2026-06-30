"use client";

import {
  type KeyboardEvent,
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
import { APP_ICON_CLASS, Box } from "@/lib/icon";
import {
  filterSkills,
  type SkillEntry,
  skillKindLabel,
} from "@/lib/skills-catalog";
import { cn } from "@/lib/utils";

interface AgentSkillsMenuProps {
  className?: string;
  embedded?: boolean;
  onSelect: (skill: SkillEntry) => void;
  open: boolean;
  query: string;
  skills: SkillEntry[];
}

export function AgentSkillsMenu({
  className,
  embedded = false,
  onSelect,
  open,
  query,
  skills,
}: AgentSkillsMenuProps) {
  const filtered = useMemo(() => filterSkills(skills, query), [query, skills]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={cn(
        embedded
          ? "overflow-hidden rounded-lg bg-popover text-popover-foreground"
          : "absolute right-0 bottom-full left-0 z-50 mb-2 overflow-hidden border border-border bg-popover text-popover-foreground shadow-md",
        className
      )}
    >
      <div className="border-border border-b px-3 py-2">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Skills
        </p>
      </div>
      <PromptInputCommand shouldFilter={false}>
        <PromptInputCommandList className="max-h-72">
          <PromptInputCommandEmpty className="py-4 text-left text-sm">
            No skills match.
          </PromptInputCommandEmpty>
          <PromptInputCommandGroup>
            {filtered.map((skill) => (
              <PromptInputCommandItem
                className="items-start gap-3 py-2.5"
                key={skill.id}
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
                  className="shrink-0 font-normal text-[10px]"
                  variant="secondary"
                >
                  {skillKindLabel(skill.kind)}
                </Badge>
              </PromptInputCommandItem>
            ))}
          </PromptInputCommandGroup>
        </PromptInputCommandList>
      </PromptInputCommand>
    </div>
  );
}

export function useSkillsSlashMenu(options: {
  inputValue: string;
  onClearInput: () => void;
  onSelectSkill: (skill: SkillEntry) => void;
  skills: SkillEntry[];
  /** When true, slash menu stays closed (e.g. skill token already selected). */
  skillSelected?: boolean;
}) {
  const { inputValue, onClearInput, onSelectSkill, skills, skillSelected } =
    options;
  const [menuOpen, setMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const pendingSelect = useRef(false);

  useEffect(() => {
    if (skillSelected) {
      setMenuOpen(false);
      setSlashQuery("");
      return;
    }
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
  }, [inputValue, skillSelected]);

  const filtered = useMemo(
    () => filterSkills(skills, slashQuery),
    [skills, slashQuery]
  );

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
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const first = filtered[0];
        if (first) {
          selectSkill(first);
        }
      }
    },
    [closeMenu, filtered, menuOpen, selectSkill]
  );

  return {
    closeMenu,
    filtered,
    handleInputKeyDown,
    menuOpen,
    openMenu,
    selectSkill,
    slashQuery,
  };
}

function parseSlashFromValue(value: string): { query: string } | null {
  if (!value.startsWith("/")) {
    return null;
  }
  return { query: value.slice(1) };
}

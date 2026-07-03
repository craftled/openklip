"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  type KeyboardEvent,
  type MouseEvent,
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
  id?: string;
  onHighlight?: (index: number) => void;
  onSelect: (skill: SkillEntry) => void;
  open: boolean;
  query: string;
  skills: SkillEntry[];
}

function SkillsMenuPanel({
  className,
  highlightedIndex = -1,
  id,
  onHighlight,
  onSelect,
  query,
  skills,
}: {
  className?: string;
  highlightedIndex?: number;
  id?: string;
  onHighlight?: (index: number) => void;
  onSelect: (skill: SkillEntry) => void;
  query: string;
  skills: SkillEntry[];
}) {
  const filtered = useMemo(() => filterSkills(skills, query), [query, skills]);
  const handleItemMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  return (
    <div className={cn("overflow-hidden text-popover-foreground", className)}>
      <div className="border-border border-b px-3 py-2">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Skills
        </p>
      </div>
      <PromptInputCommand shouldFilter={false}>
        <PromptInputCommandList className="max-h-72" id={id}>
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
                  onMouseDown={handleItemMouseDown}
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
  id,
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
        id={id}
        onHighlight={onHighlight}
        onSelect={onSelect}
        query={query}
        skills={skills}
      />
    );
  }

  return (
    <PopoverPrimitive.Root modal={false} open={open}>
      <div className="relative w-full">
        <PopoverPrimitive.Trigger
          nativeButton={false}
          render={
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-0"
            />
          }
        />
        {children}
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          align="start"
          className="isolate z-50 outline-none"
          side="top"
          sideOffset={4}
        >
          <PopoverPrimitive.Popup
            className={cn(
              "data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 z-50 max-h-(--available-height) w-[min(100vw-2rem,28rem)] origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-lg bg-popover p-0 text-popover-foreground shadow-md outline-none ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in data-closed:overflow-hidden",
              className
            )}
            finalFocus={false}
            initialFocus={false}
          >
            <SkillsMenuPanel
              highlightedIndex={highlightedIndex}
              id={id}
              onHighlight={onHighlight}
              onSelect={onSelect}
              query={query}
              skills={skills}
            />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
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

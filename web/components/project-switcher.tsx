"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ProjectListing } from "@/lib/project-list";
import {
  findActiveProject,
  projectAtShortcutIndex,
  projectInitial,
} from "@/lib/project-list";

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) {
    return "just now";
  }
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return `${hr}h ago`;
  }
  return `${Math.floor(hr / 24)}d ago`;
}

export function ProjectSwitcher({
  activeSlug,
  onIngestVideo,
  onSelectProject,
  projects,
}: {
  activeSlug: string;
  onIngestVideo: (file: File) => Promise<void>;
  onSelectProject: (slug: string) => void;
  projects: ProjectListing[];
}) {
  const { isMobile } = useSidebar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  const active = findActiveProject(projects, activeSlug);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) {
        return;
      }
      const index = Number.parseInt(e.key, 10);
      const project = projectAtShortcutIndex(projects, index);
      if (project) {
        e.preventDefault();
        onSelectProject(project.slug);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSelectProject, projects]);

  const onPickVideo = async (file: File) => {
    setIngesting(true);
    setIngestError(null);
    try {
      await onIngestVideo(file);
    } catch (e) {
      setIngestError((e as Error).message);
    } finally {
      setIngesting(false);
    }
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                size="lg"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-foreground font-medium text-background text-sm">
                  {projectInitial(active.slug)}
                </div>
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{active.slug}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {ingesting
                      ? "Ingesting video…"
                      : relativeTime(active.mtimeMs)}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 shrink-0" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Projects
                </DropdownMenuLabel>
                {projects.length === 0 && (
                  <DropdownMenuItem className="text-muted-foreground" disabled>
                    No projects yet
                  </DropdownMenuItem>
                )}
                {projects.map((project, index) => {
                  const selected = project.slug === activeSlug;
                  return (
                    <DropdownMenuItem
                      className="gap-2 p-2"
                      key={project.slug}
                      onClick={() => onSelectProject(project.slug)}
                    >
                      <div className="flex size-6 items-center justify-center rounded-md bg-foreground/5 font-medium text-xs">
                        {projectInitial(project.slug)}
                      </div>
                      <span className="min-w-0 flex-1 truncate">
                        {project.slug}
                      </span>
                      {selected ? (
                        <Check className="ml-auto size-3.5 shrink-0" />
                      ) : (
                        <DropdownMenuShortcut>
                          ⌘{index + 1}
                        </DropdownMenuShortcut>
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="gap-2 p-2"
                  disabled={ingesting}
                  onClick={() => inputRef.current?.click()}
                >
                  <div className="flex size-6 items-center justify-center rounded-md bg-foreground/5">
                    <Plus className="size-4" />
                  </div>
                  <span className="font-medium text-muted-foreground">
                    {ingesting ? "Ingesting…" : "Ingest video"}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      {ingestError && (
        <p className="px-3 text-destructive text-xs">{ingestError}</p>
      )}
      <input
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void onPickVideo(file);
          }
          e.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
    </>
  );
}

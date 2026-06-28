"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProjectDeleteAction } from "@/components/project-delete-action";
import { ProjectInlineFolderAction } from "@/components/project-folder-action";
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
  onCreateProject,
  onDeleteProject,
  onSelectProject,
  projects,
}: {
  activeSlug: string;
  onCreateProject: (file: File) => Promise<void>;
  onDeleteProject: (slug: string) => Promise<void>;
  onSelectProject: (slug: string) => void;
  projects: ProjectListing[];
}) {
  const { isMobile } = useSidebar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState<string | null>(
    null
  );
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
    setCreating(true);
    setCreateError(null);
    try {
      await onCreateProject(file);
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const onConfirmDelete = async (slug: string) => {
    setDeletingSlug(slug);
    setDeleteError(null);
    try {
      await onDeleteProject(slug);
      setConfirmDeleteSlug(null);
      setMenuOpen(false);
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeletingSlug(null);
    }
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu
            onOpenChange={(open) => {
              setMenuOpen(open);
              if (!open) {
                setConfirmDeleteSlug(null);
                setDeleteError(null);
              }
            }}
            open={menuOpen}
          >
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                size="lg"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-foreground font-medium text-background text-sm">
                  {projectInitial(active.slug)}
                </div>
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="flex min-w-0 items-center gap-0.5">
                    <span className="truncate font-medium">{active.slug}</span>
                    <ProjectInlineFolderAction slug={active.slug} />
                  </span>
                  <span className="truncate text-muted-foreground text-xs">
                    {creating
                      ? "Creating project…"
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
                  const confirming = confirmDeleteSlug === project.slug;
                  const deleting = deletingSlug === project.slug;
                  return (
                    <DropdownMenuItem
                      className="group/project relative gap-2 p-2"
                      key={project.slug}
                      onClick={(e) => {
                        if (
                          confirming ||
                          deleting ||
                          (e.target as HTMLElement).closest("button")
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        onSelectProject(project.slug);
                      }}
                      onSelect={(e) => {
                        if (confirming || deleting) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <div className="flex size-6 items-center justify-center rounded-md bg-foreground/5 font-medium text-xs">
                        {projectInitial(project.slug)}
                      </div>
                      <span className="flex min-w-0 flex-1 items-center gap-0.5">
                        <span className="truncate">{project.slug}</span>
                        <ProjectInlineFolderAction
                          revealGroup="project"
                          slug={project.slug}
                        />
                      </span>
                      {confirming ? (
                        <ProjectDeleteAction
                          confirming
                          deleting={deleting}
                          onCancel={() => setConfirmDeleteSlug(null)}
                          onConfirm={() => void onConfirmDelete(project.slug)}
                          onRequestDelete={() =>
                            setConfirmDeleteSlug(project.slug)
                          }
                          slug={project.slug}
                        />
                      ) : (
                        <>
                          {selected ? (
                            <Check className="ml-auto size-3.5 shrink-0 group-hover/project:invisible" />
                          ) : (
                            <DropdownMenuShortcut className="ml-auto group-hover/project:invisible">
                              ⌘{index + 1}
                            </DropdownMenuShortcut>
                          )}
                          <ProjectDeleteAction
                            className="absolute right-2 opacity-0 group-hover/project:opacity-100"
                            confirming={false}
                            deleting={false}
                            onCancel={() => setConfirmDeleteSlug(null)}
                            onConfirm={() => void onConfirmDelete(project.slug)}
                            onRequestDelete={() =>
                              setConfirmDeleteSlug(project.slug)
                            }
                            slug={project.slug}
                          />
                        </>
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="gap-2 p-2"
                  disabled={creating}
                  onClick={() => inputRef.current?.click()}
                >
                  <div className="flex size-6 items-center justify-center rounded-md bg-foreground/5">
                    <Plus className="size-4" />
                  </div>
                  <span className="font-medium text-muted-foreground">
                    {creating ? "Creating…" : "Create new project"}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      {createError && (
        <p className="px-3 text-destructive text-xs">{createError}</p>
      )}
      {deleteError && (
        <p className="px-3 text-destructive text-xs">{deleteError}</p>
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

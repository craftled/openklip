"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectCreateOverlay } from "@/components/project-create-overlay";
import { ProjectDeleteAction } from "@/components/project-delete-action";
import { ProjectInlineFolderAction } from "@/components/project-folder-action";
import { RelativeTimeLabel } from "@/components/relative-time-label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  MENU_INSTANT_ATTR,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useProjectCreate } from "@/hooks/use-project-create";
import { toastProjectDeleted, toastProjectDeleteFailed } from "@/lib/app-toast";
import type { ProjectListing } from "@/lib/project-list";
import {
  findActiveProject,
  projectAtShortcutIndex,
  projectInitial,
} from "@/lib/project-list";
import { relativeTimeAgo } from "@/lib/relative-time";

export function ProjectSwitcher({
  activeSlug,
  onCreateProject,
  onDeleteProject,
  onProjectCreated,
  onSelectProject,
  projects,
}: {
  activeSlug: string;
  onCreateProject: (file: File) => Promise<string>;
  onDeleteProject: (slug: string) => Promise<void>;
  onProjectCreated: (slug: string) => void;
  onSelectProject: (slug: string) => void;
  projects: ProjectListing[];
}) {
  const { isMobile } = useSidebar();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const { createPhase, createdSlug, creating, ingestVideo } = useProjectCreate({
    onCreateProject,
    onProjectCreated,
  });
  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState<string | null>(
    null
  );
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuInstant, setMenuInstant] = useState(false);

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
        setMenuInstant(true);
        setMenuOpen(false);
        onSelectProject(project.slug);
        requestAnimationFrame(() => {
          setMenuInstant(false);
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSelectProject, projects]);

  const onConfirmDelete = async (slug: string) => {
    setDeletingSlug(slug);
    try {
      await onDeleteProject(slug);
      toastProjectDeleted();
      setConfirmDeleteSlug(null);
      setMenuOpen(false);
    } catch (e) {
      toastProjectDeleteFailed((e as Error).message);
    } finally {
      setDeletingSlug(null);
    }
  };

  return (
    <>
      {createPhase ? (
        <ProjectCreateOverlay
          phase={createPhase}
          slug={createdSlug ?? undefined}
        />
      ) : null}
      <NewProjectDialog
        onOpenChange={setNewProjectOpen}
        onVideoSelected={ingestVideo}
        open={newProjectOpen}
      />
      <SidebarMenu>
        <SidebarMenuItem className="group/project-trigger">
          <DropdownMenu
            onOpenChange={(open) => {
              setMenuOpen(open);
              if (!open) {
                setConfirmDeleteSlug(null);
              }
            }}
            open={menuOpen}
          >
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                size="lg"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-foreground-5 font-medium text-foreground text-sm">
                  {projectInitial(active.slug)}
                </div>
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate pr-4 font-medium">
                    {active.slug}
                  </span>
                  <span className="truncate text-tertiary text-xs">
                    {creating ? (
                      "Creating project…"
                    ) : (
                      <RelativeTimeLabel
                        format={relativeTimeAgo}
                        ms={active.mtimeMs}
                      />
                    )}
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
              {...(menuInstant ? { [MENU_INSTANT_ATTR]: "" } : {})}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-tertiary text-xs">
                  Projects
                </DropdownMenuLabel>
                {projects.length === 0 && (
                  <DropdownMenuItem className="text-tertiary" disabled>
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
                  onClick={() => {
                    setMenuOpen(false);
                    setNewProjectOpen(true);
                  }}
                >
                  <div className="flex size-6 items-center justify-center rounded-md bg-foreground/5">
                    <Plus className="size-4" />
                  </div>
                  <span className="font-medium text-tertiary">
                    {creating ? "Creating…" : "Create new project"}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <ProjectInlineFolderAction
            className="absolute top-1/2 right-7 z-10 -translate-y-1/2 opacity-100"
            revealGroup="project"
            slug={active.slug}
          />
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}

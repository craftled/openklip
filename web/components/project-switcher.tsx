"use client";

import { useEffect, useState } from "react";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectCreateOverlay } from "@/components/project-create-overlay";
import { ProjectDeleteAction } from "@/components/project-delete-action";
import { ProjectInlineFolderAction } from "@/components/project-folder-action";
import { ProjectOverwriteDialog } from "@/components/project-overwrite-dialog";
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
import { useProjectCreate } from "@/hooks/use-project-create";
import { toastProjectDeleted, toastProjectDeleteFailed } from "@/lib/app-toast";
import {
  APP_ICON_CLASS,
  Check,
  ChevronsUpDown,
  FolderOpen,
  Plus,
} from "@/lib/icon";
import type {
  IngestProgressView,
  ProjectCreateOptions,
} from "@/lib/project-create";
import type { ProjectListing } from "@/lib/project-list";
import {
  findActiveProject,
  projectAtShortcutIndex,
  projectInitial,
} from "@/lib/project-list";
import {
  SIDEBAR_HEADER_ICON_CLASS,
  SIDEBAR_MENU_HEADER_CLASS,
  SIDEBAR_ROW_LABEL_TEXT_CLASS,
} from "@/lib/sidebar-row-styles";
import { cn } from "@/lib/utils";

export function ProjectSwitcher({
  activeSlug,
  onCreateProject,
  onDeleteProject,
  onProjectCreated,
  onSelectProject,
  projects,
}: {
  activeSlug: string;
  onCreateProject: (
    file: File,
    onProgress: (p: IngestProgressView) => void,
    options?: ProjectCreateOptions
  ) => Promise<string>;
  onDeleteProject: (slug: string) => Promise<void>;
  onProjectCreated: (slug: string) => void;
  onSelectProject: (slug: string) => void;
  projects: ProjectListing[];
}) {
  const { isMobile } = useSidebar();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const {
    cancelOverwrite,
    confirmOverwrite,
    createPhase,
    createdSlug,
    creating,
    ingestVideo,
    pendingOverwrite,
    progress,
  } = useProjectCreate({
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
          progress={progress}
          slug={createdSlug ?? undefined}
        />
      ) : null}
      <NewProjectDialog
        onOpenChange={setNewProjectOpen}
        onVideoSelected={ingestVideo}
        open={newProjectOpen}
      />
      <ProjectOverwriteDialog
        fileName={pendingOverwrite?.file.name ?? ""}
        onCancel={cancelOverwrite}
        onConfirm={confirmOverwrite}
        open={pendingOverwrite !== null}
      />
      <SidebarMenu>
        <SidebarMenuItem className="group/project-trigger relative">
          <DropdownMenu
            onOpenChange={(open) => {
              setMenuOpen(open);
              if (!open) {
                setConfirmDeleteSlug(null);
              }
            }}
            open={menuOpen}
          >
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  className={cn(
                    SIDEBAR_MENU_HEADER_CLASS,
                    "data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
                  )}
                  size="sm"
                >
                  <FolderOpen className={SIDEBAR_HEADER_ICON_CLASS} />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate pr-6",
                      SIDEBAR_ROW_LABEL_TEXT_CLASS
                    )}
                  >
                    {active.slug}
                  </span>
                  {creating ? (
                    <span className="shrink-0 text-muted-foreground/58 text-xs">
                      Creating…
                    </span>
                  ) : null}
                  <ChevronsUpDown
                    className={cn("absolute right-2", APP_ICON_CLASS)}
                  />
                </SidebarMenuButton>
              }
            />
            <DropdownMenuContent
              align="start"
              className="w-(--anchor-width) min-w-56 rounded-lg data-instant:animate-none data-instant:duration-[0.01ms]"
              data-instant={menuInstant ? "" : undefined}
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
                            <Check
                              className={cn(
                                "ml-auto group-hover/project:invisible",
                                APP_ICON_CLASS
                              )}
                            />
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
                    <Plus className={APP_ICON_CLASS} />
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
    </>
  );
}

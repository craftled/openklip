"use client";

import { useRouter } from "next/navigation";
import type { DragEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { EmptyWorkspaceMain } from "@/components/empty-workspace-main";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectCreateOverlay } from "@/components/project-create-overlay";
import { ProjectOverwriteDialog } from "@/components/project-overwrite-dialog";
import { SettingsSidebarNav } from "@/components/settings/settings-sidebar-nav";
import { SettingsView } from "@/components/settings/settings-view";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useInboxWatch } from "@/hooks/use-inbox-watch";
import { useProjectCreate } from "@/hooks/use-project-create";
import {
  type AgentModelId,
  DEFAULT_AGENT_MODEL,
  getDefaultAgentModel,
  setDefaultAgentModel,
  subscribeDefaultAgent,
} from "@/lib/agent-preferences";
import { toastProjectCreateFailed } from "@/lib/app-toast";
import { APP_ICON_CLASS, FolderOpen, Plus, SettingsIcon } from "@/lib/icon";
import { createProjectFromVideo } from "@/lib/project-create";
import { selectDroppedVideo } from "@/lib/project-intake";
import type { SettingsSectionId } from "@/lib/settings-navigation";
import {
  SIDEBAR_LEADING_GLYPH_CLASS,
  SIDEBAR_MENU_HEADER_CLASS,
  SIDEBAR_ROW_LABEL_TEXT_CLASS,
} from "@/lib/sidebar-row-styles";
import { cn } from "@/lib/utils";
import { fetchWorkspace, type WorkspaceInfo } from "@/lib/workspace-client";

export function EmptyWorkspace() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultAgent, setDefaultAgent] =
    useState<AgentModelId>(DEFAULT_AGENT_MODEL);
  const [export1080, setExport1080] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionId>("appearance");
  const [dropActive, setDropActive] = useState(false);

  useEffect(() => {
    setDefaultAgent(getDefaultAgentModel());
    return subscribeDefaultAgent(setDefaultAgent);
  }, []);

  useEffect(() => {
    let alive = true;
    void fetchWorkspace()
      .then((info) => {
        if (!alive) {
          return;
        }
        setWorkspace(info);
        if (!info.configured && info.pickerSupported) {
          setDialogOpen(true);
        }
      })
      .catch(() => {
        if (alive) {
          setDialogOpen(true);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const onProjectCreated = useCallback(
    (slug: string) => {
      router.push(`/?slug=${encodeURIComponent(slug)}`);
      router.refresh();
    },
    [router]
  );

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
    onCreateProject: createProjectFromVideo,
    onProjectCreated,
  });

  const onIngested = useCallback(() => router.refresh(), [router]);
  const inboxJobs = useInboxWatch(onIngested);

  const folderReady = workspace?.configured || !workspace?.pickerSupported;
  // Whole-workspace drop is live only once the folder is ready, no create is
  // already in flight, and no overwrite confirmation is pending (a drop while
  // the dialog is open would start a second create behind it).
  const dropEnabled =
    Boolean(folderReady) && !creating && pendingOverwrite === null;

  const onWorkspaceDragEnter = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (dropEnabled) {
      setDropActive(true);
    }
  };
  const onWorkspaceDragOver = (e: DragEvent<HTMLElement>) => {
    // preventDefault advertises the surface as a drop target; while disabled,
    // let the browser show the default no-drop affordance instead of
    // swallowing the file.
    if (dropEnabled) {
      e.preventDefault();
    }
  };
  const onWorkspaceDragLeave = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropActive(false);
    }
  };
  const onWorkspaceDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDropActive(false);
    if (!dropEnabled) {
      return;
    }
    const picked = selectDroppedVideo(Array.from(e.dataTransfer.files));
    if ("error" in picked) {
      toastProjectCreateFailed(picked.error);
      return;
    }
    void ingestVideo(picked.file);
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
        onFolderChosen={() => {
          void fetchWorkspace()
            .then(setWorkspace)
            .catch(() => {
              // Keep the last known workspace state.
            });
        }}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            void fetchWorkspace()
              .then(setWorkspace)
              .catch(() => {
                // Keep the last known workspace state.
              });
          }
        }}
        onVideoSelected={ingestVideo}
        open={dialogOpen}
      />
      <ProjectOverwriteDialog
        fileName={pendingOverwrite?.file.name ?? ""}
        onCancel={cancelOverwrite}
        onConfirm={confirmOverwrite}
        open={pendingOverwrite !== null}
      />
      <SidebarProvider>
        <Sidebar collapsible="offcanvas" side="left">
          {settingsOpen ? (
            <SidebarContent>
              <SettingsSidebarNav
                activeSection={settingsSection}
                onBack={() => setSettingsOpen(false)}
                onSelectSection={setSettingsSection}
              />
            </SidebarContent>
          ) : (
            <>
              <SidebarHeader className="gap-0 px-1.5 py-2">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={cn(
                        SIDEBAR_MENU_HEADER_CLASS,
                        "pointer-events-none"
                      )}
                      size="sm"
                    >
                      <FolderOpen className={APP_ICON_CLASS} />
                      <span className="min-w-0 flex-1 truncate text-foreground/95">
                        No project yet
                      </span>
                      <span className="shrink-0 text-[12px] text-muted-foreground/40">
                        {folderReady ? "Add a video" : "Choose folder"}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarHeader>
              <SidebarContent>
                <SidebarMenu className="px-1.5 pt-1">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={SIDEBAR_MENU_HEADER_CLASS}
                      onClick={() => setDialogOpen(true)}
                      size="sm"
                    >
                      <Plus className={APP_ICON_CLASS} />
                      <span>New project</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarContent>
              <SidebarFooter className="px-1.5 py-2">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={SIDEBAR_MENU_HEADER_CLASS}
                      onClick={() => setSettingsOpen(true)}
                      size="sm"
                    >
                      <SettingsIcon className={SIDEBAR_LEADING_GLYPH_CLASS} />
                      <span className={SIDEBAR_ROW_LABEL_TEXT_CLASS}>
                        Settings
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarFooter>
            </>
          )}
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="flex min-h-svh flex-col bg-background">
          {settingsOpen ? (
            <SettingsView
              activeSection={settingsSection}
              defaultAgent={defaultAgent}
              export1080={export1080}
              onDefaultAgentChange={setDefaultAgentModel}
              onExport1080Change={setExport1080}
            />
          ) : (
            <EmptyWorkspaceMain
              dialogOpen={dialogOpen}
              dropActive={dropActive}
              folderReady={Boolean(folderReady)}
              inboxJobs={inboxJobs}
              onDragEnter={onWorkspaceDragEnter}
              onDragLeave={onWorkspaceDragLeave}
              onDragOver={onWorkspaceDragOver}
              onDrop={onWorkspaceDrop}
              onOpenDialog={() => setDialogOpen(true)}
              workspaceDisplayRoot={workspace?.displayRoot}
            />
          )}
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}

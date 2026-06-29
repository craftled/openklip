"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectCreateOverlay } from "@/components/project-create-overlay";
import { SettingsSidebarNav } from "@/components/settings/settings-sidebar-nav";
import { SettingsView } from "@/components/settings/settings-view";
import { Button } from "@/components/ui/button";
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
import { Film, FolderOpen, Plus, SettingsIcon, Sparkles } from "@/lib/icon";
import { createProjectFromVideo } from "@/lib/project-create";
import type { SettingsSectionId } from "@/lib/settings-navigation";
import {
  SIDEBAR_LEADING_GLYPH_CLASS,
  SIDEBAR_ROW_HOVER_CLASS,
  SIDEBAR_ROW_IDLE_TEXT_CLASS,
  SIDEBAR_ROW_LABEL_TEXT_CLASS,
  sidebarHeaderRowClass,
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

  const { createPhase, createdSlug, ingestVideo, progress } = useProjectCreate({
    onCreateProject: createProjectFromVideo,
    onProjectCreated,
  });

  const onIngested = useCallback(() => router.refresh(), [router]);
  const inboxJobs = useInboxWatch(onIngested);

  const folderReady = workspace?.configured || !workspace?.pickerSupported;

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
                        sidebarHeaderRowClass(),
                        "pointer-events-none"
                      )}
                      size="sm"
                    >
                      <FolderOpen className="size-4 shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1 truncate text-foreground/95">
                        No project yet
                      </span>
                      <span className="shrink-0 text-[12px] text-tertiary/40">
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
                      className={sidebarHeaderRowClass()}
                      onClick={() => setDialogOpen(true)}
                      size="sm"
                    >
                      <Plus className="size-4 shrink-0" />
                      <span>New project</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarContent>
              <SidebarFooter className="px-1.5 py-2">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={cn(
                        sidebarHeaderRowClass(),
                        SIDEBAR_ROW_IDLE_TEXT_CLASS,
                        SIDEBAR_ROW_HOVER_CLASS
                      )}
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
        <SidebarInset className="flex min-h-svh flex-col bg-app-shell">
          {settingsOpen ? (
            <SettingsView
              activeSection={settingsSection}
              defaultAgent={defaultAgent}
              export1080={export1080}
              onDefaultAgentChange={setDefaultAgentModel}
              onExport1080Change={setExport1080}
            />
          ) : (
            <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-lg border border-border bg-surface-1">
                <Sparkles className="size-7 text-tertiary" />
              </div>
              <div className="max-w-md space-y-2">
                <h1 className="font-semibold text-xl tracking-tight">
                  Welcome to OpenKlip
                </h1>
                <p className="text-sm text-tertiary leading-relaxed">
                  {folderReady
                    ? "Your workspace is ready. Add a video to transcribe, cut filler, and export."
                    : "Choose a folder for your projects, then add a video to get started."}
                </p>
                {workspace?.displayRoot ? (
                  <p className="truncate text-code text-tertiary">
                    {workspace.displayRoot}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {folderReady ? (
                  <Button onClick={() => setDialogOpen(true)} type="button">
                    <Film className="size-4" />
                    Add video
                  </Button>
                ) : (
                  <Button onClick={() => setDialogOpen(true)} type="button">
                    <FolderOpen className="size-4" />
                    Choose folder
                  </Button>
                )}
              </div>
              {inboxJobs.length > 0 ? (
                <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface-1 px-4 py-3">
                  {inboxJobs.map((job) => (
                    <p className="text-sm text-tertiary" key={job.id}>
                      Ingesting {job.filename}
                      {job.progress
                        ? ` — ${job.progress.message}… (${job.progress.step}/${job.progress.total})`
                        : "…"}
                    </p>
                  ))}
                </div>
              ) : null}
              {!dialogOpen && folderReady && inboxJobs.length === 0 ? (
                <p className="max-w-sm text-tertiary text-xs">
                  Tip: drop a video into your projects folder to auto-ingest it,
                  or use <code>openklip ingest &lt;video&gt;</code> from the
                  CLI.
                </p>
              ) : null}
            </main>
          )}
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}

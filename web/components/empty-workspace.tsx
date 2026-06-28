"use client";

import { Film, FolderOpen, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectCreateOverlay } from "@/components/project-create-overlay";
import { SidebarSettingsPanel } from "@/components/sidebar-settings";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useProjectCreate } from "@/hooks/use-project-create";
import {
  type AgentModelId,
  DEFAULT_AGENT_MODEL,
  getDefaultAgentModel,
  setDefaultAgentModel,
  subscribeDefaultAgent,
} from "@/lib/agent-preferences";
import { createProjectFromVideo } from "@/lib/project-create";
import {
  type AppThemeId,
  getAppTheme,
  subscribeAppTheme,
} from "@/lib/theme-preferences";
import { fetchWorkspace, type WorkspaceInfo } from "@/lib/workspace-client";

export function EmptyWorkspace() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [appTheme, setAppThemeState] = useState<AppThemeId>(() =>
    getAppTheme()
  );
  const [defaultAgent, setDefaultAgent] =
    useState<AgentModelId>(DEFAULT_AGENT_MODEL);
  const [export1080, setExport1080] = useState(true);

  useEffect(() => subscribeAppTheme(setAppThemeState), []);
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

  const { createPhase, createdSlug, ingestVideo } = useProjectCreate({
    onCreateProject: createProjectFromVideo,
    onProjectCreated,
  });

  const folderReady = workspace?.configured || !workspace?.pickerSupported;

  return (
    <>
      {createPhase ? (
        <ProjectCreateOverlay
          phase={createPhase}
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
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton className="pointer-events-none" size="lg">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-foreground-5 font-medium text-foreground text-sm">
                    ?
                  </div>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">No project yet</span>
                    <span className="truncate text-muted-foreground text-xs">
                      {folderReady ? "Add a video to start" : "Choose a folder"}
                    </span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            <SidebarMenu className="px-2">
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setDialogOpen(true)}>
                  <Plus />
                  <span>New project</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarSeparator />
            <div className="px-3 py-2">
              <SidebarSettingsPanel
                appTheme={appTheme}
                defaultAgent={defaultAgent}
                export1080={export1080}
                onDefaultAgentChange={setDefaultAgentModel}
                onExport1080Change={setExport1080}
              />
            </div>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="flex min-h-svh flex-col">
          <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-xl bg-foreground-5">
              <Sparkles className="size-7 text-muted-foreground" />
            </div>
            <div className="max-w-md space-y-2">
              <h1 className="font-semibold text-xl tracking-tight">
                Welcome to OpenKlip
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {folderReady
                  ? "Your workspace is ready. Add a video to transcribe, cut filler, and export."
                  : "Choose a folder for your projects, then add a video to get started."}
              </p>
              {workspace?.displayRoot ? (
                <p className="truncate text-code text-muted-foreground">
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
            {!dialogOpen && folderReady ? (
              <p className="max-w-sm text-muted-foreground text-xs">
                Tip: drop a video anywhere in the new project dialog, or use{" "}
                <code>openklip ingest &lt;video&gt;</code>{" "}
                from the CLI.
              </p>
            ) : null}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}

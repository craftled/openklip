"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAgentChat } from "@/components/agent-chat-context";
import { AnalyzeAssetsButton } from "@/components/analyze-assets-button";
import {
  AssetBin,
  type AssetBinUpdate,
  type BinAsset,
} from "@/components/asset-bin";
import { ChatListItem } from "@/components/chat-list-item";
import { CollapsibleSidebarSection } from "@/components/collapsible-sidebar";
import { KeyboardHint } from "@/components/keyboard-hint";
import { ProjectInlineFolderAction } from "@/components/project-folder-action";
import { ProjectSwitcher } from "@/components/project-switcher";
import { RelativeTimeLabel } from "@/components/relative-time-label";
import { SidebarSettingsPanel } from "@/components/sidebar-settings";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { useModShortcut } from "@/hooks/use-mod-shortcut";
import {
  type AgentModelId,
  DEFAULT_AGENT_MODEL,
  getDefaultAgentModel,
  setDefaultAgentModel,
  subscribeDefaultAgent,
} from "@/lib/agent-preferences";
import { chatListEmptyLabel, filterThreadsByQuery } from "@/lib/chat-list";
import {
  FolderOpen,
  MessageSquare,
  MessageSquarePlus,
  PanelLeft,
  Search,
  Settings2,
} from "@/lib/icon";
import type { ProjectHoverContext } from "@/lib/project-context";
import { createProjectFromVideo } from "@/lib/project-create";
import type { ProjectListing } from "@/lib/project-list";
import { deleteProjectApi } from "@/lib/projects-client";
import { relativeTimeShort } from "@/lib/relative-time";
import {
  type AppThemeId,
  getAppTheme,
  subscribeAppTheme,
} from "@/lib/theme-preferences";
import { cn } from "@/lib/utils";

interface AgentSidebarProps {
  activeSlug: string;
  assets: BinAsset[];
  export1080: boolean;
  mediaVersion?: number;
  onAssetsUpdated: (update: AssetBinUpdate) => void;
  onExport1080Change: (value: boolean) => void;
  projectHover: ProjectHoverContext;
  projects: ProjectListing[];
  sampleRate: number;
}

export function AgentSidebar({
  activeSlug,
  assets,
  export1080,
  mediaVersion,
  onAssetsUpdated,
  onExport1080Change,
  projectHover,
  projects,
  sampleRate,
}: AgentSidebarProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [appTheme, setAppThemeState] = useState<AppThemeId>(() =>
    getAppTheme()
  );
  const [defaultAgent, setDefaultAgent] =
    useState<AgentModelId>(DEFAULT_AGENT_MODEL);

  useEffect(() => subscribeAppTheme(setAppThemeState), []);
  useEffect(() => {
    setDefaultAgent(getDefaultAgentModel());
    return subscribeDefaultAgent(setDefaultAgent);
  }, []);
  const {
    activeThreadId,
    archivedThreads,
    chatsLoading,
    onArchiveThread,
    onDeleteThread,
    onNewChat,
    onRenameThread,
    onUnarchiveThread,
    runningThreadId,
    selectThread,
    threads,
  } = useAgentChat();

  const openProject = useCallback(
    (slug: string) => {
      if (slug !== activeSlug) {
        router.push(`/?slug=${encodeURIComponent(slug)}`);
      }
    },
    [activeSlug, router]
  );

  const onProjectCreated = useCallback(
    (slug: string) => {
      router.push(`/?slug=${encodeURIComponent(slug)}`);
      router.refresh();
    },
    [router]
  );

  const onCreateProject = useCallback(
    (file: File) => createProjectFromVideo(file),
    []
  );

  const onDeleteProject = useCallback(
    async (slug: string) => {
      const { projects: remaining } = await deleteProjectApi(slug);
      if (slug === activeSlug) {
        const next = remaining[0]?.slug;
        router.push(next ? `/?slug=${encodeURIComponent(next)}` : "/");
      }
      router.refresh();
    },
    [activeSlug, router]
  );

  const filteredChats = useMemo(
    () => filterThreadsByQuery(threads, search),
    [threads, search]
  );

  const filteredArchivedChats = useMemo(
    () => filterThreadsByQuery(archivedThreads, search),
    [archivedThreads, search]
  );

  const chatEmptyLabel = useMemo(
    () =>
      chatListEmptyLabel({
        loading: chatsLoading,
        totalCount: threads.length + archivedThreads.length,
        filteredActiveCount: filteredChats.length,
        filteredArchivedCount: filteredArchivedChats.length,
      }),
    [
      archivedThreads.length,
      chatsLoading,
      filteredArchivedChats.length,
      filteredChats.length,
      threads.length,
    ]
  );

  return (
    <Sidebar collapsible="offcanvas" side="left">
      <SidebarHeader>
        <ProjectSwitcher
          activeSlug={activeSlug}
          onCreateProject={onCreateProject}
          onDeleteProject={onDeleteProject}
          onProjectCreated={onProjectCreated}
          onSelectProject={openProject}
          projects={projects}
        />
        <SidebarMenu className="gap-1.5">
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onNewChat}>
              <MessageSquarePlus />
              <span>New chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="pb-0.5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-tertiary" />
              <SidebarInput
                className="pl-8"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats"
                value={search}
              />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <CollapsibleSidebarSection
          defaultOpen
          icon={MessageSquare}
          title="Chats"
        >
          <SidebarMenu>
            {chatEmptyLabel && (
              <p className="px-2 py-1 text-tertiary text-xs">
                {chatEmptyLabel}
              </p>
            )}
            {filteredChats.map((t) => (
              <ChatListItem
                inProgress={runningThreadId === t.id}
                isActive={t.id === activeThreadId}
                key={t.id}
                onArchive={() => void onArchiveThread(t.id)}
                onDelete={() => void onDeleteThread(t.id)}
                onRename={(title) => void onRenameThread(t.id, title)}
                onSelect={() => void selectThread(t.id)}
                project={projectHover}
                thread={t}
                timeLabel={
                  <RelativeTimeLabel
                    format={relativeTimeShort}
                    ms={t.updatedAt}
                  />
                }
              />
            ))}
          </SidebarMenu>
          {filteredArchivedChats.length > 0 && (
            <>
              <p className="mt-3 mb-1 px-2 text-tertiary text-xs">Archived</p>
              <SidebarMenu>
                {filteredArchivedChats.map((t) => (
                  <ChatListItem
                    archived
                    isActive={t.id === activeThreadId}
                    key={t.id}
                    onArchive={() => void onArchiveThread(t.id)}
                    onDelete={() => void onDeleteThread(t.id)}
                    onRename={(title) => void onRenameThread(t.id, title)}
                    onSelect={() => void selectThread(t.id)}
                    onUnarchive={() => void onUnarchiveThread(t.id)}
                    project={projectHover}
                    thread={t}
                    timeLabel={
                      <RelativeTimeLabel
                        format={relativeTimeShort}
                        ms={t.updatedAt}
                      />
                    }
                  />
                ))}
              </SidebarMenu>
            </>
          )}
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          action={
            <ProjectInlineFolderAction
              className="opacity-100"
              revealGroup="assets"
              slug={activeSlug}
              target="assets"
            />
          }
          className="group/assets border-sidebar-border border-t pt-1"
          defaultOpen
          icon={FolderOpen}
          title="Assets"
        >
          <div className="px-1">
            <AssetBin
              assets={assets}
              mediaVersion={mediaVersion}
              onAssetsUpdated={onAssetsUpdated}
              sampleRate={sampleRate}
              slug={activeSlug}
            />
            <div className="px-1 pt-1.5">
              <AnalyzeAssetsButton />
            </div>
          </div>
        </CollapsibleSidebarSection>

        <CollapsibleSidebarSection
          className="border-sidebar-border border-t pt-1"
          defaultOpen={false}
          icon={Settings2}
          title="Settings"
        >
          <SidebarSettingsPanel
            appTheme={appTheme}
            defaultAgent={defaultAgent}
            export1080={export1080}
            onDefaultAgentChange={setDefaultAgentModel}
            onExport1080Change={onExport1080Change}
          />
        </CollapsibleSidebarSection>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}

export function AgentSidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar } = useSidebar();
  const shortcut = useModShortcut("b");
  const label = `Toggle agent sidebar (${shortcut})`;

  return (
    <Button
      aria-label={label}
      className={cn("h-8 shrink-0 gap-1 px-2", className)}
      onClick={toggleSidebar}
      title={label}
      variant="ghost"
    >
      <PanelLeft className="size-4" />
      <KeyboardHint shortcutKey="b" />
    </Button>
  );
}

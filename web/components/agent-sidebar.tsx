"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useAgentChat } from "@/components/agent-chat-context";
import { AnalyzeAssetsButton } from "@/components/analyze-assets-button";
import {
  AssetBin,
  type AssetBinUpdate,
  type BinAsset,
} from "@/components/asset-bin";
import { ChatListItem } from "@/components/chat-list-item";
import { CollapsibleSidebarSection } from "@/components/collapsible-sidebar";
import { ProjectInlineFolderAction } from "@/components/project-folder-action";
import { ProjectSwitcher } from "@/components/project-switcher";
import { RelativeTimeLabel } from "@/components/relative-time-label";
import { SettingsSidebarNav } from "@/components/settings/settings-sidebar-nav";
import {
  SidebarSegmentedPicker,
  type SidebarSegmentView,
} from "@/components/sidebar-segmented-picker";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useInboxWatch } from "@/hooks/use-inbox-watch";
import { useModShortcut } from "@/hooks/use-mod-shortcut";

import { chatListEmptyLabel, filterThreadsByQuery } from "@/lib/chat-list";
import { NewChatIcon, PanelLeft, Search, SettingsIcon } from "@/lib/icon";
import type { ProjectHoverContext } from "@/lib/project-context";
import {
  createProjectFromVideo,
  type IngestProgressView,
} from "@/lib/project-create";
import type { ProjectListing } from "@/lib/project-list";
import { deleteProjectApi } from "@/lib/projects-client";
import { relativeTimeShort } from "@/lib/relative-time";
import type { SettingsSectionId } from "@/lib/settings-navigation";
import {
  SIDEBAR_LEADING_GLYPH_CLASS,
  SIDEBAR_ROW_HOVER_CLASS,
  SIDEBAR_ROW_IDLE_TEXT_CLASS,
  SIDEBAR_ROW_LABEL_TEXT_CLASS,
  sidebarHeaderRowClass,
} from "@/lib/sidebar-row-styles";
import { cn } from "@/lib/utils";

interface AgentSidebarProps {
  activeSlug: string;
  assets: BinAsset[];
  mediaVersion?: number;
  onAssetsUpdated: (update: AssetBinUpdate) => void;
  onCloseSettings: () => void;
  onOpenSettings: () => void;
  onSelectSettingsSection: (section: SettingsSectionId) => void;
  projectHover: ProjectHoverContext;
  projects: ProjectListing[];
  sampleRate: number;
  settingsOpen: boolean;
  settingsSection: SettingsSectionId;
}

export function AgentSidebar({
  activeSlug,
  assets,
  mediaVersion,
  onAssetsUpdated,
  onCloseSettings,
  onOpenSettings,
  onSelectSettingsSection,
  projectHover,
  projects,
  sampleRate,
  settingsOpen,
  settingsSection,
}: AgentSidebarProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<SidebarSegmentView>("threads");

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
    (file: File, onProgress: (p: IngestProgressView) => void) =>
      createProjectFromVideo(file, onProgress),
    []
  );

  const onInboxIngested = useCallback(() => router.refresh(), [router]);
  useInboxWatch(onInboxIngested);

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
      {settingsOpen ? (
        <SidebarContent>
          <SettingsSidebarNav
            activeSection={settingsSection}
            onBack={onCloseSettings}
            onSelectSection={onSelectSettingsSection}
          />
        </SidebarContent>
      ) : (
        <>
          <SidebarHeader className="gap-0 px-1.5 py-2">
            <div className="flex w-full items-center gap-1.5">
              <SidebarTrigger aria-label="Toggle agent sidebar" />
              <div className="min-w-0 flex-1">
                <ProjectSwitcher
                  activeSlug={activeSlug}
                  onCreateProject={onCreateProject}
                  onDeleteProject={onDeleteProject}
                  onProjectCreated={onProjectCreated}
                  onSelectProject={openProject}
                  projects={projects}
                />
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup className="px-1.5 pt-1 pb-1.5">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className={sidebarHeaderRowClass()}
                    onClick={onNewChat}
                    size="sm"
                  >
                    <NewChatIcon className={SIDEBAR_LEADING_GLYPH_CLASS} />
                    <span className="truncate">New chat</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  {searchOpen ? (
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
                      <SidebarInput
                        autoFocus
                        className="pl-8"
                        onBlur={() => {
                          if (!search.trim()) {
                            setSearchOpen(false);
                          }
                        }}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search chats"
                        value={search}
                      />
                    </div>
                  ) : (
                    <SidebarMenuButton
                      className={cn(
                        sidebarHeaderRowClass(),
                        SIDEBAR_ROW_IDLE_TEXT_CLASS,
                        SIDEBAR_ROW_HOVER_CLASS
                      )}
                      onClick={() => setSearchOpen(true)}
                      size="sm"
                    >
                      <Search className={SIDEBAR_LEADING_GLYPH_CLASS} />
                      <span className="truncate">Search</span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>

            <SidebarSegmentedPicker
              activeView={sidebarView}
              onSelectView={setSidebarView}
            />

            {sidebarView === "threads" ? (
              <>
                <CollapsibleSidebarSection defaultOpen title="Chats">
                  <SidebarMenu>
                    {chatEmptyLabel && (
                      <p className="px-2 py-1 text-[12px] text-tertiary/58">
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
                      <p className="mt-2 mb-1 px-2 text-[12px] text-tertiary/58">
                        Archived
                      </p>
                      <SidebarMenu>
                        {filteredArchivedChats.map((t) => (
                          <ChatListItem
                            archived
                            isActive={t.id === activeThreadId}
                            key={t.id}
                            onArchive={() => void onArchiveThread(t.id)}
                            onDelete={() => void onDeleteThread(t.id)}
                            onRename={(title) =>
                              void onRenameThread(t.id, title)
                            }
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
                  defaultOpen
                  showFolderIcon
                  title="Assets"
                >
                  <div className="px-0.5">
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
              </>
            ) : (
              <p className="px-2 py-3 text-[12px] text-tertiary/58">
                Workspace terminals and files will live here.
              </p>
            )}
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
                  onClick={onOpenSettings}
                  size="sm"
                >
                  <SettingsIcon className={SIDEBAR_LEADING_GLYPH_CLASS} />
                  <span className={SIDEBAR_ROW_LABEL_TEXT_CLASS}>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </>
      )}

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
      className={cn(
        "size-7 shrink-0 text-muted-foreground/75 hover:text-foreground",
        className
      )}
      onClick={toggleSidebar}
      size="icon-xs"
      title={label}
      variant="ghost"
    >
      <PanelLeft className="size-4" />
    </Button>
  );
}

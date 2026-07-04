"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgentChat } from "@/components/agent-chat-context";
import { AnalyzeAssetsButton } from "@/components/analyze-assets-button";
import {
  AssetBin,
  type AssetBinUpdate,
  type BinAsset,
} from "@/components/asset-bin";
import { ChatListItem } from "@/components/chat-list-item";
import { CollapsibleSidebarSection } from "@/components/collapsible-sidebar";
import { GitHubStars } from "@/components/github-stars";
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
  type ProjectCreateOptions,
} from "@/lib/project-create";
import type { ProjectListing } from "@/lib/project-list";
import { deleteProjectApi } from "@/lib/projects-client";
import { relativeTimeShort } from "@/lib/relative-time";
import type { SettingsSectionId } from "@/lib/settings-navigation";
import {
  SIDEBAR_LEADING_GLYPH_CLASS,
  SIDEBAR_MENU_HEADER_CLASS,
  SIDEBAR_ROW_LABEL_TEXT_CLASS,
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchShortcut = useModShortcut("k");
  const [sidebarView, setSidebarView] = useState<SidebarSegmentView>("chats");

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
    (
      file: File,
      onProgress: (p: IngestProgressView) => void,
      options?: ProjectCreateOptions
    ) => createProjectFromVideo(file, onProgress, options),
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !(event.altKey || event.shiftKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
          <SidebarHeader className="gap-0.5 border-sidebar-border/60 border-b px-2 pt-1 pb-1">
            <div className="flex h-6 w-full items-center gap-1.5 pr-0.5 pl-2">
              <div
                aria-hidden="true"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-foreground"
              >
                <span
                  className="block h-5 w-5 shrink-0 bg-current"
                  style={{
                    WebkitMask:
                      "url('/openklip.svg') center / contain no-repeat",
                    mask: "url('/openklip.svg') center / contain no-repeat",
                  }}
                />
                <span className="truncate font-medium text-[11px] leading-none">
                  OpenKlip
                </span>
              </div>
              <SidebarTrigger aria-label="Toggle agent sidebar" />
            </div>
            <div className="min-w-0">
              <ProjectSwitcher
                activeSlug={activeSlug}
                onCreateProject={onCreateProject}
                onDeleteProject={onDeleteProject}
                onProjectCreated={onProjectCreated}
                onSelectProject={openProject}
                projects={projects}
              />
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <div className="px-2 pt-1.5 pb-1">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <SidebarInput
                  aria-label="Search chats"
                  className="h-7! rounded-md border-input bg-transparent pr-14 pl-9 text-[0.8rem]! shadow-none placeholder:text-muted-foreground/74 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  ref={searchInputRef}
                  value={search}
                />
                <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-muted/90 px-2 py-0.5 font-medium text-muted-foreground text-xs leading-none">
                  {searchShortcut}
                </span>
              </div>
            </div>
            <SidebarGroup className="px-2 pt-0 pb-1">
              <SidebarMenu className="gap-1">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className={SIDEBAR_MENU_HEADER_CLASS}
                    onClick={onNewChat}
                    size="sm"
                  >
                    <NewChatIcon className={SIDEBAR_LEADING_GLYPH_CLASS} />
                    <span className="truncate">New chat</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>

            <SidebarSegmentedPicker
              activeView={sidebarView}
              onSelectView={setSidebarView}
            />

            {sidebarView === "chats" ? (
              <CollapsibleSidebarSection defaultOpen title="Chats">
                <SidebarMenu className="gap-0.5">
                  {chatEmptyLabel && (
                    <p className="px-2 py-1 text-muted-foreground/58 text-xs">
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
                    <p className="mt-2 mb-1 px-2 text-muted-foreground/58 text-xs">
                      Archived
                    </p>
                    <SidebarMenu className="gap-0.5">
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
            ) : (
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
            )}
          </SidebarContent>

          <SidebarFooter className="border-sidebar-border/60 border-t px-2 py-2">
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  className={SIDEBAR_MENU_HEADER_CLASS}
                  onClick={onOpenSettings}
                  size="sm"
                >
                  <SettingsIcon className={SIDEBAR_LEADING_GLYPH_CLASS} />
                  <span className={SIDEBAR_ROW_LABEL_TEXT_CLASS}>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <GitHubStars repo="craftled/openklip" stargazersCount={1} />
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
      <PanelLeft />
    </Button>
  );
}

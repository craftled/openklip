"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
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
import { MomentSearchPanel } from "@/components/moment-search-panel";
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
import type { TranscriptWord } from "@/hooks/use-moment-search";
import { useMomentSearchShortcut } from "@/hooks/use-moment-search-shortcut";

import { chatListEmptyLabel, filterThreadsByQuery } from "@/lib/chat-list";
import {
  Moon,
  NewChatIcon,
  PanelLeft,
  Search,
  SettingsIcon,
  Sun,
} from "@/lib/icon";
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
import type { ColorScheme } from "@/lib/theme-preferences";
import { cn } from "@/lib/utils";

interface AgentSidebarProps {
  activeSlug: string;
  assets: BinAsset[];
  colorScheme: ColorScheme;
  configPanel: ReactNode;
  mediaVersion?: number;
  onAssetsUpdated: (update: AssetBinUpdate) => void;
  onCloseSettings: () => void;
  onOpenSettings: () => void;
  onSeek: (sourceSec: number) => void;
  onSelectSettingsSection: (section: SettingsSectionId) => void;
  onSidebarViewChange: (view: SidebarSegmentView) => void;
  onToggleColorScheme: () => void;
  projectHover: ProjectHoverContext;
  projects: ProjectListing[];
  sampleRate: number;
  settingsOpen: boolean;
  settingsSection: SettingsSectionId;
  sidebarView: SidebarSegmentView;
  words: TranscriptWord[];
}

export function AgentSidebar({
  activeSlug,
  assets,
  colorScheme,
  configPanel,
  mediaVersion,
  onAssetsUpdated,
  onCloseSettings,
  onOpenSettings,
  onSeek,
  onSelectSettingsSection,
  onSidebarViewChange,
  onToggleColorScheme,
  projectHover,
  projects,
  sampleRate,
  settingsOpen,
  settingsSection,
  sidebarView,
  words,
}: AgentSidebarProps) {
  const router = useRouter();
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchShortcut = useModShortcut("k");

  useEffect(() => {
    if (sidebarView === "config" && isMobile) {
      setOpenMobile(true);
    }
  }, [isMobile, setOpenMobile, sidebarView]);

  const openMomentSearch = useCallback(() => {
    onSidebarViewChange("search");
    if (isMobile) {
      setOpenMobile(true);
    } else {
      setOpen(true);
    }
  }, [isMobile, onSidebarViewChange, setOpen, setOpenMobile]);
  useMomentSearchShortcut(openMomentSearch);

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
          <SidebarHeader className="gap-1 border-sidebar-border/60 border-b px-2 pt-1 pb-1.5">
            <div className="flex h-7 w-full items-center gap-2 pr-0.5 pl-2 text-[0.8rem]">
              <div
                aria-hidden="true"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-foreground"
              >
                <span
                  className="block size-4 shrink-0 bg-current"
                  style={{
                    WebkitMask:
                      "url('/openklip.svg') center / contain no-repeat",
                    mask: "url('/openklip.svg') center / contain no-repeat",
                  }}
                />
                <span
                  className={cn(
                    "truncate leading-none",
                    SIDEBAR_ROW_LABEL_TEXT_CLASS
                  )}
                >
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
            <SidebarSegmentedPicker
              activeView={sidebarView}
              className="pt-0.5"
              onSelectView={onSidebarViewChange}
              views={["chats", "assets", "search", "config"]}
            />
          </SidebarHeader>

          <SidebarContent className="min-h-0 flex-1 gap-0">
            {sidebarView === "chats" ? (
              <>
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
              </>
            ) : sidebarView === "assets" ? (
              <div className="min-h-0 flex-1 px-1 pt-1.5 pb-1">
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
              </div>
            ) : sidebarView === "search" ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-1.5 pb-1">
                <MomentSearchPanel
                  onSeek={onSeek}
                  slug={activeSlug}
                  words={words}
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1 pt-1.5 pb-1">
                {configPanel}
              </div>
            )}
          </SidebarContent>

          <SidebarFooter className="border-sidebar-border/60 border-t px-2 py-2">
            <SidebarMenu className="flex-row items-center gap-1">
              <SidebarMenuItem className="min-w-0 flex-1">
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
                <SidebarMenuButton
                  aria-label={
                    colorScheme === "dark"
                      ? "Switch to light mode"
                      : "Switch to dark mode"
                  }
                  className={cn(
                    SIDEBAR_MENU_HEADER_CLASS,
                    "w-7 justify-center px-1.5"
                  )}
                  onClick={onToggleColorScheme}
                  size="sm"
                  title={colorScheme === "dark" ? "Light mode" : "Dark mode"}
                >
                  {colorScheme === "dark" ? (
                    <Sun className={SIDEBAR_LEADING_GLYPH_CLASS} />
                  ) : (
                    <Moon className={SIDEBAR_LEADING_GLYPH_CLASS} />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <GitHubStars
                  className="h-7 w-7 justify-center px-1.5"
                  repo="craftled/openklip"
                  showCount={false}
                  stargazersCount={1}
                />
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

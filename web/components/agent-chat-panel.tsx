"use client";

import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useAgentChat } from "@/components/agent-chat-context";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { ProjectFolderButton } from "@/components/project-folder-action";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SelectGroup, SelectLabel } from "@/components/ui/select";
import { AGENT_GROUP_ICONS, AgentProviderIcon } from "@/lib/agent-icons";
import {
  AGENT_MODEL_GROUPS,
  type AgentModelId,
  getAgentModelLabel,
} from "@/lib/agent-preferences";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import { syncProjectAssets, uploadProjectAssets } from "@/lib/asset-upload";
import { cn } from "@/lib/utils";

interface AgentChatPanelProps {
  onAssetsUpdated: (update: AssetBinUpdate) => void;
  slug: string;
}

export function AgentChatPanel({ onAssetsUpdated, slug }: AgentChatPanelProps) {
  const {
    activeSlug,
    activeThread,
    agent,
    chatsLoading,
    defaultAgent,
    runningThreadId,
    sendMessage,
    setAgent,
  } = useAgentChat();

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAssets, setUploadingAssets] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const isRunning = runningThreadId !== null;

  const onSubmit = async ({ text }: PromptInputMessage) => {
    await sendMessage(text);
  };

  const onUploadAssets = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    setUploadingAssets(true);
    setUploadError(null);
    try {
      const latest = await uploadProjectAssets(slug, files);
      if (latest.length > 0) {
        onAssetsUpdated({ assets: latest });
      }
      const synced = await syncProjectAssets(slug);
      if (synced) {
        onAssetsUpdated(synced);
      }
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploadingAssets(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-foreground/10 border-b px-6 py-3">
          <span className="font-medium text-muted-foreground text-xs">Chat</span>
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground"
              title={getAgentModelLabel(agent)}
            >
              <AgentProviderIcon className="size-3.5 shrink-0" value={agent} />
              <span className="truncate">{getAgentModelLabel(agent)}</span>
            </span>
            {activeThread && (
              <span className="truncate text-caption text-muted-foreground/70">
                {activeThread.title}
              </span>
            )}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 px-6 py-4">
          {chatsLoading && (
            <p className="text-muted-foreground text-sm">Loading chats…</p>
          )}
          {!(chatsLoading || activeThread?.messages.length) && (
            <p className="text-muted-foreground text-sm leading-relaxed">
              Ask about cuts, filler words, or edits. Use{" "}
              <span className="text-foreground">Find filler</span> above the
              preview, or upload b-roll, music, and stills with{" "}
              <span className="text-foreground">+</span> below.
            </p>
          )}
          {activeThread?.messages.map((m) => (
            <div
              className={cn(
                "rounded-lg px-3 py-2.5 text-sm leading-relaxed",
                m.role === "user"
                  ? "bg-user-message-bubble text-foreground"
                  : "bg-transparent text-muted-foreground"
              )}
              key={m.id}
            >
              <div className="mb-0.5 text-muted-foreground text-section-label">
                {m.role === "user" ? "You" : "Agent"}
              </div>
              <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
            </div>
          ))}
          </div>
        </ScrollArea>

        <div className="shrink-0 border-foreground/10 border-t px-6 py-4">
        <PromptInput className="rounded-xl" onSubmit={onSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              disabled={isRunning || chatsLoading || uploadingAssets}
              placeholder={`Ask about ${activeSlug}…`}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputButton
                aria-label="Upload assets"
                disabled={uploadingAssets}
                onClick={() => uploadInputRef.current?.click()}
                tooltip="Upload b-roll, music, or stills"
              >
                <Plus className="size-4" />
              </PromptInputButton>
              <input
                accept="video/*,audio/*,image/*"
                className="hidden"
                multiple
                onChange={(e) => {
                  void onUploadAssets(e.target.files);
                  e.target.value = "";
                }}
                ref={uploadInputRef}
                type="file"
              />
              <ProjectFolderButton slug={slug} />
              <PromptInputSelect
                onValueChange={(value) => setAgent(value as AgentModelId)}
                value={agent}
              >
                <PromptInputSelectTrigger
                  aria-label={`Model: ${getAgentModelLabel(agent)}`}
                  className="max-w-[11rem]"
                >
                  <AgentProviderIcon
                    className="size-3.5 shrink-0"
                    value={agent}
                  />
                  <span className="truncate">{getAgentModelLabel(agent)}</span>
                </PromptInputSelectTrigger>
                <PromptInputSelectContent>
                  {AGENT_MODEL_GROUPS.map((group) => {
                    const Icon = AGENT_GROUP_ICONS[group.id];
                    return (
                      <SelectGroup key={group.id}>
                        <SelectLabel className="flex items-center gap-2 text-section-label">
                          <Icon className="size-3.5 shrink-0" />
                          {group.label}
                        </SelectLabel>
                        {group.models.map((model) => (
                          <PromptInputSelectItem
                            key={model.value}
                            textValue={model.label}
                            value={model.value}
                          >
                            <span className="flex w-full items-center gap-2">
                              <Icon className="size-3.5 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">
                                {model.label}
                              </span>
                              {defaultAgent === model.value && (
                                <Badge
                                  className="h-4 shrink-0 px-1.5 font-normal text-caption"
                                  variant="secondary"
                                >
                                  Default
                                </Badge>
                              )}
                            </span>
                          </PromptInputSelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </PromptInputSelectContent>
              </PromptInputSelect>
            </PromptInputTools>
            <PromptInputSubmit
              disabled={isRunning || chatsLoading || uploadingAssets}
              status={isRunning || uploadingAssets ? "submitted" : undefined}
            />
          </PromptInputFooter>
        </PromptInput>
        {uploadError && (
          <p className="mt-2 text-caption text-destructive">{uploadError}</p>
        )}
        {uploadingAssets && (
          <p className="mt-2 text-caption text-muted-foreground">
            Registering assets…
          </p>
        )}
        <p className="mt-2 text-caption text-muted-foreground leading-snug">
          Chats live in working/chats.json. Agents run CLI commands against the
          same <code className="text-caption">project.json</code>.
        </p>
        </div>
      </div>
    </div>
  );
}

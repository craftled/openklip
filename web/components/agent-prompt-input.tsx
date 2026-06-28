"use client";

import { Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgentChat } from "@/components/agent-chat-context";
import { AgentSkillTokenField } from "@/components/agent-skill-token-field";
import {
  AgentSkillsMenu,
  useSkillsSlashMenu,
} from "@/components/agent-skills-menu";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputProvider,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { ProjectFolderButton } from "@/components/project-folder-action";
import type { TemplateOption } from "@/components/template-select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SelectGroup, SelectLabel } from "@/components/ui/select";
import { AGENT_GROUP_ICONS, AgentProviderIcon } from "@/lib/agent-icons";
import {
  AGENT_MODEL_GROUPS,
  type AgentModelId,
  getAgentModelLabel,
} from "@/lib/agent-preferences";
import {
  toastAssetUploadFailed,
  toastChatAssetUploadSuccess,
} from "@/lib/app-toast";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import { syncProjectAssets, uploadProjectAssets } from "@/lib/asset-upload";
import {
  buildSkillCatalog,
  buildSkillMessage,
  type SkillEntry,
} from "@/lib/skills-catalog";

interface AgentPromptInputProps {
  activeSlug: string;
  chatsLoading: boolean;
  isRunning: boolean;
  onAssetsUpdated: (update: AssetBinUpdate) => void;
  onSubmitMessage: (text: string) => Promise<void>;
  slug: string;
}

function AgentPromptInputInner({
  activeSlug,
  chatsLoading,
  isRunning,
  onAssetsUpdated,
  onSubmitMessage,
  slug,
}: AgentPromptInputProps) {
  const { agent, defaultAgent, setAgent } = useAgentChat();
  const controller = usePromptInputController();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAssets, setUploadingAssets] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/templates")
      .then((res) => res.json())
      .then((data: { templates?: TemplateOption[] }) => {
        if (alive) {
          setTemplates(data.templates ?? []);
        }
      })
      .catch(() => {
        if (alive) {
          setTemplates([]);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const skills = useMemo(() => buildSkillCatalog(templates), [templates]);

  const clearInput = useCallback(() => {
    controller?.textInput.clear();
  }, [controller]);

  const selectSkill = useCallback(
    (skill: SkillEntry) => {
      setSelectedSkill(skill);
      setSkillsOpen(false);
      clearInput();
    },
    [clearInput]
  );

  const clearSelectedSkill = useCallback(() => {
    setSelectedSkill(null);
    clearInput();
  }, [clearInput]);

  const inputValue = controller?.textInput.value ?? "";

  const slashMenu = useSkillsSlashMenu({
    inputValue,
    onClearInput: clearInput,
    onSelectSkill: selectSkill,
    skillSelected: selectedSkill !== null,
    skills,
  });

  const onSubmit = async ({ text }: PromptInputMessage) => {
    if (selectedSkill) {
      const message = buildSkillMessage(selectedSkill, text);
      setSelectedSkill(null);
      clearInput();
      await onSubmitMessage(message);
      return;
    }

    const trimmed = text.trim();
    if (trimmed.startsWith("/")) {
      const match = skills.find(
        (skill) =>
          skill.slash === trimmed.slice(1) ||
          skill.id === trimmed.slice(1) ||
          `template:${skill.templateId}` === trimmed.slice(1)
      );
      if (match) {
        selectSkill(match);
        return;
      }
    }
    await onSubmitMessage(trimmed);
  };

  const onUploadAssets = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    setUploadingAssets(true);
    const count = files.length;
    try {
      const latest = await uploadProjectAssets(slug, files);
      if (latest.length > 0) {
        onAssetsUpdated({ assets: latest });
      }
      const synced = await syncProjectAssets(slug);
      if (synced) {
        onAssetsUpdated(synced);
      }
      toastChatAssetUploadSuccess(count);
    } catch (e) {
      toastAssetUploadFailed((e as Error).message);
    } finally {
      setUploadingAssets(false);
    }
  };

  return (
    <div className="relative w-full">
      <AgentSkillsMenu
        onSelect={selectSkill}
        open={slashMenu.menuOpen}
        query={slashMenu.slashQuery}
        skills={skills}
      />
      <PromptInput
        className="rounded-xl"
        inputGroupClassName="items-stretch overflow-visible"
        onSubmit={onSubmit}
      >
        <PromptInputBody>
          {selectedSkill ? (
            <AgentSkillTokenField
              disabled={isRunning || chatsLoading || uploadingAssets}
              onClearSkill={clearSelectedSkill}
              skill={selectedSkill}
            />
          ) : (
            <PromptInputTextarea
              className="w-full text-left placeholder:text-left"
              disabled={isRunning || chatsLoading || uploadingAssets}
              onKeyDown={slashMenu.handleInputKeyDown}
              placeholder={`Ask about ${activeSlug}… or type / for skills`}
            />
          )}
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
          <DropdownMenu
            onOpenChange={setSkillsOpen}
            open={skillsOpen && !slashMenu.menuOpen}
          >
            <DropdownMenuTrigger asChild>
              <PromptInputButton
                aria-label="Skills"
                tooltip="Browse edit skills"
              >
                <Sparkles className="size-4" />
                <span className="sr-only sm:not-sr-only sm:inline">Skills</span>
              </PromptInputButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[min(100vw-2rem,28rem)] p-0"
              side="top"
            >
              <AgentSkillsMenu
                embedded
                onSelect={selectSkill}
                open
                query=""
                skills={skills}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          <PromptInputSelect
            onValueChange={(value) => setAgent(value as AgentModelId)}
            value={agent}
          >
            <PromptInputSelectTrigger
              aria-label={`Model: ${getAgentModelLabel(agent)}`}
              className="max-w-[11rem]"
            >
              <AgentProviderIcon className="size-3.5 shrink-0" value={agent} />
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
    </div>
  );
}

export function AgentPromptInput(props: AgentPromptInputProps) {
  return (
    <PromptInputProvider>
      <AgentPromptInputInner {...props} />
    </PromptInputProvider>
  );
}

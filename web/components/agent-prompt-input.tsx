"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgentChat } from "@/components/agent-chat-context";
import {
  AgentModelGroupLabel,
  AgentModelOptionContent,
  AgentModelTriggerValue,
} from "@/components/agent-model-select";
import { AgentPromptAttachments } from "@/components/agent-prompt-attachments";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SelectGroup } from "@/components/ui/select";
import { AGENT_MODEL_GROUPS, type AgentModelId } from "@/lib/agent-preferences";
import {
  toastAssetUploadFailed,
  toastChatAssetUploadSuccess,
} from "@/lib/app-toast";
import type { AssetBinUpdate } from "@/lib/asset-bin-update";
import { syncProjectAssets, uploadProjectAssets } from "@/lib/asset-upload";
import { Plus, Sparkles } from "@/lib/icon";
import { fileUIPartToFile } from "@/lib/prompt-attachment";
import {
  buildSkillCatalog,
  buildSkillsMessage,
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
  const promptRootRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAssets, setUploadingAssets] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<SkillEntry[]>([]);

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

  const focusPromptField = useCallback(() => {
    const promptField = promptRootRef.current?.querySelector("textarea");
    promptField?.focus({ preventScroll: true });
  }, []);

  const selectSkill = useCallback(
    (skill: SkillEntry) => {
      setSelectedSkills((current) => {
        if (current.some((selected) => selected.id === skill.id)) {
          return current;
        }
        return [...current, skill];
      });
      setSkillsOpen(false);
      clearInput();
    },
    [clearInput]
  );

  const handleSelectSkill = useCallback(
    (skill: SkillEntry) => {
      selectSkill(skill);
      requestAnimationFrame(() => {
        focusPromptField();
      });
    },
    [focusPromptField, selectSkill]
  );

  const clearSelectedSkills = useCallback(() => {
    setSelectedSkills([]);
    clearInput();
  }, [clearInput]);

  const removeSelectedSkill = useCallback(
    (skillId: string) => {
      setSelectedSkills((current) =>
        current.filter((skill) => skill.id !== skillId)
      );
      clearInput();
    },
    [clearInput]
  );

  const inputValue = controller?.textInput.value ?? "";

  const slashMenu = useSkillsSlashMenu({
    inputValue,
    onClearInput: clearInput,
    onSelectSkill: handleSelectSkill,
    skills,
  });
  const skillsMenuId = "agent-skills-menu-list";

  const onUploadAssets = async (files: FileList | File[] | null) => {
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
      throw e;
    } finally {
      setUploadingAssets(false);
    }
  };

  const onSubmit = async ({ text, files }: PromptInputMessage) => {
    if (files.length > 0) {
      const fileObjects = await Promise.all(files.map(fileUIPartToFile));
      await onUploadAssets(fileObjects);
    }

    if (selectedSkills.length > 0) {
      const message = buildSkillsMessage(selectedSkills, text);
      setSelectedSkills([]);
      clearInput();
      await onSubmitMessage(message);
      return;
    }

    const trimmed = text.trim();
    if (!trimmed && files.length === 0) {
      return;
    }
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
    if (trimmed) {
      await onSubmitMessage(trimmed);
    }
  };

  return (
    <AgentSkillsMenu
      highlightedIndex={slashMenu.highlightedIndex}
      id={skillsMenuId}
      onHighlight={slashMenu.setHighlightedIndex}
      onSelect={handleSelectSkill}
      open={slashMenu.menuOpen}
      query={slashMenu.slashQuery}
      skills={skills}
    >
      <div ref={promptRootRef}>
        <PromptInput
          accept="video/*,audio/*,image/*"
          className="min-w-0 rounded-lg"
          inputGroupClassName="items-stretch overflow-visible"
          multiple
          onSubmit={onSubmit}
        >
          <PromptInputBody>
            <AgentPromptAttachments />
            {selectedSkills.length > 0 ? (
              <AgentSkillTokenField
                ariaControls={slashMenu.menuOpen ? skillsMenuId : undefined}
                ariaExpanded={slashMenu.menuOpen}
                disabled={isRunning || chatsLoading || uploadingAssets}
                onClearSkills={clearSelectedSkills}
                onKeyDown={slashMenu.handleInputKeyDown}
                onRemoveSkill={removeSelectedSkill}
                skills={selectedSkills}
              />
            ) : (
              <PromptInputTextarea
                aria-controls={slashMenu.menuOpen ? skillsMenuId : undefined}
                aria-expanded={slashMenu.menuOpen}
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
                <Plus />
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
              <ProjectFolderButton
                className="min-w-0 max-w-[5.5rem] shrink"
                slug={slug}
              />
              <DropdownMenu
                onOpenChange={setSkillsOpen}
                open={skillsOpen && !slashMenu.menuOpen}
              >
                <DropdownMenuTrigger
                  render={
                    <PromptInputButton
                      aria-label="Skills"
                      tooltip="Browse edit skills"
                    >
                      <Sparkles data-icon="inline-start" />
                      <span className="sr-only">Skills</span>
                    </PromptInputButton>
                  }
                />
                <DropdownMenuContent
                  align="start"
                  className="w-[min(100vw-2rem,28rem)] p-0"
                  side="top"
                >
                  <AgentSkillsMenu
                    embedded
                    onSelect={handleSelectSkill}
                    open
                    query=""
                    skills={skills}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
              <PromptInputSelect
                onValueChange={(value) => {
                  if (value) {
                    setAgent(value as AgentModelId);
                  }
                }}
                value={agent}
              >
                <PromptInputSelectTrigger
                  className="min-w-0 max-w-[8.5rem]"
                  size="sm"
                >
                  <AgentModelTriggerValue value={agent} />
                </PromptInputSelectTrigger>
                <PromptInputSelectContent className="w-72">
                  {AGENT_MODEL_GROUPS.map((group) => (
                    <SelectGroup key={group.id}>
                      <AgentModelGroupLabel
                        groupId={group.id}
                        label={group.label}
                      />
                      {group.models.map((model) => (
                        <PromptInputSelectItem
                          key={model.value}
                          value={model.value}
                        >
                          <AgentModelOptionContent
                            defaultAgent={defaultAgent}
                            groupId={group.id}
                            label={model.label}
                            value={model.value}
                          />
                        </PromptInputSelectItem>
                      ))}
                    </SelectGroup>
                  ))}
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
    </AgentSkillsMenu>
  );
}

export function AgentPromptInput(props: AgentPromptInputProps) {
  return (
    <PromptInputProvider>
      <AgentPromptInputInner {...props} />
    </PromptInputProvider>
  );
}

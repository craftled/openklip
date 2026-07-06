"use client";

import {
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  applyToasts,
  toastError,
  toastProjectCreateFailed,
  toastWorkspacePickFailed,
} from "@/lib/app-toast";
import {
  APP_ICON_CLASS,
  Check,
  Film,
  FolderOpen,
  LayoutTemplate,
  Link2,
  Upload,
} from "@/lib/icon";
import { selectDroppedIntake } from "@/lib/project-intake";
import { workspacePickerToasts } from "@/lib/toast-notifications";
import { cn } from "@/lib/utils";
import {
  fetchWorkspace,
  pickWorkspaceFolder,
  setWorkspacePath,
  type WorkspaceInfo,
} from "@/lib/workspace-client";
import {
  SUPPORTED_VIDEO_ACCEPT,
  SUPPORTED_VIDEO_LABEL,
} from "../../src/video-formats.ts";

export type NewProjectStep = "folder" | "video";

function initialStep(workspace: WorkspaceInfo | null): NewProjectStep {
  if (!workspace) {
    return "folder";
  }
  if (workspace.configured) {
    return "video";
  }
  return "folder";
}

function StepPill({
  active,
  done,
  label,
  step,
}: {
  active: boolean;
  done: boolean;
  label: string;
  step: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-border bg-foreground/5 text-foreground"
          : "border-transparent text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full font-medium",
          done
            ? "bg-primary/15 text-primary"
            : active
              ? "bg-foreground text-background"
              : "bg-foreground/10"
        )}
      >
        {done ? <Check /> : step}
      </span>
      {label}
    </div>
  );
}

export function NewProjectDialog({
  onBlankSelected,
  onFolderChosen,
  onFolderSelected,
  onOpenChange,
  onUrlSelected,
  onVideoSelected,
  open,
}: {
  onBlankSelected?: () => void | Promise<void>;
  onFolderChosen?: () => void;
  onFolderSelected?: (files: File[]) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  onUrlSelected?: (url: string) => void | Promise<void>;
  onVideoSelected: (file: File) => void | Promise<void>;
  open: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [pathDraft, setPathDraft] = useState("");
  const [settingPath, setSettingPath] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [step, setStep] = useState<NewProjectStep>("folder");

  const refreshWorkspace = useCallback(async () => {
    setLoadingWorkspace(true);
    try {
      const info = await fetchWorkspace();
      setWorkspace(info);
      return info;
    } catch (e) {
      toastError("Could not load workspace", (e as Error).message);
      return null;
    } finally {
      setLoadingWorkspace(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    let alive = true;
    void (async () => {
      const info = await refreshWorkspace();
      if (!(alive && info)) {
        return;
      }
      setStep(initialStep(info));
    })();
    return () => {
      alive = false;
    };
  }, [open, refreshWorkspace]);

  const onSetWorkspacePath = async () => {
    const trimmed = pathDraft.trim();
    if (!trimmed) {
      toastError(
        "Enter a folder path",
        "Projects will be stored in this directory."
      );
      return;
    }
    setSettingPath(true);
    try {
      const result = await setWorkspacePath(trimmed);
      applyToasts(
        workspacePickerToasts({
          root: result.root,
          projects: result.projects.map((project) => ({
            slug: project.slug,
          })),
        })
      );
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              configured: true,
              displayRoot: result.displayRoot,
              root: result.root,
            }
          : {
              configured: true,
              displayRoot: result.displayRoot,
              pickerSupported: false,
              root: result.root,
            }
      );
      setStep("video");
      onFolderChosen?.();
    } catch (e) {
      toastWorkspacePickFailed((e as Error).message);
    } finally {
      setSettingPath(false);
    }
  };

  const onChooseFolder = async () => {
    setPickingFolder(true);
    try {
      const result = await pickWorkspaceFolder();
      if (result.cancelled) {
        return;
      }
      applyToasts(
        workspacePickerToasts({
          root: result.root,
          projects: result.projects.map((project) => ({
            slug: project.slug,
          })),
        })
      );
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              configured: true,
              displayRoot: result.displayRoot,
              root: result.root,
            }
          : {
              configured: true,
              displayRoot: result.displayRoot,
              pickerSupported: true,
              root: result.root,
            }
      );
      onOpenChange(false);
      onFolderChosen?.();
    } catch (e) {
      toastWorkspacePickFailed((e as Error).message);
    } finally {
      setPickingFolder(false);
    }
  };

  const submitVideo = (file: File | undefined) => {
    if (!file) {
      return;
    }
    onOpenChange(false);
    void onVideoSelected(file);
  };

  const submitFolder = (files: File[]) => {
    if (files.length === 0 || !onFolderSelected) {
      return;
    }
    onOpenChange(false);
    void onFolderSelected(files);
  };

  const submitUrl = () => {
    const trimmed = urlDraft.trim();
    if (!(trimmed && onUrlSelected)) {
      return;
    }
    onOpenChange(false);
    setUrlDraft("");
    void onUrlSelected(trimmed);
  };

  // Shared client-side format gate for both the drop zone and the file
  // picker: a .txt should fail here with actionable copy, not minutes later
  // in ffprobe.
  const intakeFiles = (files: readonly File[]) => {
    if (files.length === 0) {
      return;
    }
    const picked = selectDroppedIntake(
      files.map((file) => ({ name: file.name, size: file.size }))
    );
    if ("error" in picked) {
      toastProjectCreateFailed(picked.error);
      return;
    }
    if (picked.kind === "single") {
      const match = files.find((file) => file.name === picked.file.name);
      submitVideo(match);
      return;
    }
    const matched = files.filter((file) =>
      picked.files.some((entry) => entry.name === file.name)
    );
    submitFolder([...matched]);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    intakeFiles(Array.from(e.dataTransfer.files));
  };

  const folderDone = step === "video";
  const showFolderStep = !workspace?.configured && step === "folder";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="gap-5 sm:max-w-md"
        showCloseButton={!pickingFolder}
      >
        <DialogHeader className="text-left">
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            {showFolderStep
              ? "Pick where OpenKlip stores your projects on disk."
              : "Add a talking-head or screen recording to transcribe and edit."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <StepPill
            active={Boolean(showFolderStep)}
            done={folderDone}
            label="Choose folder"
            step={1}
          />
          <StepPill
            active={!showFolderStep}
            done={false}
            label="Add video"
            step={2}
          />
        </div>

        {loadingWorkspace && !workspace ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : showFolderStep ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border border-dashed bg-muted/40 p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FolderOpen className={APP_ICON_CLASS} />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-sm">Workspace folder</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Projects, transcripts, and exports live here as plain
                    folders you can back up or sync.
                  </p>
                  {workspace?.displayRoot ? (
                    <p className="truncate font-mono text-muted-foreground text-xs">
                      {workspace.displayRoot}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-start">
              {workspace?.pickerSupported ? (
                <Button
                  disabled={pickingFolder || settingPath}
                  onClick={() => void onChooseFolder()}
                  type="button"
                >
                  <FolderOpen data-icon="inline-start" />
                  {pickingFolder ? "Choosing…" : "Choose folder…"}
                </Button>
              ) : (
                <>
                  <Input
                    className="font-mono text-xs"
                    disabled={settingPath}
                    onChange={(e) => setPathDraft(e.target.value)}
                    placeholder="/Users/you/Movies/OpenKlip"
                    value={pathDraft}
                  />
                  <Button
                    disabled={settingPath || pathDraft.trim().length === 0}
                    onClick={() => void onSetWorkspacePath()}
                    type="button"
                  >
                    {settingPath ? "Saving…" : "Use this folder"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {workspace?.displayRoot ? (
              <p className="truncate font-mono text-muted-foreground text-xs">
                {workspace.displayRoot}
              </p>
            ) : null}
            <div
              className={cn(
                "rounded-lg border border-dashed p-8 text-center transition-colors",
                dragging
                  ? "border-primary bg-primary/10"
                  : "border-border bg-muted/40"
              )}
              data-drop-target="new-project-dialog"
              onDragEnter={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragging(false);
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
            >
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                <Film className={APP_ICON_CLASS} />
              </div>
              <p className="font-medium text-sm">Drop a video or folder here</p>
              <p className="mt-1 text-muted-foreground text-xs">
                {SUPPORTED_VIDEO_LABEL}. Multi-file drops import the largest
                video and register the rest in assets/.
              </p>
              <Button
                className="mt-4"
                onClick={() => inputRef.current?.click()}
                type="button"
                variant="default"
              >
                <Upload data-icon="inline-start" />
                Choose video…
              </Button>
              {onFolderSelected ? (
                <Button
                  className="mt-2"
                  onClick={() => folderInputRef.current?.click()}
                  type="button"
                  variant="outline"
                >
                  <FolderOpen data-icon="inline-start" />
                  Import folder…
                </Button>
              ) : null}
              {onBlankSelected ? (
                <Button
                  className="mt-2"
                  onClick={() => {
                    onOpenChange(false);
                    void onBlankSelected();
                  }}
                  type="button"
                  variant="outline"
                >
                  <LayoutTemplate data-icon="inline-start" />
                  Blank canvas…
                </Button>
              ) : null}
            </div>
            {onUrlSelected ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-left">
                <p className="font-medium text-sm">Import from URL</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Download with yt-dlp (must be on PATH; not bundled).
                </p>
                <div className="flex gap-2">
                  <Input
                    aria-label="Video URL"
                    onChange={(e) => setUrlDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitUrl();
                      }
                    }}
                    placeholder="https://…"
                    value={urlDraft}
                  />
                  <Button
                    disabled={!urlDraft.trim()}
                    onClick={submitUrl}
                    type="button"
                    variant="secondary"
                  >
                    <Link2 data-icon="inline-start" />
                    Import
                  </Button>
                </div>
              </div>
            ) : null}
            {workspace?.pickerSupported || workspace?.configured ? null : (
              <p className="text-muted-foreground text-xs leading-relaxed">
                Set <code>OPENKLIP_PROJECTS_ROOT</code> to choose a custom
                projects directory on this platform.
              </p>
            )}
          </div>
        )}

        <input
          accept={SUPPORTED_VIDEO_ACCEPT}
          className="hidden"
          data-project-upload-input=""
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            intakeFiles(files);
          }}
          ref={inputRef}
          type="file"
        />
        <input
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            intakeFiles(files);
          }}
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: "", directory: "" } as Record<
            string,
            string
          >)}
        />
      </DialogContent>
    </Dialog>
  );
}

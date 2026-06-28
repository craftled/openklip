"use client";

import { Check, Film, FolderOpen, Upload } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";
import {
  applyToasts,
  toastError,
  toastWorkspacePickFailed,
} from "@/lib/app-toast";
import { workspacePickerToasts } from "@/lib/toast-notifications";
import { cn } from "@/lib/utils";
import {
  fetchWorkspace,
  pickWorkspaceFolder,
  type WorkspaceInfo,
} from "@/lib/workspace-client";

export type NewProjectStep = "folder" | "video";

function initialStep(workspace: WorkspaceInfo | null): NewProjectStep {
  if (!workspace) {
    return "folder";
  }
  if (workspace.configured || !workspace.pickerSupported) {
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
          : "border-transparent text-tertiary"
      )}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full font-medium",
          done
            ? "bg-success/15 text-success"
            : active
              ? "bg-foreground text-background"
              : "bg-foreground/10"
        )}
      >
        {done ? <Check className="size-3" /> : step}
      </span>
      {label}
    </div>
  );
}

export function NewProjectDialog({
  onFolderChosen,
  onOpenChange,
  onVideoSelected,
  open,
}: {
  onFolderChosen?: () => void;
  onOpenChange: (open: boolean) => void;
  onVideoSelected: (file: File) => void | Promise<void>;
  open: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [dragging, setDragging] = useState(false);
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

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    submitVideo(e.dataTransfer.files[0]);
  };

  const folderDone = step === "video";
  const showFolderStep =
    workspace?.pickerSupported && !workspace.configured && step === "folder";

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
          {workspace?.pickerSupported ? (
            <StepPill
              active={Boolean(showFolderStep)}
              done={folderDone}
              label="Choose folder"
              step={1}
            />
          ) : null}
          <StepPill
            active={!showFolderStep}
            done={false}
            label="Add video"
            step={workspace?.pickerSupported ? 2 : 1}
          />
        </div>

        {loadingWorkspace && !workspace ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-6 text-tertiary" />
          </div>
        ) : showFolderStep ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border border-dashed bg-foreground-2 p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground-5">
                  <FolderOpen className="size-5 text-tertiary" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-sm">Workspace folder</p>
                  <p className="text-tertiary text-xs leading-relaxed">
                    Projects, transcripts, and exports live here as plain
                    folders you can back up or sync.
                  </p>
                  {workspace?.displayRoot ? (
                    <p className="truncate text-code text-tertiary">
                      {workspace.displayRoot}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            <DialogFooter className="sm:justify-start">
              <Button
                disabled={pickingFolder || !workspace?.pickerSupported}
                onClick={() => void onChooseFolder()}
                type="button"
              >
                <FolderOpen className="size-4" />
                {pickingFolder ? "Choosing…" : "Choose folder…"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {workspace?.displayRoot ? (
              <p className="truncate text-code text-tertiary">
                {workspace.displayRoot}
              </p>
            ) : null}
            <div
              className={cn(
                "rounded-lg border border-dashed p-8 text-center transition-colors",
                dragging
                  ? "border-success bg-success/10"
                  : "border-border bg-foreground-2"
              )}
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
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-foreground-5">
                <Film className="size-6 text-tertiary" />
              </div>
              <p className="font-medium text-sm">Drop a video here</p>
              <p className="mt-1 text-tertiary text-xs">
                MP4, MOV, or WebM. OpenKlip transcribes speech and builds your
                edit.
              </p>
              <Button
                className="mt-4"
                onClick={() => inputRef.current?.click()}
                type="button"
                variant="default"
              >
                <Upload className="size-4" />
                Choose video…
              </Button>
            </div>
            {workspace?.pickerSupported || workspace?.configured ? null : (
              <p className="text-tertiary text-xs leading-relaxed">
                Set <code>OPENKLIP_PROJECTS_ROOT</code> to choose a custom
                projects directory on this platform.
              </p>
            )}
          </div>
        )}

        <input
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            submitVideo(e.target.files?.[0]);
            e.target.value = "";
          }}
          ref={inputRef}
          type="file"
        />
      </DialogContent>
    </Dialog>
  );
}

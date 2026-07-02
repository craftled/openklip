"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Confirmation for the 409 project-exists case. Replacing re-runs ingest with
// force, which wipes the existing project dir, so this must stay an explicit
// user decision (never auto-retried).
export function ProjectOverwriteDialog({
  fileName,
  onCancel,
  onConfirm,
  open,
}: {
  fileName: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
}) {
  return (
    <AlertDialog
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
      open={open}
    >
      <AlertDialogContent data-project-overwrite-dialog="">
        <AlertDialogHeader>
          <AlertDialogTitle>Replace existing project?</AlertDialogTitle>
          <AlertDialogDescription>
            A project for {fileName} already exists. Replacing it re-ingests the
            video and wipes the current edit, transcript, and exports.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep existing</AlertDialogCancel>
          <AlertDialogAction
            data-project-overwrite-confirm=""
            onClick={onConfirm}
            variant="destructive"
          >
            Replace project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

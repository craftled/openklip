"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function briefStatus(
  current: string,
  initial: string,
  saving: boolean
): "unchanged" | "dirty" | "saving" {
  if (saving) {
    return "saving";
  }
  if (current === initial) {
    return "unchanged";
  }
  return "dirty";
}

export function BriefEditor({
  slug: _slug,
  initialBrief,
  onSave,
}: {
  slug: string;
  initialBrief: string;
  onSave: (text: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [text, setText] = useState(initialBrief);
  const [savedBaseline, setSavedBaseline] = useState(initialBrief);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<"saved" | "error" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const status = briefStatus(text, savedBaseline, saving);
  const saveDisabled = status === "unchanged" || status === "saving";

  const handleSave = useCallback(async () => {
    setSaving(true);
    setNote(null);
    setErrorMessage(undefined);
    try {
      const result = await onSave(text);
      if (result.ok) {
        setSavedBaseline(text);
        setNote("saved");
      } else {
        setNote("error");
        setErrorMessage(result.error ?? "Could not save brief.");
      }
    } catch {
      setNote("error");
      setErrorMessage("Could not save brief.");
    } finally {
      setSaving(false);
    }
  }, [onSave, text]);

  return (
    <div className="flex flex-col gap-1.5" data-brief-editor>
      <Textarea
        className="min-h-20! rounded-md! px-2! py-1.5! text-[0.8rem]!"
        onChange={(event) => {
          setText(event.target.value);
          setNote(null);
        }}
        placeholder="Audience, goal, tone, must-use assets, avoid list, target length, export formats…"
        value={text}
      />
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-muted-foreground text-xs tabular-nums">
          {text.length} characters
        </span>
        <div className="flex items-center gap-1.5">
          {note === "saved" ? (
            <span className="text-muted-foreground text-xs">Saved</span>
          ) : null}
          {note === "error" ? (
            <span className="text-destructive text-xs">
              {errorMessage ?? "Save failed"}
            </span>
          ) : null}
          <Button
            data-brief-save
            disabled={saveDisabled}
            onClick={() => void handleSave()}
            size="sm"
            type="button"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

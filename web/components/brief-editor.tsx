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
    <div className="flex flex-col gap-2" data-brief-editor>
      <Textarea
        onChange={(event) => {
          setText(event.target.value);
          setNote(null);
        }}
        placeholder="Audience, goal, tone, must-use assets, avoid list, target length, export formats…"
        value={text}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {text.length} characters
        </span>
        <div className="flex items-center gap-2">
          {note === "saved" ? (
            <span className="text-[11px] text-muted-foreground">Saved</span>
          ) : null}
          {note === "error" ? (
            <span className="text-[11px] text-destructive">
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

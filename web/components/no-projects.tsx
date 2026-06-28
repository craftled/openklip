"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function NoProjectsLanding() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPickVideo = async (file: File) => {
    setCreating(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/projects", { method: "POST", body: fd });
      const data = (await res.json()) as { error?: string; slug?: string };
      if (!(res.ok && data.slug)) {
        throw new Error(data.error ?? `Create project failed (${res.status})`);
      }
      router.push(`/?slug=${encodeURIComponent(data.slug)}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="space-y-1">
        <h1 className="font-semibold text-lg">No projects yet</h1>
        <p className="max-w-sm text-muted-foreground text-sm">
          Choose a source video to create your first project.
        </p>
      </div>
      <Button
        disabled={creating}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <Plus className="size-4" />
        {creating ? "Creating…" : "Create new project"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <input
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void onPickVideo(file);
          }
          e.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
    </main>
  );
}

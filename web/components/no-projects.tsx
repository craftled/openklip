"use client";

import { FolderOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function NoProjectsLanding() {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [workRoot, setWorkRoot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/workspace")
      .then((res) => res.json())
      .then((data: { root?: string }) => {
        if (alive && data.root) {
          setWorkRoot(data.root);
        }
      })
      .catch(() => {
        // Best-effort: the picker still works without the current root.
      });
    return () => {
      alive = false;
    };
  }, []);

  const onChooseFolder = useCallback(async () => {
    setPicking(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pick" }),
      });
      const data = (await res.json()) as {
        cancelled?: boolean;
        error?: string;
        projects?: Array<{ slug: string }>;
        root?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Choose folder failed (${res.status})`);
      }
      if (data.cancelled) {
        return;
      }
      if (data.root) {
        setWorkRoot(data.root);
      }
      if ((data.projects?.length ?? 0) > 0) {
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPicking(false);
    }
  }, [router]);

  const subtitle = workRoot
    ? "No projects in this folder yet."
    : "Choose a folder to work in.";

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="space-y-1">
        <h1 className="font-semibold text-lg">No projects yet</h1>
        <p className="max-w-sm text-muted-foreground text-sm">{subtitle}</p>
        {workRoot ? (
          <p className="mx-auto max-w-md truncate font-mono text-muted-foreground text-xs">
            {workRoot}
          </p>
        ) : null}
      </div>
      <Button
        disabled={picking}
        onClick={() => void onChooseFolder()}
        type="button"
      >
        <FolderOpen className="size-4" />
        {picking ? "Choosing…" : "Choose folder"}
      </Button>
      {workRoot ? (
        <p className="max-w-sm text-muted-foreground text-xs leading-relaxed">
          Run <code className="font-mono">openklip ingest &lt;video&gt;</code>{" "}
          to create a project in this folder.
        </p>
      ) : null}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </main>
  );
}

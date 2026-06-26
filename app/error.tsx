"use client";

import { Button } from "@/components/ui/button";

export default function EditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid h-screen place-items-center bg-background px-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="font-heading font-semibold text-foreground text-lg">
          Could not load OpenKlip
        </h1>
        <p className="text-muted-foreground text-sm">{error.message}</p>
        <Button onClick={() => reset()} type="button" variant="outline">
          Try again
        </Button>
      </div>
    </div>
  );
}

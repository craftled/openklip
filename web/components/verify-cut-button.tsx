"use client";

import { useState } from "react";
import { useAgentChat } from "@/components/agent-chat-context";
import { Button } from "@/components/ui/button";
import { toastPromise } from "@/lib/app-toast";
import { Check } from "@/lib/icon";
import { verifyPromiseMessages } from "@/lib/toast-notifications";
import { cn } from "@/lib/utils";
import { verifyProjectCut } from "../../app/agent-actions.ts";

// The verify loop, one click: re-transcribe the rendered cut (output/out.mp4)
// and check it against the EDL. Uses the local Whisper path, so it is not gated
// on an agent being connected. Reports the verdict via a toast.
export function VerifyCutButton() {
  const { activeSlug } = useAgentChat();
  const [verifying, setVerifying] = useState(false);

  const onVerify = async () => {
    if (verifying) {
      return;
    }
    setVerifying(true);
    try {
      const run = (async () => {
        const res = await verifyProjectCut(activeSlug);
        if (!res.ok) {
          throw new Error(res.error);
        }
        return res;
      })();
      void toastPromise(run, verifyPromiseMessages());
      await run;
    } catch {
      // surfaced by the toast above
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Button
      disabled={verifying}
      onClick={() => void onVerify()}
      size="sm"
      title="Re-transcribe the rendered cut and check it against the edit"
      variant="outline"
    >
      <Check
        className={cn("size-3.5", verifying && "animate-pulse text-tertiary")}
      />
      {verifying ? "Verifying cut…" : "Verify cut"}
    </Button>
  );
}

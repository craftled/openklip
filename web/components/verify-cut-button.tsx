"use client";

import { useState } from "react";
import { ActionStatusButton } from "@/components/action-status-button";
import { useAgentChat } from "@/components/agent-chat-context";
import { toastPromise } from "@/lib/app-toast";
import { Check } from "@/lib/icon";
import { verifyPromiseMessages } from "@/lib/toast-notifications";
import { fetchVerifyCut } from "@/lib/verify-client";

// The verify loop, one click: re-transcribe the rendered cut (output/out.mp4)
// and check it against the EDL. Uses the local Whisper path, so it is not gated
// on an agent being connected. Reports the verdict via a toast.
export function VerifyCutButton({ className }: { className?: string }) {
  const { activeSlug } = useAgentChat();
  const [verifying, setVerifying] = useState(false);

  const onVerify = async () => {
    if (verifying) {
      return;
    }
    setVerifying(true);
    try {
      const run = fetchVerifyCut(activeSlug);
      void toastPromise(run, verifyPromiseMessages());
      await run;
    } catch {
      // surfaced by the toast above
    } finally {
      setVerifying(false);
    }
  };

  return (
    <ActionStatusButton
      busy={verifying}
      busyLabel="Verifying cut…"
      className={className}
      disabled={verifying}
      icon={Check}
      label="Verify cut"
      onClick={() => void onVerify()}
      size="sm"
      title="Re-transcribe the rendered cut and check it against the edit"
      variant="outline"
    />
  );
}

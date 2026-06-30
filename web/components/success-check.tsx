"use client";

import { useEffect, useState } from "react";
import { Check } from "@/lib/icon";
import { cn } from "@/lib/utils";
import {
  type SuccessCheckState,
  successCheckActiveState,
  successCheckInitialState,
} from "../../src/successCheck.ts";

export function SuccessCheck({
  className,
  size = 48,
}: {
  className?: string;
  size?: number;
}) {
  const [state, setState] = useState<SuccessCheckState>(
    successCheckInitialState()
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setState(successCheckActiveState()));
    });
  }, []);

  return (
    <span
      aria-hidden="true"
      className={cn("t-success-check", className)}
      data-state={state}
    >
      <Check aria-hidden="true" height={size} width={size} />
    </span>
  );
}

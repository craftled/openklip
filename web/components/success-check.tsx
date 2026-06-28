"use client";

import { useEffect, useState } from "react";
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
      <svg
        aria-hidden="true"
        fill="none"
        height={size}
        viewBox="0 0 48 48"
        width={size}
      >
        <path
          d="M14 26 L22 34 L36 16"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </svg>
    </span>
  );
}

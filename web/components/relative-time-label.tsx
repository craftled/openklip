"use client";

import { useRelativeTime } from "@/hooks/use-relative-time";

export function RelativeTimeLabel({
  format,
  ms,
}: {
  format: (ms: number) => string;
  ms: number;
}) {
  const label = useRelativeTime(ms, format);
  return <span suppressHydrationWarning>{label}</span>;
}

"use client";

export function PreviewTransitionNotice({
  message,
}: {
  message: string | null;
}) {
  if (!message) {
    return null;
  }
  return (
    <div
      className="pointer-events-none absolute top-2 left-2 z-40 max-w-[min(18rem,calc(100%-1rem))] rounded-md border border-amber-500/40 bg-background/90 px-2 py-1 text-[11px] text-amber-800 leading-snug shadow-sm dark:text-amber-300"
      data-testid="preview-transition-notice"
    >
      {message}
    </div>
  );
}

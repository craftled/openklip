"use client";

import {
  type ActionLogEntry,
  isActionLogEntry,
} from "@engine/action-log-entry";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "@/lib/icon";
import { relativeTimeAgo } from "@/lib/relative-time";

const BADGE_BASE =
  "inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide";

const ACTOR_BADGES: Record<string, string> = {
  human: "bg-primary/10 text-primary",
  agent: "bg-accent text-accent-foreground",
  cli: "bg-secondary text-secondary-foreground",
  mcp: "bg-muted text-muted-foreground",
};

/** Badge classes for an actor; unknown actors fall back to the muted style. */
export function actorBadgeClass(actor: string): string {
  return `${BADGE_BASE} ${ACTOR_BADGES[actor] ?? "bg-muted text-muted-foreground"}`;
}

/** "rev 0 → 1" label for one entry. */
export function revisionSpanLabel(
  entry: Pick<ActionLogEntry, "revisionAfter" | "revisionBefore">
): string {
  return `rev ${entry.revisionBefore} → ${entry.revisionAfter}`;
}

/** Keep only well-formed rows from an untrusted API payload. */
export function parseHistoryEntries(value: unknown): ActionLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isActionLogEntry);
}

function HistoryRow({ entry, now }: { entry: ActionLogEntry; now?: number }) {
  return (
    <li className="flex flex-col gap-0.5 border-border/60 border-b pb-2 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-medium text-foreground text-xs">
          {entry.action}
        </span>
        <span className={actorBadgeClass(entry.actor)}>{entry.actor}</span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{revisionSpanLabel(entry)}</span>
        <span className="ml-auto shrink-0">
          {relativeTimeAgo(entry.at, now)}
        </span>
      </div>
      {entry.input ? (
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          in: {entry.input}
        </div>
      ) : null}
      {entry.result ? (
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          out: {entry.result}
        </div>
      ) : null}
    </li>
  );
}

/** Presentational list, newest entry first (the API already sorts). */
export function HistoryList({
  entries,
  now,
}: {
  entries: ActionLogEntry[];
  now?: number;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No actions yet. Edits from the GUI, CLI, and agents will appear here.
      </p>
    );
  }
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {entries.map((entry) => (
        <HistoryRow
          entry={entry}
          key={`${entry.at}-${entry.revisionAfter}-${entry.action}`}
          now={now}
        />
      ))}
    </ul>
  );
}

// Config-panel section body: loads the project's action history on mount and
// re-fetches on demand via the refresh button.
export function HistoryPanel({ slug }: { slug: string }) {
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(slug)}/history`
      );
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as { entries?: unknown };
      setEntries(parseHistoryEntries(data.entries));
    } catch {
      // Network hiccup: keep the last list rather than erroring the panel.
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {entries.length} action{entries.length === 1 ? "" : "s"}
        </span>
        <Button
          aria-label="Refresh history"
          className="size-6 text-muted-foreground"
          disabled={loading}
          onClick={() => void refresh()}
          size="icon-sm"
          title="Refresh history"
          variant="ghost"
        >
          <RotateCcw />
        </Button>
      </div>
      <HistoryList entries={entries} />
    </div>
  );
}

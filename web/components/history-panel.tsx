"use client";

import {
  type ActionLogEntry,
  isActionLogEntry,
} from "@engine/action-log-entry";
import type { Project } from "@engine/edl";
import type { RevertTarget } from "@engine/revert";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastRevertFailed, toastRevertSucceeded } from "@/lib/app-toast";
import { RotateCcw } from "@/lib/icon";
import { relativeTimeAgo } from "@/lib/relative-time";
import { revertProjectAction } from "../../app/actions.ts";

const BADGE_BASE =
  "inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide";

const ACTOR_BADGES: Record<string, string> = {
  human: "bg-primary/10 text-primary",
  agent: "bg-accent text-accent-foreground",
  cli: "bg-secondary text-secondary-foreground",
  mcp: "bg-muted text-muted-foreground",
  // Background maintenance with no human/agent behind it (see Actor's doc
  // comment in src/action-log-entry.ts): a dimmer, borderless tone so it
  // doesn't compete with the four actor-driven badges above.
  system: "bg-border/40 text-muted-foreground",
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

/** Keep only numbers from the history route's untrusted snapshotRevisions payload. */
export function parseSnapshotRevisions(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is number => typeof v === "number");
}

/** Positive snapshot cap from the history route, or undefined when absent. */
export function parseMaxHistorySnapshots(value: unknown): number | undefined {
  return typeof value === "number" && value > 0 ? value : undefined;
}

// ── Filter UI: actor / action / task, client-side over the already-fetched
// entries (the history route caps its response at HISTORY_PAGE_LIMIT, a
// small bounded dataset, so filtering it in the browser needs no new route
// query params or extra round-trip) ────────────────────────────────────────

/** One filter criterion per dimension; an empty string or undefined means
 * "no restriction" on that dimension. Mirrors the CLI's `openklip history
 * --task/--action/--actor` and the `history_list` MCP tool's {task, action,
 * actor}: all active criteria combine with AND, never OR. */
export interface HistoryFilter {
  action?: string;
  actor?: string;
  task?: string;
}

/** Entries matching every active criterion in `filter`. An empty/undefined
 * filter value (on any dimension) leaves that dimension unrestricted; with
 * no active criteria at all, every entry passes through unchanged. */
export function filterHistoryEntries(
  entries: ActionLogEntry[],
  filter: HistoryFilter
): ActionLogEntry[] {
  return entries.filter((entry) => {
    if (filter.actor && entry.actor !== filter.actor) {
      return false;
    }
    if (filter.action && entry.action !== filter.action) {
      return false;
    }
    if (filter.task && entry.taskId !== filter.task) {
      return false;
    }
    return true;
  });
}

/** True when at least one filter dimension (actor/action/task) is active. */
export function hasActiveHistoryFilter(filter: HistoryFilter): boolean {
  return Boolean(filter.actor || filter.action || filter.task);
}

/** Distinct actors actually present in the loaded entries, sorted. Options
 * are sourced from the data itself rather than the full Actor union: an
 * option that always yields zero results (an actor with no entries in the
 * current view) would be confusing, not helpful. */
export function distinctActors(entries: ActionLogEntry[]): string[] {
  return Array.from(new Set(entries.map((e) => e.actor))).sort();
}

/** Distinct action names actually present in the loaded entries, sorted. */
export function distinctActions(entries: ActionLogEntry[]): string[] {
  return Array.from(new Set(entries.map((e) => e.action))).sort();
}

/** Distinct task ids actually present in the loaded entries, sorted. Entries
 * with no taskId (most GUI/CLI edits) are excluded, not represented as an
 * empty-string option. */
export function distinctTaskIds(entries: ActionLogEntry[]): string[] {
  return Array.from(
    new Set(
      entries
        .map((e) => e.taskId)
        .filter((id): id is string => id !== undefined)
    )
  ).sort();
}

const FILTER_LABEL_CLASS =
  "flex items-center gap-1 text-[11px] text-muted-foreground";

function FilterSelect({
  ariaLabel,
  label,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <Field className={FILTER_LABEL_CLASS} orientation="horizontal">
      <FieldLabel className="text-[11px]">{label}</FieldLabel>
      <Select
        onValueChange={(next) => onChange(next === "all" ? "" : (next ?? ""))}
        value={value || "all"}
      >
        <SelectTrigger
          aria-label={ariaLabel}
          className="h-6 max-w-32 rounded-sm px-1 text-[11px]"
          size="sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">All</SelectItem>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

/** Presentational actor/action/task filter row, controlled by the caller
 * (HistoryPanel). Kept separate from HistoryPanel's fetch/state wiring so it
 * can be rendered and asserted on directly, the same split this file already
 * uses for HistoryList vs HistoryPanel. */
export function HistoryFilterControls({
  actionOptions,
  actorOptions,
  onChange,
  taskOptions,
  value,
}: {
  actionOptions: string[];
  actorOptions: string[];
  onChange: (next: HistoryFilter) => void;
  taskOptions: string[];
  value: HistoryFilter;
}) {
  const hasActiveFilter = hasActiveHistoryFilter(value);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FilterSelect
        ariaLabel="Filter by actor"
        label="Actor"
        onChange={(actor) => onChange({ ...value, actor })}
        options={actorOptions}
        value={value.actor ?? ""}
      />
      <FilterSelect
        ariaLabel="Filter by action"
        label="Action"
        onChange={(action) => onChange({ ...value, action })}
        options={actionOptions}
        value={value.action ?? ""}
      />
      <FilterSelect
        ariaLabel="Filter by task"
        label="Task"
        onChange={(task) => onChange({ ...value, task })}
        options={taskOptions}
        value={value.task ?? ""}
      />
      {hasActiveFilter ? (
        <Button
          className="h-6 rounded-sm px-2 text-[11px] text-muted-foreground"
          onClick={() => onChange({ action: "", actor: "", task: "" })}
          size="sm"
          type="button"
          variant="ghost"
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

/** Confirm-state key for the header "Undo last edit" affordance. */
export const LAST_REVERT_KEY = "last-revert";

/** Stable identity for one log entry (no id field on ActionLogEntry itself). */
export function historyEntryKey(
  entry: Pick<ActionLogEntry, "action" | "at" | "revisionAfter">
): string {
  return `${entry.at}-${entry.revisionAfter}-${entry.action}`;
}

function bumpsRevision(
  entry: Pick<ActionLogEntry, "revisionAfter" | "revisionBefore">
): boolean {
  return entry.revisionAfter > entry.revisionBefore;
}

/** True when the entry moved the EDL (skips brief-set) AND its pre-mutation
 * state has a working/history/ snapshot on disk, matching src/revert.ts's
 * own snapshot-existence check. */
export function canRevertEntry(
  entry: Pick<ActionLogEntry, "revisionAfter" | "revisionBefore">,
  snapshotRevisions: readonly number[]
): boolean {
  return (
    bumpsRevision(entry) && snapshotRevisions.includes(entry.revisionBefore)
  );
}

export interface HistoryGroup {
  entries: ActionLogEntry[];
  taskId?: string;
}

/** Group consecutive entries (newest-first, as the API returns them) that
 * share a taskId, mirroring the CLI's `revert --task` and the "revert" MCP
 * tool's {task} target: one group == one task's worth of history, offered a
 * single "Revert task" affordance instead of only per-entry ones. Entries
 * with no taskId, or whose taskId differs from their neighbor, get their own
 * singleton group. */
export function groupHistoryEntries(entries: ActionLogEntry[]): HistoryGroup[] {
  const groups: HistoryGroup[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (last && entry.taskId !== undefined && last.taskId === entry.taskId) {
      last.entries.push(entry);
    } else {
      groups.push({ taskId: entry.taskId, entries: [entry] });
    }
  }
  return groups;
}

/** True when a "Revert task" affordance makes sense for this group: more
 * than one entry under the same task, and the earliest entry (the one
 * revertProject's {task} target actually restores to) has a snapshot. */
export function canRevertGroup(
  group: HistoryGroup,
  snapshotRevisions: readonly number[]
): boolean {
  if (group.taskId === undefined || group.entries.length < 2) {
    return false;
  }
  const earliest = group.entries.at(-1);
  return earliest !== undefined && canRevertEntry(earliest, snapshotRevisions);
}

// ── G2: an "assemble" (multi-take) entry is a boundary revert shouldn't
// silently cross ────────────────────────────────────────────────────────

/** Index of the newest "assemble" entry in a newest-first entries array, or
 * -1 if there is none. src/revert.ts's server-side task guard already
 * refuses a revert whose snapshot source differs from the current project's
 * source; this is the GUI half, using data already in the panel (entries
 * carry their action name) so the affordance itself doesn't look routine. */
export function newestAssembleIndex(entries: ActionLogEntry[]): number {
  return entries.findIndex((e) => e.action === "assemble");
}

/** True when reverting to just before `entry` would cross the newest
 * assemble boundary: the assemble entry itself, and everything older than
 * it, restore state from before a multi-take assembly, discarding the take
 * selection it made. Entries newer than the boundary are unaffected. Relies
 * on reference identity (indexOf): callers must pass the SAME entries array
 * (or entry objects) the panel is rendering, never a copy. */
export function crossesAssembleBoundary(
  entries: ActionLogEntry[],
  entry: ActionLogEntry
): boolean {
  const boundaryIndex = newestAssembleIndex(entries);
  if (boundaryIndex === -1) {
    return false;
  }
  const entryIndex = entries.indexOf(entry);
  return entryIndex !== -1 && entryIndex >= boundaryIndex;
}

// ── G3: task-group revert only restores project.json, not brief.md ────────

/** True when a task group's history includes a brief-set entry: revert
 * restores project.json only (src/revert.ts), so a "Revert task" that spans
 * a brief-set entry silently leaves that brief.md change in place. Used to
 * caveat the group's confirm copy rather than pretend the revert is total. */
export function groupHasBriefSet(group: HistoryGroup): boolean {
  return group.entries.some((e) => e.action === "brief-set");
}

// ── G4: canRevertGroup only sees the (possibly truncated) 200-entry view
// the history route returns ─────────────────────────────────────────────

/** Mirrors HISTORY_LIMIT in app/api/projects/[slug]/history/route.ts. Kept
 * as a literal, not an import: that file is a server route module and this
 * is a client component, so the two can't share a runtime value without
 * crossing the client-bundle boundary; a route.ts test asserts the route's
 * own constant separately. */
export const HISTORY_PAGE_LIMIT = 200;

// ── G5: the truncation warning must read the RAW fetched count, never a
// client-side filtered/displayed count. A filter (filterHistoryEntries) can
// only narrow what's shown from what was already fetched; it can never
// prove there ISN'T more matching history further back that was never
// fetched at all, so the warning must stay honestly non-committal about
// that and must never depend on which filter (if any) happens to be
// active. ───────────────────────────────────────────────────────────────

/** True when the raw fetch hit HISTORY_PAGE_LIMIT: older history may exist
 * beyond what was fetched. Deliberately takes only the raw fetched count,
 * never a filtered/displayed count. Callers must always pass
 * `rawEntries.length` from the true fetch (see groupTouchesTruncationBoundary
 * below), never `filterHistoryEntries`'s output length. */
export function shouldShowTruncationWarning(
  rawFetchedCount: number,
  limit: number = HISTORY_PAGE_LIMIT
): boolean {
  return rawFetchedCount >= limit;
}

/** True when a task group's revertibility can't be trusted: canRevertGroup
 * only ever sees the entries the history route actually returned, capped at
 * HISTORY_PAGE_LIMIT. If the RAW fetch hit exactly that many entries AND the
 * group reaches the OLDEST visible one, the task may have earlier entries
 * beyond the window that got silently cut off, entries the server's
 * full-log resolveRevertTarget would still fold in. Below the limit, the
 * view is known-complete and this never fires.
 *
 * `rawEntries` must be the RAW fetched array (before any client-side
 * actor/action/task filter), never the filtered/displayed one: a filter can
 * only narrow what's shown, so checking its length against `limit` would
 * almost never trip once a filter is active, hiding a warning that is still
 * true. */
export function groupTouchesTruncationBoundary(
  group: HistoryGroup,
  rawEntries: ActionLogEntry[],
  limit: number = HISTORY_PAGE_LIMIT
): boolean {
  if (!shouldShowTruncationWarning(rawEntries.length, limit)) {
    return false;
  }
  const oldestVisible = rawEntries.at(-1);
  const oldestInGroup = group.entries.at(-1);
  return (
    oldestInGroup !== undefined &&
    oldestVisible !== undefined &&
    oldestInGroup === oldestVisible
  );
}

/** Disabled-affordance copy for a task-group revert that touches the
 * truncation boundary. Both variants stay honestly non-committal about
 * whether more (possibly matching) history exists beyond the fetched page;
 * the filter-active variant just names the reason a narrow-looking view
 * doesn't mean the underlying history is short. */
function getTruncationDisabledLabel(filterActive: boolean | undefined): string {
  return filterActive
    ? "History truncated; older entries (possibly matching your filter) aren't shown, so this task's full extent can't be confirmed"
    : "History truncated; can't confirm this task's full extent";
}

// resolveRevertTarget's task guard (src/revert.ts) throws a message ending
// "...; pass force to revert anyway" when a later, unrelated edit would also
// be discarded. Match that exact phrase so unrelated errors that happen to
// mention "force" do not escalate to a second confirm.
const REVERT_FORCE_PHRASE = "pass force to revert anyway";

export function revertErrorNeedsForce(message: string): boolean {
  return message.includes(REVERT_FORCE_PHRASE);
}

/** Newest revision-bumping entry that still has a snapshot, or undefined. */
export function newestRevertibleEntry(
  entries: ActionLogEntry[],
  snapshotRevisions: readonly number[]
): ActionLogEntry | undefined {
  return entries.find((entry) => canRevertEntry(entry, snapshotRevisions));
}

/** True when the GUI can offer "Undo last edit" ({ last: true }), matching
 * resolveRevertTarget's {last:true} plus the same assemble-boundary guard as
 * per-entry revert. */
export function canRevertLast(
  entries: ActionLogEntry[],
  snapshotRevisions: readonly number[]
): boolean {
  const entry = newestRevertibleEntry(entries, snapshotRevisions);
  if (!entry) {
    return false;
  }
  return !crossesAssembleBoundary(entries, entry);
}

interface RevertControls {
  confirmingKey?: string | null;
  // The (possibly filtered/displayed) entries list the panel is rendering,
  // threaded through so per-row assemble-boundary checks
  // (crossesAssembleBoundary) see the same window the user does.
  entries?: ActionLogEntry[];
  // G5: true when a client-side actor/action/task filter is currently
  // active, so the truncation hint's wording can call that out instead of
  // silently reusing the plain no-filter phrasing.
  filterActive?: boolean;
  forceConfirmKey?: string | null;
  onCancel?: () => void;
  onConfirmForce?: (key: string) => void;
  onConfirmRevert?: (key: string) => void;
  onRequestGroupRevert?: (group: HistoryGroup, key: string) => void;
  onRequestRevert?: (entry: ActionLogEntry, key: string) => void;
  // G5: the RAW fetched entries (before any client-side filter), used only
  // by groupTouchesTruncationBoundary. Deliberately separate from `entries`
  // above: a filter narrows `entries` for display, but truncation must
  // always be judged against the true fetch, never the filtered view.
  rawEntries?: ActionLogEntry[];
  revertingKey?: string | null;
  snapshotRevisions?: number[];
}

function RevertButton({
  caveat,
  confirming,
  disabled,
  disabledLabel,
  forceConfirming,
  label,
  onArm,
  onCancel,
  onConfirm,
  onConfirmForce,
  reverting,
}: {
  // G3: extra confirm-copy caveat for a task revert whose group includes a
  // brief-set entry ("brief changes are not restored"). Only ever passed
  // for the group-level RevertButton; entry-level revert never has one.
  caveat?: string;
  confirming: boolean;
  disabled: boolean;
  disabledLabel: string;
  forceConfirming: boolean;
  label: string;
  onArm?: () => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  onConfirmForce?: () => void;
  reverting: boolean;
}) {
  if (forceConfirming) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px]">
        <span className="text-muted-foreground">
          Also discards later changes.
        </span>
        <Button
          className="h-5 rounded-sm px-1.5 text-[11px] text-destructive hover:bg-destructive/10"
          disabled={reverting}
          onClick={onConfirmForce}
          size="sm"
          type="button"
          variant="ghost"
        >
          Revert anyway
        </Button>
        <Button
          className="h-5 rounded-sm px-1.5 text-[11px] text-muted-foreground"
          disabled={reverting}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      </span>
    );
  }
  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px]">
        <span className="text-muted-foreground">
          {label}?{caveat ? ` ${caveat}` : ""}
        </span>
        <Button
          className="h-5 rounded-sm px-1.5 text-[11px] text-destructive hover:bg-destructive/10"
          disabled={reverting}
          onClick={onConfirm}
          size="sm"
          type="button"
          variant="ghost"
        >
          Confirm
        </Button>
        <Button
          className="h-5 rounded-sm px-1.5 text-[11px] text-muted-foreground"
          disabled={reverting}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      </span>
    );
  }
  return (
    <Button
      aria-label={disabled ? disabledLabel : label}
      className="size-5 shrink-0 rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
      disabled={disabled || reverting}
      onClick={onArm}
      size="icon-sm"
      title={disabled ? disabledLabel : label}
      type="button"
      variant="ghost"
    >
      <RotateCcw className="size-3" />
    </Button>
  );
}

function HistoryRow({
  controls,
  entry,
  now,
}: {
  controls?: RevertControls;
  entry: ActionLogEntry;
  now?: number;
}) {
  const key = historyEntryKey(entry);
  const snapshotRevisions = controls?.snapshotRevisions;
  const blockedByAssemble = controls?.entries
    ? crossesAssembleBoundary(controls.entries, entry)
    : false;
  return (
    <li className="flex flex-col gap-0.5 border-border/60 border-b pb-2 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-medium text-foreground text-xs">
          {entry.action}
        </span>
        <span className={actorBadgeClass(entry.actor)}>{entry.actor}</span>
        {snapshotRevisions ? (
          <RevertButton
            confirming={controls?.confirmingKey === key}
            disabled={
              blockedByAssemble || !canRevertEntry(entry, snapshotRevisions)
            }
            disabledLabel={
              blockedByAssemble
                ? "Crosses a multi-take assembly"
                : "No snapshot to revert to"
            }
            forceConfirming={controls?.forceConfirmKey === key}
            label="Revert to before this"
            onArm={() => controls?.onRequestRevert?.(entry, key)}
            onCancel={controls?.onCancel}
            onConfirm={() => controls?.onConfirmRevert?.(key)}
            onConfirmForce={() => controls?.onConfirmForce?.(key)}
            reverting={controls?.revertingKey === key}
          />
        ) : null}
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

function HistoryGroupBlock({
  controls,
  group,
  now,
}: {
  controls?: RevertControls;
  group: HistoryGroup;
  now?: number;
}) {
  const snapshotRevisions = controls?.snapshotRevisions;
  // Keyed off the group's own leading entry, not just taskId: a task
  // interrupted by another actor's edit (see groupHistoryEntries) can
  // produce more than one group sharing the same taskId, and taskId alone
  // would make their confirm/force-confirm state collide.
  const groupKey = group.taskId
    ? `task:${group.taskId}:${historyEntryKey(group.entries[0])}`
    : undefined;
  const showGroupRevert =
    snapshotRevisions !== undefined &&
    groupKey !== undefined &&
    group.entries.length > 1 &&
    group.taskId !== undefined;
  // G4/G5: canRevertGroup only ever sees the (possibly truncated) entries
  // the history route returned; when the RAW fetch is exactly
  // HISTORY_PAGE_LIMIT entries and this group reaches the oldest visible
  // one, an earlier part of the task may have been cut off the window. Must
  // read rawEntries, not controls.entries: the latter can be a client-side
  // filtered/displayed subset whose length rarely equals the page limit,
  // which would wrongly hide this warning once a filter narrows the view.
  const truncated = controls?.rawEntries
    ? groupTouchesTruncationBoundary(group, controls.rawEntries)
    : false;
  const canRevert = canRevertGroup(group, snapshotRevisions ?? []);
  // G3: revert restores project.json only, so a group spanning a brief-set
  // entry leaves that brief.md change in place; the confirm copy must say
  // so instead of implying the revert is total.
  const briefCaveat = groupHasBriefSet(group)
    ? "Brief changes are not restored."
    : undefined;
  return (
    <li className="flex flex-col gap-2">
      {showGroupRevert ? (
        <div className="flex items-center justify-between gap-2 rounded-sm bg-muted/50 px-1.5 py-1">
          <span className="truncate text-[11px] text-muted-foreground">
            task {group.taskId}
          </span>
          <RevertButton
            caveat={briefCaveat}
            confirming={controls?.confirmingKey === groupKey}
            disabled={truncated || !canRevert}
            disabledLabel={
              truncated
                ? getTruncationDisabledLabel(controls?.filterActive)
                : "No snapshot to revert to"
            }
            forceConfirming={controls?.forceConfirmKey === groupKey}
            label="Revert task"
            onArm={() =>
              groupKey && controls?.onRequestGroupRevert?.(group, groupKey)
            }
            onCancel={controls?.onCancel}
            onConfirm={() => groupKey && controls?.onConfirmRevert?.(groupKey)}
            onConfirmForce={() =>
              groupKey && controls?.onConfirmForce?.(groupKey)
            }
            reverting={controls?.revertingKey === groupKey}
          />
        </div>
      ) : null}
      <ul className="flex list-none flex-col gap-2 p-0">
        {group.entries.map((entry) => (
          <HistoryRow
            controls={controls}
            entry={entry}
            key={historyEntryKey(entry)}
            now={now}
          />
        ))}
      </ul>
    </li>
  );
}

/** Presentational list, newest entry first (the API already sorts). Revert
 * affordances only render when the caller opts in with snapshotRevisions
 * (HistoryPanel always does; a plain <HistoryList entries={...} /> stays the
 * read-only view it always was). */
export function HistoryList({
  entries,
  now,
  rawEntries,
  snapshotRevisions,
  unfilteredCount,
  ...controls
}: {
  entries: ActionLogEntry[];
  now?: number;
  // Count of entries before any client-side filter was applied. When given
  // and greater than zero while `entries` (the filtered view) is empty, an
  // active filter matched nothing: distinct from a genuinely empty history,
  // matching the CLI's "no history entries match the filter" vs "no history
  // for X" split (src/cli.ts's `history` command).
  unfilteredCount?: number;
} & RevertControls) {
  if (entries.length === 0) {
    if (unfilteredCount !== undefined && unfilteredCount > 0) {
      return (
        <p className="text-muted-foreground text-xs">
          No history entries match the current filters.
        </p>
      );
    }
    return (
      <p className="text-muted-foreground text-xs">
        No actions yet. Edits from the GUI, CLI, and agents will appear here.
      </p>
    );
  }
  const groups = groupHistoryEntries(entries);
  // G5: default rawEntries to entries when the caller doesn't pass a
  // separate raw fetch (e.g. a bare <HistoryList entries={...} /> with no
  // filter layer above it, as most tests in this file use): displayed IS
  // raw in that case, so the truncation check should read `entries` itself.
  const passedControls: RevertControls | undefined =
    snapshotRevisions === undefined
      ? undefined
      : {
          ...controls,
          entries,
          rawEntries: rawEntries ?? entries,
          snapshotRevisions,
        };
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {groups.map((group) => (
        <HistoryGroupBlock
          controls={passedControls}
          group={group}
          // Always keyed off the group's first (newest) entry, never off
          // taskId alone: a task interrupted by another actor's edit (see
          // groupHistoryEntries) produces more than one group sharing the
          // same taskId, and taskId alone would collide as a React key.
          key={historyEntryKey(group.entries[0])}
          now={now}
        />
      ))}
    </ul>
  );
}

// Config-panel section body: loads the project's action history on mount and
// re-fetches on demand via the refresh button. Also drives revert: a click
// arms a two-step inline confirm (matching web/components/asset-bin.tsx's
// delete pattern) rather than a modal; a rejection whose message asks for
// force (see revertErrorNeedsForce) escalates to a second confirm instead of
// just toasting the failure. onReverted is optional so a bare
// <HistoryPanel slug={slug} /> (as used in tests) still works read-only-ish;
// App (web/app.tsx) always passes one, since it's the only surface holding
// the client-side Project state a GUI revert needs to reseed.
export function HistoryPanel({
  onReverted,
  slug,
}: {
  onReverted?: (project: Project) => void;
  slug: string;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);
  const [snapshotRevisions, setSnapshotRevisions] = useState<number[]>([]);
  const [maxHistorySnapshots, setMaxHistorySnapshots] = useState<
    number | undefined
  >();
  const [loading, setLoading] = useState(false);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [forceConfirmKey, setForceConfirmKey] = useState<string | null>(null);
  const [revertingKey, setRevertingKey] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<RevertTarget | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>({
    action: "",
    actor: "",
    task: "",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(slug)}/history`
      );
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as {
        entries?: unknown;
        maxHistorySnapshots?: unknown;
        snapshotRevisions?: unknown;
      };
      setEntries(parseHistoryEntries(data.entries));
      setSnapshotRevisions(parseSnapshotRevisions(data.snapshotRevisions));
      setMaxHistorySnapshots(
        parseMaxHistorySnapshots(data.maxHistorySnapshots)
      );
    } catch {
      // Network hiccup: keep the last list rather than erroring the panel.
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const cancelRevert = useCallback(() => {
    setConfirmingKey(null);
    setForceConfirmKey(null);
    setPendingTarget(null);
  }, []);

  const runRevert = useCallback(
    async (key: string, target: RevertTarget) => {
      setRevertingKey(key);
      try {
        const result = await revertProjectAction(slug, target);
        if (!result.ok) {
          if (revertErrorNeedsForce(result.error) && "task" in target) {
            // Escalate to a second, explicit confirmation instead of just
            // failing: the caller can retry the same target with force.
            setForceConfirmKey(key);
            setConfirmingKey(null);
            setPendingTarget({ ...target, force: true });
            return;
          }
          toastRevertFailed(result.error);
          cancelRevert();
          return;
        }
        // G1: reseed the open editor's client state BEFORE the toast/refresh,
        // so App's useState<Project> never shows stale (pre-revert)
        // transcript/preview even for a moment; see onReverted's own doc
        // comment on the App side (web/app.tsx) for exactly what gets reseeded.
        onReverted?.(result.data.project);
        toastRevertSucceeded(result.data);
        cancelRevert();
        await refresh();
        router.refresh();
      } finally {
        setRevertingKey(null);
      }
    },
    [cancelRevert, onReverted, refresh, router, slug]
  );

  const onRequestRevert = useCallback((entry: ActionLogEntry, key: string) => {
    setConfirmingKey(key);
    setForceConfirmKey(null);
    setPendingTarget({ to: entry.revisionBefore });
  }, []);

  const onRequestGroupRevert = useCallback(
    (group: HistoryGroup, key: string) => {
      if (!group.taskId) {
        return;
      }
      setConfirmingKey(key);
      setForceConfirmKey(null);
      setPendingTarget({ task: group.taskId });
    },
    []
  );

  const onRequestLastRevert = useCallback(() => {
    setConfirmingKey(LAST_REVERT_KEY);
    setForceConfirmKey(null);
    setPendingTarget({ last: true });
  }, []);

  // Filter options are always derived from the raw fetch (never the already-
  // filtered view): narrowing by one dimension must not make the other
  // dimensions' options disappear out from under the user.
  const actorOptions = useMemo(() => distinctActors(entries), [entries]);
  const actionOptions = useMemo(() => distinctActions(entries), [entries]);
  const taskOptions = useMemo(() => distinctTaskIds(entries), [entries]);
  const filteredEntries = useMemo(
    () => filterHistoryEntries(entries, filter),
    [entries, filter]
  );
  // G5: whether the truncation hint's wording should call out the active
  // filter. The truncation determination itself always reads the raw
  // `entries` (below), never `filteredEntries`.
  const filterActive = hasActiveHistoryFilter(filter);

  // Undo last edit always targets the true (unfiltered) history: a filtered
  // view is a lens on the log, not a different log, so revert eligibility
  // must not depend on which filter happens to be active.
  const undoLastEnabled = canRevertLast(entries, snapshotRevisions);
  const undoLastConfirming = confirmingKey === LAST_REVERT_KEY;
  const undoLastReverting = revertingKey === LAST_REVERT_KEY;

  const onConfirmRevert = useCallback(
    (key: string) => {
      if (pendingTarget) {
        void runRevert(key, pendingTarget);
      }
    },
    [pendingTarget, runRevert]
  );

  const onConfirmForce = useCallback(
    (key: string) => {
      if (pendingTarget) {
        void runRevert(key, pendingTarget);
      }
    },
    [pendingTarget, runRevert]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {filteredEntries.length} action
          {filteredEntries.length === 1 ? "" : "s"}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {undoLastConfirming ? (
            <>
              <span className="text-[11px] text-muted-foreground">
                Undo last edit?
              </span>
              <Button
                className="h-5 rounded-sm px-1.5 text-[11px] text-destructive hover:bg-destructive/10"
                disabled={undoLastReverting}
                onClick={() => onConfirmRevert(LAST_REVERT_KEY)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Confirm
              </Button>
              <Button
                className="h-5 rounded-sm px-1.5 text-[11px] text-muted-foreground"
                disabled={undoLastReverting}
                onClick={cancelRevert}
                size="sm"
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              className="h-6 rounded-sm px-2 text-[11px] text-muted-foreground hover:text-destructive"
              disabled={!undoLastEnabled || undoLastReverting || loading}
              onClick={onRequestLastRevert}
              size="sm"
              title={
                undoLastEnabled
                  ? "Undo the most recent logged edit"
                  : "No snapshot to undo"
              }
              type="button"
              variant="ghost"
            >
              Undo last
            </Button>
          )}
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
        </span>
      </div>
      <HistoryFilterControls
        actionOptions={actionOptions}
        actorOptions={actorOptions}
        onChange={setFilter}
        taskOptions={taskOptions}
        value={filter}
      />
      <HistoryList
        confirmingKey={confirmingKey}
        entries={filteredEntries}
        filterActive={filterActive}
        forceConfirmKey={forceConfirmKey}
        onCancel={cancelRevert}
        onConfirmForce={onConfirmForce}
        onConfirmRevert={onConfirmRevert}
        onRequestGroupRevert={onRequestGroupRevert}
        onRequestRevert={onRequestRevert}
        rawEntries={entries}
        revertingKey={revertingKey}
        snapshotRevisions={snapshotRevisions}
        unfilteredCount={entries.length}
      />
      {entries.length > 0 && maxHistorySnapshots !== undefined ? (
        <p className="text-[11px] text-muted-foreground">
          Revert is available for the newest {maxHistorySnapshots} logged edits.
        </p>
      ) : null}
    </div>
  );
}

import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentThread } from "@engine/chats.ts";
import {
  chatListEmptyLabel,
  filterThreadsByQuery,
  isChatThreadCompleted,
  resolveThreadAfterRemove,
} from "../web/lib/chat-list.ts";

const thread = (id: string, title: string): AgentThread => ({
  id,
  slug: "demo",
  title,
  messages: [],
  updatedAt: 0,
});

test("isChatThreadCompleted is true when an assistant message exists", () => {
  const empty = thread("a", "New");
  const done = {
    ...thread("b", "Done"),
    messages: [
      {
        id: "m1",
        role: "user" as const,
        content: "Cut filler",
        createdAt: 1,
      },
      {
        id: "m2",
        role: "assistant" as const,
        content: "Cut 3 words.",
        createdAt: 2,
      },
    ],
  };
  assert.equal(isChatThreadCompleted(empty), false);
  assert.equal(isChatThreadCompleted(done), true);
});

test("filterThreadsByQuery returns all threads when query is empty", () => {
  const threads = [thread("a", "Alpha"), thread("b", "Beta")];
  assert.deepEqual(filterThreadsByQuery(threads, ""), threads);
  assert.deepEqual(filterThreadsByQuery(threads, "   "), threads);
});

test("filterThreadsByQuery matches titles case-insensitively", () => {
  const threads = [
    thread("a", "Cut filler words"),
    thread("b", "Export the cut"),
  ];
  assert.deepEqual(filterThreadsByQuery(threads, "FILLER"), [
    thread("a", "Cut filler words"),
  ]);
});

test("resolveThreadAfterRemove keeps active id when another thread is removed", () => {
  const threads = [thread("a", "One"), thread("b", "Two")];
  assert.equal(resolveThreadAfterRemove(threads, "b", "a"), "a");
});

test("resolveThreadAfterRemove selects the first remaining thread", () => {
  const threads = [thread("a", "One"), thread("b", "Two")];
  assert.equal(resolveThreadAfterRemove(threads, "a", "a"), "b");
});

test("resolveThreadAfterRemove skips archived threads when selecting fallback", () => {
  const threads = [
    thread("a", "One"),
    { ...thread("b", "Archived"), archived: true },
    thread("c", "Three"),
  ];
  assert.equal(resolveThreadAfterRemove(threads, "a", "a"), "c");
});

test("resolveThreadAfterRemove returns null when the last thread is removed", () => {
  const threads = [thread("a", "One")];
  assert.equal(resolveThreadAfterRemove(threads, "a", "a"), null);
});

test("chatListEmptyLabel shows loading while chats hydrate", () => {
  assert.equal(
    chatListEmptyLabel({
      loading: true,
      totalCount: 0,
      filteredActiveCount: 0,
      filteredArchivedCount: 0,
    }),
    "Loading chats…"
  );
});

test("chatListEmptyLabel hides placeholder when results exist", () => {
  assert.equal(
    chatListEmptyLabel({
      loading: false,
      totalCount: 2,
      filteredActiveCount: 1,
      filteredArchivedCount: 0,
    }),
    null
  );
});

test("chatListEmptyLabel distinguishes empty list from search miss", () => {
  assert.equal(
    chatListEmptyLabel({
      loading: false,
      totalCount: 0,
      filteredActiveCount: 0,
      filteredArchivedCount: 0,
    }),
    "No chats yet. Start one with New chat."
  );
  assert.equal(
    chatListEmptyLabel({
      loading: false,
      totalCount: 3,
      filteredActiveCount: 0,
      filteredArchivedCount: 0,
    }),
    "No chats match your search."
  );
});

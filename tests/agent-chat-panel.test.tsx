import { mock, test } from "bun:test";
import assert from "node:assert/strict";

const threadWithMessages = {
  id: "thread-1",
  messages: [
    {
      content: "Cut the intro",
      createdAt: 1,
      id: "m1",
      role: "user" as const,
    },
    {
      content: "Done, trimmed the first 3 seconds.",
      createdAt: 2,
      id: "m2",
      role: "assistant" as const,
    },
  ],
  slug: "demo",
  title: "Demo chat",
  updatedAt: 2,
};

// Read at call time (not import time) so different tests can point it at a
// different thread without re-mocking the module mid-file.
let currentActiveThread: typeof threadWithMessages | null = null;

mock.module("../web/components/agent-chat-context.tsx", () => ({
  useAgentChat: () => ({
    activeSlug: "demo",
    activeThread: currentActiveThread,
    agent: "claude-sonnet-4-6",
    chatsLoading: false,
    runningThreadId: null,
    sendMessage: async () => undefined,
  }),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { AgentChatPanel } from "../web/components/agent-chat-panel.tsx";

test("AgentChatPanel empty state is honest without demo markers", () => {
  currentActiveThread = null;
  const html = renderToStaticMarkup(
    <AgentChatPanel
      onAssetsUpdated={() => undefined}
      showSidebarTrigger={false}
      slug="demo"
    />
  );
  assert.match(html, /Start a chat/);
  assert.doesNotMatch(html, /Project context ready/);
});

// better-ui principle 13 (minimum hit area): the message-jump trail marker is
// very short (h-2, 8px). It needs vertical hit slop via a pseudo-element, but
// the markers stack vertically with only a 4px gap (gap-1) between them, so a
// large slop would overlap the neighboring marker's hit area. Assert the
// marker gets pseudo-element slop and stays anchored (relative) so the
// pseudo-element positions against the marker itself, not some ancestor.
test("AgentChatPanel message-jump marker gets vertical hit slop via a pseudo-element", () => {
  currentActiveThread = threadWithMessages;
  const html = renderToStaticMarkup(
    <AgentChatPanel
      onAssetsUpdated={() => undefined}
      showSidebarTrigger={false}
      slug="demo"
    />
  );
  const marker = html.match(
    /<button[^>]*data-slot="agent-chat-trail-marker"[^>]*>/
  )?.[0];
  assert.ok(marker, "trail marker renders");
  assert.match(marker as string, /\brelative\b/);
  assert.match(marker as string, /after:absolute/);
  assert.match(marker as string, /after:inset-x-0/);
  assert.match(marker as string, /after:-inset-y-\d/);
  // Visible bar stays h-2 (non-dense: 2 messages).
  assert.match(marker as string, /\bh-2\b/);
});

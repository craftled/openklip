import { mock, test } from "bun:test";
import assert from "node:assert/strict";

mock.module("../web/components/agent-chat-context.tsx", () => ({
  useAgentChat: () => ({
    activeSlug: "demo",
    activeThread: null,
    agent: "claude-sonnet-4-6",
    chatsLoading: false,
    runningThreadId: null,
    sendMessage: async () => undefined,
  }),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { AgentChatPanel } from "../web/components/agent-chat-panel.tsx";

test("AgentChatPanel empty state is honest without demo markers", () => {
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

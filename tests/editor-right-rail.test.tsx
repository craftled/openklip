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
import {
  EditorRightRail,
  type EditorRightRailProps,
} from "../web/components/editor/editor-right-rail.tsx";
import { SidebarProvider } from "../web/components/ui/sidebar.tsx";

function renderRail(props: EditorRightRailProps) {
  return renderToStaticMarkup(
    <SidebarProvider keyboardShortcut={false}>
      <EditorRightRail {...props} />
    </SidebarProvider>
  );
}

function minimalProps(
  overrides: Partial<EditorRightRailProps> = {}
): EditorRightRailProps {
  return {
    hidden: false,
    mobilePanel: null,
    onAssetsUpdated: () => undefined,
    onCloseMobilePanel: () => undefined,
    slug: "demo",
    ...overrides,
  };
}

test("EditorRightRail renders desktop chat sidebar", () => {
  const html = renderRail(minimalProps());
  assert.match(html, /data-editor-right-rail/);
  assert.match(html, /data-sidebar="sidebar"/);
  assert.match(html, /Toggle chat sidebar/);
  assert.doesNotMatch(html, /data-config-rail/);
  assert.doesNotMatch(html, /data-mobile-right-rail/);
});

test("EditorRightRail renders mobile sheet when mobilePanel is chat", () => {
  const html = renderRail(minimalProps({ mobilePanel: "chat" }));
  assert.match(html, /data-mobile-right-rail/);
  assert.match(html, /role="dialog"/);
});

test("EditorRightRail returns null when hidden", () => {
  const html = renderToStaticMarkup(
    <EditorRightRail {...minimalProps({ hidden: true })} />
  );
  assert.equal(html, "");
});

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
import {
  CHAT_WIDTH_WITH_CONFIG,
  CONFIG_SIDEBAR_WIDTH,
  visibleChatWidth,
} from "../web/lib/right-rail-layout.ts";

function minimalProps(
  overrides: Partial<EditorRightRailProps> = {}
): EditorRightRailProps {
  return {
    chatWidth: 480,
    configOpen: false,
    configPanel: <div data-test-config>Config panel</div>,
    hidden: false,
    mobilePanel: null,
    onAssetsUpdated: () => undefined,
    onChatWidthChange: () => undefined,
    onCloseMobilePanel: () => undefined,
    slug: "demo",
    ...overrides,
  };
}

test("visibleChatWidth caps width when config is open", () => {
  assert.equal(visibleChatWidth(520, false), 520);
  assert.equal(visibleChatWidth(520, true), CHAT_WIDTH_WITH_CONFIG);
});

test("EditorRightRail renders desktop chat rail", () => {
  const html = renderToStaticMarkup(<EditorRightRail {...minimalProps()} />);
  assert.match(html, /data-editor-right-rail/);
  assert.doesNotMatch(html, /data-config-rail/);
  assert.doesNotMatch(html, /data-mobile-right-rail/);
});

test("EditorRightRail renders config rail when configOpen", () => {
  const html = renderToStaticMarkup(
    <EditorRightRail {...minimalProps({ configOpen: true })} />
  );
  assert.match(html, /data-config-rail/);
  assert.match(html, /Config panel/);
});

test("EditorRightRail renders mobile sheet when mobilePanel is set", () => {
  const html = renderToStaticMarkup(
    <EditorRightRail {...minimalProps({ mobilePanel: "chat" })} />
  );
  assert.match(html, /data-mobile-right-rail/);
  assert.match(html, /role="dialog"/);
});

test("EditorRightRail returns null when hidden", () => {
  const html = renderToStaticMarkup(
    <EditorRightRail {...minimalProps({ hidden: true })} />
  );
  assert.equal(html, "");
});

test("EditorRightRail config rail uses CONFIG_SIDEBAR_WIDTH", () => {
  const html = renderToStaticMarkup(
    <EditorRightRail {...minimalProps({ configOpen: true })} />
  );
  assert.match(html, new RegExp(`width:${CONFIG_SIDEBAR_WIDTH}`));
});

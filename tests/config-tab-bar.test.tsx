import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfigTabBar } from "../web/components/config/config-tab-bar.tsx";

test("ConfigTabBar renders all config tabs", () => {
  const html = renderToStaticMarkup(
    <ConfigTabBar activeTab="look" onTabChange={() => undefined} />
  );
  assert.match(html, /data-config-tab-bar/);
  assert.match(html, />Edit</);
  assert.match(html, />Look</);
  assert.match(html, />Project</);
  assert.match(html, />Tools</);
  assert.match(html, />History</);
});

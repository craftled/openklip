import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { IconSwap } from "../web/components/ui/icon-swap.tsx";

function Play() {
  return <svg data-icon="play" />;
}
function Pause() {
  return <svg data-icon="pause" />;
}

test("renders the active child inside an icon-swap slot", () => {
  const html = renderToStaticMarkup(
    <IconSwap activeKey="play">
      <Play />
    </IconSwap>
  );
  assert.match(html, /data-slot="icon-swap"/);
  assert.match(html, /data-icon="play"/);
});

test("renders only the icon for the current active key", () => {
  const html = renderToStaticMarkup(
    <IconSwap activeKey="pause">
      <Pause />
    </IconSwap>
  );
  assert.match(html, /data-icon="pause"/);
  assert.doesNotMatch(html, /data-icon="play"/);
});

test("accepts a boolean active key", () => {
  const html = renderToStaticMarkup(
    <IconSwap activeKey={true}>
      <Play />
    </IconSwap>
  );
  assert.match(html, /data-slot="icon-swap"/);
  assert.match(html, /data-icon="play"/);
});

test("accepts an optional (undefined) active key without throwing", () => {
  const html = renderToStaticMarkup(
    <IconSwap activeKey={undefined}>
      <Play />
    </IconSwap>
  );
  assert.match(html, /data-slot="icon-swap"/);
  assert.match(html, /data-icon="play"/);
});

test("forwards a className onto the swap container", () => {
  const html = renderToStaticMarkup(
    <IconSwap activeKey="play" className="size-4 text-white">
      <Play />
    </IconSwap>
  );
  assert.match(html, /size-4/);
  assert.match(html, /text-white/);
});

test("first paint shows the icon fully visible, never blurred or shrunk", () => {
  // AnimatePresence initial={false} must skip the enter animation so the icon
  // is not stuck at opacity:0 / scale:0.25 on the very first render.
  const html = renderToStaticMarkup(
    <IconSwap activeKey="play">
      <Play />
    </IconSwap>
  );
  assert.doesNotMatch(html, /opacity:0(?!\.)/);
  assert.doesNotMatch(html, /scale\(0\.25\)|scale:0\.25/);
});

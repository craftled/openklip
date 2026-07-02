import assert from "node:assert/strict";
import { test } from "node:test";
import { captionStyle, listCaptionStyles } from "@engine/caption-styles";
import { renderToStaticMarkup } from "react-dom/server";
import type { CaptionGroup } from "../src/captions.ts";
import { CaptionLine } from "../web/components/caption-line.tsx";
import { CaptionStylePicker } from "../web/components/caption-style-picker.tsx";

const group: CaptionGroup = {
  endSec: 2,
  startSec: 0,
  words: [
    { endSec: 0.5, startSec: 0, text: "hello" },
    { endSec: 1.5, startSec: 1, text: "world" },
  ],
};

test("CaptionLine renders every word and raises/lowers with the raised prop", () => {
  const lowered = renderToStaticMarkup(
    <CaptionLine
      curSec={0}
      group={group}
      raised={false}
      styleDef={captionStyle("boxed")}
    />
  );
  assert.match(lowered, /hello/);
  assert.match(lowered, /world/);
  assert.match(lowered, /bottom-\[9%\]/);

  const raised = renderToStaticMarkup(
    <CaptionLine
      curSec={0}
      group={group}
      raised={true}
      styleDef={captionStyle("boxed")}
    />
  );
  assert.match(raised, /bottom-\[28%\]/);
});

test("CaptionLine applies allCaps as a text-transform (display only, text itself unchanged)", () => {
  const html = renderToStaticMarkup(
    <CaptionLine
      curSec={0}
      group={group}
      raised={false}
      styleDef={captionStyle("bold-caps")}
    />
  );
  assert.match(html, /text-transform:\s*uppercase/);
  // The underlying word text is not mutated to upper case in markup.
  assert.match(html, /hello/);
  assert.doesNotMatch(html, /HELLO/);
});

test("CaptionLine colors the active word with the accent color and the rest with the inactive color", () => {
  const html = renderToStaticMarkup(
    <CaptionLine
      curSec={0}
      group={group}
      raised={false}
      styleDef={captionStyle("karaoke")}
    />
  );
  assert.match(html, /color:\s*#7dc4ff/); // active "hello" gets the accent
  assert.match(html, /rgba\(255, 255, 255, 0\.85\)/); // inactive "world"
});

test("CaptionLine boxed output still carries the historical bg-black/55 background", () => {
  const html = renderToStaticMarkup(
    <CaptionLine
      curSec={0}
      group={group}
      raised={false}
      styleDef={captionStyle("boxed")}
    />
  );
  assert.match(html, /rgba\(0, 0, 0, 0\.55\)/);
});

test("CaptionStylePicker renders one option per registered caption style", () => {
  const html = renderToStaticMarkup(
    <CaptionStylePicker onSelect={() => undefined} selected="boxed" />
  );
  for (const def of listCaptionStyles()) {
    assert.match(html, new RegExp(def.label));
  }
  assert.equal(html.match(/<button/g)?.length, listCaptionStyles().length);
});

test("CaptionStylePicker marks the selected style and only that one", () => {
  const html = renderToStaticMarkup(
    <CaptionStylePicker onSelect={() => undefined} selected="karaoke" />
  );
  assert.equal(html.match(/aria-pressed="true"/g)?.length, 1);
  const buttons = html.split("<button").slice(1);
  assert.equal(buttons.length, listCaptionStyles().length);
  for (const button of buttons) {
    const isKaraoke = /Karaoke/.test(button);
    assert.equal(button.includes('aria-pressed="true"'), isKaraoke);
  }
});

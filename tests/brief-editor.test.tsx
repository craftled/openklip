import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BriefEditor, briefStatus } from "../web/components/brief-editor.tsx";

test("briefStatus returns unchanged when current equals initial and not saving", () => {
  assert.equal(briefStatus("hello", "hello", false), "unchanged");
});

test("briefStatus returns dirty when current differs from initial and not saving", () => {
  assert.equal(briefStatus("world", "hello", false), "dirty");
});

test("briefStatus returns saving when saving is true regardless of changes", () => {
  assert.equal(briefStatus("hello", "hello", true), "saving");
  assert.equal(briefStatus("world", "hello", true), "saving");
});

test("BriefEditor renders with initialBrief text", () => {
  const html = renderToStaticMarkup(
    <BriefEditor
      initialBrief="Hello brief"
      onSave={async () => ({ ok: true })}
      slug="test-slug"
    />
  );
  assert.match(html, /Hello brief/);
});

test("BriefEditor renders character count", () => {
  const html = renderToStaticMarkup(
    <BriefEditor
      initialBrief="Hello brief"
      onSave={async () => ({ ok: true })}
      slug="test-slug"
    />
  );
  assert.match(html, /11 characters/);
});

test("BriefEditor includes data-brief-editor attribute", () => {
  const html = renderToStaticMarkup(
    <BriefEditor
      initialBrief="Hello brief"
      onSave={async () => ({ ok: true })}
      slug="test-slug"
    />
  );
  assert.match(html, /data-brief-editor/);
});

test("BriefEditor includes data-brief-save attribute on button", () => {
  const html = renderToStaticMarkup(
    <BriefEditor
      initialBrief="Hello brief"
      onSave={async () => ({ ok: true })}
      slug="test-slug"
    />
  );
  assert.match(html, /data-brief-save/);
});

test("BriefEditor save button is disabled when unchanged", () => {
  const html = renderToStaticMarkup(
    <BriefEditor
      initialBrief="Hello brief"
      onSave={async () => ({ ok: true })}
      slug="test-slug"
    />
  );
  const button = html
    .split("<button")
    .find((piece) => piece.includes("data-brief-save"));
  assert.ok(button, "save button should exist");
  assert.ok(
    button.slice(0, button.indexOf(">")).includes('disabled=""'),
    "save button should be disabled when unchanged"
  );
});

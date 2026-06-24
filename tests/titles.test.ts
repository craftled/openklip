import assert from "node:assert";
import { test } from "node:test";
import { buildTitlesAss } from "../src/titles.ts";
import type { TitleItem } from "../src/titles.ts";

const OPTS = { width: 1920, height: 1080 } as const;

function dialogueLines(ass: string): string[] {
  return ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
}

// 1. Empty list -> valid header with the [Events] section but zero Dialogue lines.
test("empty list produces a header with [Events] and no Dialogue lines", () => {
  const ass = buildTitlesAss([], OPTS);
  assert.ok(ass.includes("[Events]"), "should contain the [Events] header");
  assert.ok(ass.includes("[Script Info]"), "should contain [Script Info]");
  assert.ok(ass.includes("[V4+ Styles]"), "should contain [V4+ Styles]");
  assert.strictEqual(dialogueLines(ass).length, 0, "no Dialogue lines for empty input");
});

// 2. One lower title -> exactly one Dialogue; contains text, \fad and \move; exact times.
test("a lower title emits one Dialogue with fade + upward slide and exact times", () => {
  const items: TitleItem[] = [
    { text: "Chapter One", startSec: 1.5, endSec: 4.25, position: "lower" },
  ];
  const ass = buildTitlesAss(items, OPTS);
  const lines = dialogueLines(ass);
  assert.strictEqual(lines.length, 1, "exactly one Dialogue line");
  const line = lines[0];
  assert.ok(line.includes("Chapter One"), "contains the title text");
  assert.ok(line.includes("\\fad"), "contains the \\fad fade override");
  assert.ok(line.includes("\\move"), "contains the \\move upward-slide override");
  // assTime of 1.5 -> 0:00:01.50, 4.25 -> 0:00:04.25
  assert.ok(line.includes("0:00:01.50"), "Start matches 1.5s formatted as 0:00:01.50");
  assert.ok(line.includes("0:00:04.25"), "End matches 4.25s formatted as 0:00:04.25");
});

// 3. One center title -> center positioning (\an5), fades but does NOT slide; exact times.
test("a center title is centered, fades, and does not slide", () => {
  const items: TitleItem[] = [
    { text: "Centered", startSec: 0, endSec: 2, position: "center" },
  ];
  const ass = buildTitlesAss(items, OPTS);
  const lines = dialogueLines(ass);
  assert.strictEqual(lines.length, 1, "exactly one Dialogue line");
  const line = lines[0];
  assert.ok(line.includes("\\an5"), "center title uses \\an5 (middle-center)");
  assert.ok(line.includes("\\fad"), "center title still fades");
  assert.ok(!line.includes("\\move"), "center title does NOT slide");
  assert.ok(line.includes("0:00:00.00"), "Start matches 0s formatted as 0:00:00.00");
  assert.ok(line.includes("0:00:02.00"), "End matches 2s formatted as 0:00:02.00");
});

// 4. Text with braces/backslashes is escaped: no raw user braces survive.
test("user braces and backslashes are escaped out of the output", () => {
  const items: TitleItem[] = [
    { text: "ev{i}l \\ tag {x}", startSec: 0, endSec: 1, position: "center" },
  ];
  const ass = buildTitlesAss(items, OPTS);
  const line = dialogueLines(ass)[0];
  // The only braces allowed are the leading override block; isolate the text payload.
  const text = line.slice(line.indexOf("}") + 1);
  assert.ok(!text.includes("{"), "no raw '{' from user text");
  assert.ok(!text.includes("}"), "no raw '}' from user text");
  // The visible letters survive (the literal control chars are stripped/escaped).
  assert.ok(text.includes("evil"), "stripped braces leave the inner letters: evil");
});

// 5. Whitespace-only items are skipped.
test("whitespace-only items are skipped", () => {
  const items: TitleItem[] = [
    { text: "   ", startSec: 0, endSec: 1 },
    { text: "\t\n", startSec: 1, endSec: 2 },
    { text: "Real", startSec: 2, endSec: 3 },
  ];
  const ass = buildTitlesAss(items, OPTS);
  const lines = dialogueLines(ass);
  assert.strictEqual(lines.length, 1, "only the non-empty item produces a Dialogue line");
  assert.ok(lines[0].includes("Real"));
});

// 6. PlayResX/PlayResY reflect opts.width/height.
test("PlayResX/PlayResY reflect opts.width/height", () => {
  const ass = buildTitlesAss([], { width: 1280, height: 720 });
  assert.ok(ass.includes("PlayResX: 1280"), "PlayResX echoes width");
  assert.ok(ass.includes("PlayResY: 720"), "PlayResY echoes height");
});

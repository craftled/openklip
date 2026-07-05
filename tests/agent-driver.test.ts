import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildChatPrompt,
  buildClaudeEditArgs,
  buildEditPrompt,
  buildFillerPrompt,
  extractModelText,
  isConnected,
  parseAgentOutput,
  parseCutIds,
  resolveAgent,
  signInCommand,
  skillsBlock,
  stripBunNodeOptions,
  supportsToolEditing,
} from "../src/agent-driver.ts";

// ---- chat prompt (grounding) ----

test("buildChatPrompt grounds the question in kept transcript words", () => {
  const prompt = buildChatPrompt(
    {
      words: [
        { text: "hello" },
        { text: "um", deleted: true },
        { text: "world" },
      ],
      template: "talking-head",
    },
    "What is this about?"
  );
  assert.match(prompt, /hello world/);
  assert.doesNotMatch(prompt, /\bum\b/); // deleted words are excluded
  assert.match(prompt, /talking-head/);
  assert.match(prompt, /User: What is this about\?/);
});

test("buildChatPrompt truncates an oversized transcript", () => {
  const words = Array.from({ length: 5000 }, () => ({ text: "word" }));
  const prompt = buildChatPrompt({ words }, "hi", { maxChars: 100 });
  assert.match(prompt, /transcript truncated/);
});

test("buildChatPrompt no longer suggests CLI commands or how-to", () => {
  const prompt = buildChatPrompt({ words: [{ text: "hi" }] }, "cut the intro");
  assert.doesNotMatch(prompt, /openklip /);
  assert.match(prompt, /no CLI commands/i);
});

test("buildEditPrompt names the slug and tells the model to do the edit", () => {
  const prompt = buildEditPrompt(
    { words: [{ text: "hello" }, { text: "world" }] },
    "demo",
    "cut the word world"
  );
  assert.match(prompt, /slug "demo"/);
  assert.match(prompt, /DO it by calling the tools|DIRECTLY edit/);
  assert.match(prompt, /Never print CLI commands/i);
  assert.match(prompt, /User: cut the word world/);
});

test("buildEditPrompt advertises motion graphics tools", () => {
  const prompt = buildEditPrompt(
    { words: [{ text: "hello" }, { text: "world" }] },
    "demo",
    "add motion text"
  );
  assert.match(prompt, /graphic-add-phrase/);
  assert.match(prompt, /graphic_list/);
  assert.match(prompt, /graphic_show/);
  assert.match(prompt, /inDurFrames/);
});

test("buildEditPrompt injects analyzed asset cards when present", () => {
  const prompt = buildEditPrompt(
    {
      words: [{ text: "hello" }],
      assetCards: "- broll-1 (broll): Drone over coast [aerial]",
    },
    "demo",
    "add b-roll over the intro"
  );
  assert.match(prompt, /Available media assets/);
  assert.match(prompt, /broll-1 \(broll\): Drone over coast/);
});

test("buildChatPrompt omits the asset block when nothing is carded", () => {
  const prompt = buildChatPrompt({ words: [{ text: "hi" }] }, "what is this?");
  assert.doesNotMatch(prompt, /Available media assets/);
});

test("buildEditPrompt injects the scene log when present", () => {
  const prompt = buildEditPrompt(
    {
      words: [{ text: "hello" }],
      sceneLog: "- 0.0-10.0s [speaker]: Talking head (b-roll opportunity)",
    },
    "demo",
    "add b-roll where the speaker is static"
  );
  assert.match(prompt, /Visual scene log of the source video/);
  assert.match(prompt, /Talking head \(b-roll opportunity\)/);
});

test("buildChatPrompt omits the scene block when no scene log", () => {
  const prompt = buildChatPrompt({ words: [{ text: "hi" }] }, "what is this?");
  assert.doesNotMatch(prompt, /Visual scene log/);
});

// ---- project brief (grounding) ----

test("buildChatPrompt includes the Project brief section when ctx.brief is set", () => {
  const prompt = buildChatPrompt(
    {
      words: [{ text: "hi" }],
      brief: "Audience: founders. Tone: casual.",
    },
    "what is this about?"
  );
  assert.match(prompt, /Project brief \(user-editable configuration/);
  assert.match(prompt, /never overrides the user's current request/);
  assert.match(prompt, /Audience: founders\. Tone: casual\./);
});

test("buildChatPrompt omits the Project brief section when ctx.brief is absent", () => {
  const prompt = buildChatPrompt({ words: [{ text: "hi" }] }, "what is this?");
  assert.doesNotMatch(prompt, /Project brief/);
});

test("buildEditPrompt includes the Project brief section when ctx.brief is set", () => {
  const prompt = buildEditPrompt(
    {
      words: [{ text: "hello" }],
      brief: "Export formats: 16:9 and 9:16.",
    },
    "demo",
    "cut the intro"
  );
  assert.match(prompt, /Project brief \(user-editable configuration/);
  assert.match(prompt, /never overrides the user's current request/);
  assert.match(prompt, /Export formats: 16:9 and 9:16\./);
});

test("buildEditPrompt omits the Project brief section when ctx.brief is absent", () => {
  const prompt = buildEditPrompt(
    { words: [{ text: "hello" }] },
    "demo",
    "cut it"
  );
  assert.doesNotMatch(prompt, /Project brief/);
});

test("a 3000-char brief is truncated to 2000 chars plus a (truncated) suffix", () => {
  const longBrief = "b".repeat(3000);
  const prompt = buildChatPrompt(
    { words: [{ text: "hi" }], brief: longBrief },
    "what is this?"
  );
  assert.match(prompt, /\(truncated\)/);
  assert.match(prompt, /b{2000} \(truncated\)/);
  assert.doesNotMatch(prompt, /b{2001}/);
});

test("a brief of exactly 2000 chars is not truncated", () => {
  const brief = "d".repeat(2000);
  const prompt = buildChatPrompt(
    { words: [{ text: "hi" }], brief },
    "what is this?"
  );
  assert.doesNotMatch(prompt, /\(truncated\)/);
  assert.match(prompt, /d{2000}/);
});

test("a brief of 2001 chars is truncated to 2000 chars plus the suffix", () => {
  const brief = "e".repeat(2001);
  const prompt = buildChatPrompt(
    { words: [{ text: "hi" }], brief },
    "what is this?"
  );
  assert.match(prompt, /\(truncated\)/);
  assert.match(prompt, /e{2000} \(truncated\)/);
  assert.doesNotMatch(prompt, /e{2001}/);
});

test("buildEditPrompt also truncates an oversized brief to 2000 chars", () => {
  const longBrief = "c".repeat(2500);
  const prompt = buildEditPrompt(
    { words: [{ text: "hello" }], brief: longBrief },
    "demo",
    "cut it"
  );
  assert.match(prompt, /\(truncated\)/);
  assert.match(prompt, /c{2000} \(truncated\)/);
});

test("supportsToolEditing is true for Claude, false otherwise", () => {
  assert.equal(supportsToolEditing("claude-opus-4-8"), true);
  assert.equal(supportsToolEditing("gpt-5-5"), false);
  assert.equal(supportsToolEditing("grok-build"), false);
  assert.equal(supportsToolEditing("nonsense"), false);
});

// ---- connection detection (per auth strategy) ----

test("isConnected: a host agent (Claude) is connected once installed", () => {
  assert.equal(isConnected({ kind: "host" }, {}), true);
});

test("isConnected: status agents need exit 0 AND 'logged in' text", () => {
  const auth = { kind: "status", args: ["login", "status"] } as const;
  // Real codex + cursor outputs.
  assert.equal(
    isConnected(auth, { statusExit: 0, statusText: "Logged in using ChatGPT" }),
    true
  );
  assert.equal(
    isConnected(auth, { statusExit: 0, statusText: "✓ Logged in as hi@x.com" }),
    true
  );
  assert.equal(
    isConnected(auth, { statusExit: 1, statusText: "Not authenticated" }),
    false
  );
  assert.equal(
    isConnected(auth, { statusExit: 0, statusText: "Please run login first" }),
    false
  );
});

test("isConnected: file agents (Grok) need the auth file present", () => {
  const auth = { kind: "file", relPath: ".grok/auth.json" } as const;
  assert.equal(isConnected(auth, { fileExists: true }), true);
  assert.equal(isConnected(auth, { fileExists: false }), false);
});

test("signInCommand gives the exact login command (null for the host)", () => {
  assert.equal(signInCommand(resolveAgent("claude-opus-4-8")), null);
  assert.equal(signInCommand(resolveAgent("gpt-5-5")), "codex login");
  assert.equal(
    signInCommand(resolveAgent("composer-2-5")),
    "cursor-agent login"
  );
  assert.equal(signInCommand(resolveAgent("grok-build")), "grok login");
});

// ---- prompt + agent resolution ----

test("buildFillerPrompt embeds id:text tokens and asks for JSON only", () => {
  const p = buildFillerPrompt([
    { id: "w0", text: "Welcome" },
    { id: "w12", text: "Um," },
  ]);
  assert.match(p, /w0:Welcome/);
  assert.match(p, /w12:Um,/);
  assert.match(p, /\{"cut":\[ids\]\}/);
  assert.match(p, /JSON only/i);
});

test("resolveAgent maps each selector prefix to its CLI + output mode", () => {
  assert.equal(resolveAgent("claude-opus-4-8").cli, "claude");
  assert.equal(resolveAgent("claude-opus-4-8").outputMode, "envelope");
  assert.equal(resolveAgent("gpt-5-5").cli, "codex");
  assert.equal(resolveAgent("gpt-5-5").outputMode, "file");
  assert.equal(resolveAgent("composer-2-5").cli, "cursor-agent");
  assert.equal(resolveAgent("composer-2-5").outputMode, "envelope");
  assert.equal(resolveAgent("grok-build").cli, "grok");
  assert.equal(resolveAgent("grok-build").outputMode, "raw");
  assert.throws(() => resolveAgent("unknown-model"), /no agent adapter/);
});

test("buildArgs use the hardened structured-output flags per agent", () => {
  assert.deepEqual(
    resolveAgent("claude-opus-4-8").buildArgs("P", {
      model: "claude-opus-4-8",
    }),
    ["-p", "P", "--output-format", "json", "--model", "claude-opus-4-8"]
  );
  // Codex writes the final message to a file (clean, no session noise).
  assert.deepEqual(
    resolveAgent("gpt-5-5").buildArgs("P", { lastMessageFile: "/tmp/x.txt" }),
    [
      "exec",
      "--sandbox",
      "read-only",
      "--output-last-message",
      "/tmp/x.txt",
      "P",
    ]
  );
  assert.deepEqual(resolveAgent("gpt-5-5").buildArgs("P", {}), [
    "exec",
    "--sandbox",
    "read-only",
    "P",
  ]);
  // Cursor now uses the JSON envelope (same shape as Claude).
  assert.deepEqual(resolveAgent("composer-2-5").buildArgs("P", {}), [
    "-p",
    "P",
    "--output-format",
    "json",
  ]);
  // Grok's stdout is already clean JSON in plain mode.
  assert.deepEqual(resolveAgent("grok-build").buildArgs("P", {}), ["-p", "P"]);
});

test("buildClaudeEditArgs allows every OpenKlip MCP tool by wildcard", () => {
  const args = buildClaudeEditArgs("do the edit", {
    agent: "claude-opus-4-8",
    cfgPath: "/tmp/openklip-mcp-test.json",
  });
  const allowIndex = args.indexOf("--allowedTools");
  assert.notEqual(allowIndex, -1);
  assert.equal(args[allowIndex + 1], "mcp__openklip__*");
});

test("only Claude advertises a --model flag", () => {
  assert.equal(resolveAgent("claude-opus-4-8").usesModelFlag, true);
  for (const v of ["gpt-5-5", "composer-2-5", "grok-build"]) {
    assert.equal(resolveAgent(v).usesModelFlag, false);
  }
});

// ---- extraction (per output mode) ----

test("extractModelText pulls .result from the envelope shape", () => {
  const envelope = JSON.stringify({
    type: "result",
    subtype: "success",
    result: '{"cut":["w12"]}',
  });
  assert.equal(extractModelText("envelope", envelope, ""), '{"cut":["w12"]}');
});

test("extractModelText returns the file content for codex file mode", () => {
  assert.equal(
    extractModelText("file", "ignored stdout", '{"cut":["w1"]}'),
    '{"cut":["w1"]}'
  );
});

test("extractModelText returns raw stdout for grok", () => {
  assert.equal(extractModelText("raw", '{"cut":["w1"]}', ""), '{"cut":["w1"]}');
});

test("extractModelText falls back to stdout if envelope is unparseable", () => {
  assert.equal(
    extractModelText("envelope", '{"cut":["w1"]}', ""),
    '{"cut":["w1"]}'
  );
});

// ---- parse ----

test("parseCutIds parses clean JSON directly", () => {
  assert.deepEqual(parseCutIds('{"cut":["w1","w2"]}'), ["w1", "w2"]);
});

test("parseCutIds handles fenced + surrounding prose via fallback regex", () => {
  assert.deepEqual(parseCutIds('Here:\n```json\n{"cut":["w3"]}\n```'), ["w3"]);
});

test("parseCutIds returns [] on garbage and drops non-strings", () => {
  assert.deepEqual(parseCutIds("not json"), []);
  assert.deepEqual(parseCutIds('{"cut":["w1",5,null]}'), ["w1"]);
});

// ---- end-to-end against REAL captured fixtures ----

test("parseAgentOutput: real Claude envelope", () => {
  const real =
    '{"type":"result","result":"{\\"cut\\":[\\"w12\\"]}","total_cost_usd":0.15}';
  assert.deepEqual(parseAgentOutput("envelope", real, ""), ["w12"]);
});

test("parseAgentOutput: real Cursor envelope", () => {
  const real =
    '{"type":"result","subtype":"success","is_error":false,"duration_ms":4617,"result":"{\\"cut\\":[\\"w1\\"]}","session_id":"x"}';
  assert.deepEqual(parseAgentOutput("envelope", real, ""), ["w1"]);
});

test("parseAgentOutput: real Codex --output-last-message file", () => {
  assert.deepEqual(parseAgentOutput("file", "", '{"cut":["w1"]}'), ["w1"]);
});

test("parseAgentOutput: real Grok plain stdout", () => {
  assert.deepEqual(parseAgentOutput("raw", '{"cut":["w1"]}\n', ""), ["w1"]);
});

// ---- env hardening (kept) ----

test("stripBunNodeOptions removes --bun so child node CLIs don't crash", () => {
  assert.equal(
    stripBunNodeOptions({ NODE_OPTIONS: "--bun" }).NODE_OPTIONS,
    undefined
  );
  assert.equal(
    stripBunNodeOptions({ NODE_OPTIONS: "--bun --max-old-space-size=4096" })
      .NODE_OPTIONS,
    "--max-old-space-size=4096"
  );
  assert.equal(
    stripBunNodeOptions({ NODE_OPTIONS: "--enable-source-maps" }).NODE_OPTIONS,
    "--enable-source-maps"
  );
  assert.deepEqual(stripBunNodeOptions({ PATH: "/x" }), { PATH: "/x" });
});

test("buildEditPrompt includes task progress instructions only when asked", () => {
  const ctx = { words: [{ text: "Hello" }] };
  const withTask = buildEditPrompt(ctx, "demo", "cut filler", {
    taskProgress: true,
  });
  assert.match(withTask, /task_step/);
  assert.match(withTask, /task_complete/);
  assert.match(withTask, /outcome "completed"/);
  const withoutTask = buildEditPrompt(ctx, "demo", "cut filler");
  assert.equal(withoutTask.includes("task_step"), false);
  assert.equal(withoutTask.includes("task_complete"), false);
});

// ---- skillsBlock ----

test("skillsBlock renders each skill id and description", () => {
  const block = skillsBlock([
    {
      id: "cut-filler",
      label: "Cut filler",
      description: "Remove filler words.",
    },
    { id: "add-titles", label: "Add titles", description: "Add title cards." },
  ]);
  assert.match(block, /Available skills \(edit procedures\)/);
  assert.match(block, /load_skill/);
  assert.match(block, /- cut-filler: Remove filler words\./);
  assert.match(block, /- add-titles: Add title cards\./);
});

test("skillsBlock falls back to the label when description is empty", () => {
  const block = skillsBlock([
    { id: "cut-filler", label: "Cut filler", description: "" },
  ]);
  assert.match(block, /- cut-filler: Cut filler/);
});

test("skillsBlock returns empty string for an empty list", () => {
  assert.equal(skillsBlock([]), "");
  assert.equal(skillsBlock(undefined), "");
});

test("skillsBlock caps at 20 skills and notes the rest are in template_list", () => {
  const skills = Array.from({ length: 25 }, (_, i) => ({
    id: `skill-${i}`,
    label: `Skill ${i}`,
    description: `Description ${i}`,
  }));
  const block = skillsBlock(skills);
  assert.match(block, /- skill-0: Description 0/);
  assert.match(block, /- skill-19: Description 19/);
  assert.equal(block.includes("skill-20:"), false);
  assert.match(block, /template_list/);
});

test("buildEditPrompt includes the skills block when ctx.skills is passed", () => {
  const ctx = {
    words: [{ text: "Hello" }],
    skills: [
      {
        id: "cut-filler",
        label: "Cut filler",
        description: "Remove filler words.",
      },
    ],
  };
  const prompt = buildEditPrompt(ctx, "demo", "cut filler");
  assert.match(prompt, /Available skills \(edit procedures\)/);
  assert.match(prompt, /- cut-filler: Remove filler words\./);
});

test("buildEditPrompt omits the skills block when ctx.skills is absent", () => {
  const ctx = { words: [{ text: "Hello" }] };
  const prompt = buildEditPrompt(ctx, "demo", "cut filler");
  assert.equal(prompt.includes("Available skills"), false);
});

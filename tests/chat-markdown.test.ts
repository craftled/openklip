import { expect, test } from "bun:test";
import { parseChatMarkdown } from "../web/lib/chat-markdown";

test("parseChatMarkdown groups bullet items and inline strong text", () => {
  const blocks = parseChatMarkdown(
    "I can help:\n\n- **Cut fillers** - remove ums\n- **Export** - render mp4"
  );

  expect(blocks).toEqual([
    {
      kind: "paragraph",
      children: [{ kind: "text", text: "I can help:" }],
    },
    {
      kind: "list",
      items: [
        [
          {
            kind: "strong",
            children: [{ kind: "text", text: "Cut fillers" }],
          },
          { kind: "text", text: " - remove ums" },
        ],
        [
          {
            kind: "strong",
            children: [{ kind: "text", text: "Export" }],
          },
          { kind: "text", text: " - render mp4" },
        ],
      ],
    },
  ]);
});

test("parseChatMarkdown preserves fenced code and rejects unsafe links", () => {
  const blocks = parseChatMarkdown(
    "Use `openklip status` or [docs](https://example.com).\n\n```bash\nopenklip list\n```\n\n[bad](javascript:alert(1))"
  );

  expect(blocks).toEqual([
    {
      kind: "paragraph",
      children: [
        { kind: "text", text: "Use " },
        { kind: "code", text: "openklip status" },
        { kind: "text", text: " or " },
        {
          kind: "link",
          children: [{ kind: "text", text: "docs" }],
          href: "https://example.com",
        },
        { kind: "text", text: "." },
      ],
    },
    {
      kind: "code",
      code: "openklip list",
      language: "bash",
    },
    {
      kind: "paragraph",
      children: [{ kind: "text", text: "[bad](javascript:alert(1))" }],
    },
  ]);
});

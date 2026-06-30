export type ChatMarkdownInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: ChatMarkdownInline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; children: ChatMarkdownInline[]; href: string };

export type ChatMarkdownBlock =
  | { kind: "paragraph"; children: ChatMarkdownInline[] }
  | { kind: "list"; items: ChatMarkdownInline[][] }
  | { kind: "code"; code: string; language?: string };

const FENCE_RE = /^```([a-zA-Z0-9_-]+)?\s*$/;
const LIST_RE = /^\s*[-*]\s+(.+)$/;
const LINK_RE = /^\[([^\]]+)\]\(([^)\s]+)\)/;

export function parseChatMarkdown(markdown: string): ChatMarkdownBlock[] {
  const blocks: ChatMarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let listItems: ChatMarkdownInline[][] = [];
  let codeLines: string[] | null = null;
  let codeLanguage: string | undefined;

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    blocks.push({
      kind: "paragraph",
      children: parseChatMarkdownInline(paragraph.join("\n")),
    });
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push({ kind: "list", items: listItems });
    listItems = [];
  };

  for (const line of lines) {
    if (codeLines) {
      if (line.startsWith("```")) {
        blocks.push({
          kind: "code",
          code: codeLines.join("\n"),
          language: codeLanguage,
        });
        codeLines = null;
        codeLanguage = undefined;
        continue;
      }
      codeLines.push(line);
      continue;
    }

    const fence = line.match(FENCE_RE);
    if (fence) {
      flushParagraph();
      flushList();
      codeLines = [];
      codeLanguage = fence[1];
      continue;
    }

    const listMatch = line.match(LIST_RE);
    if (listMatch) {
      flushParagraph();
      listItems.push(parseChatMarkdownInline(listMatch[1] ?? ""));
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (codeLines) {
    blocks.push({
      kind: "code",
      code: codeLines.join("\n"),
      language: codeLanguage,
    });
  }
  flushParagraph();
  flushList();

  return blocks;
}

export function parseChatMarkdownInline(text: string): ChatMarkdownInline[] {
  const result: ChatMarkdownInline[] = [];
  let index = 0;

  while (index < text.length) {
    const nextStrong = text.indexOf("**", index);
    const nextCode = text.indexOf("`", index);
    const nextLink = text.indexOf("[", index);
    const nextSpecial = [nextStrong, nextCode, nextLink]
      .filter((value) => value >= 0)
      .sort((a, b) => a - b)[0];

    if (nextSpecial === undefined) {
      pushText(result, text.slice(index));
      break;
    }

    if (nextSpecial > index) {
      pushText(result, text.slice(index, nextSpecial));
      index = nextSpecial;
      continue;
    }

    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end > index + 2) {
        result.push({
          kind: "strong",
          children: parseChatMarkdownInline(text.slice(index + 2, end)),
        });
        index = end + 2;
        continue;
      }
    }

    if (text[index] === "`") {
      const end = text.indexOf("`", index + 1);
      if (end > index + 1) {
        result.push({ kind: "code", text: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (text[index] === "[") {
      const link = text.slice(index).match(LINK_RE);
      const href = link?.[2];
      if (link?.[1] && href && isSafeHref(href)) {
        result.push({
          kind: "link",
          children: parseChatMarkdownInline(link[1]),
          href,
        });
        index += link[0].length;
        continue;
      }
    }

    pushText(result, text[index] ?? "");
    index += 1;
  }

  return result;
}

function pushText(result: ChatMarkdownInline[], text: string) {
  if (!text) {
    return;
  }
  const previous = result.at(-1);
  if (previous?.kind === "text") {
    previous.text += text;
    return;
  }
  result.push({ kind: "text", text });
}

function isSafeHref(href: string): boolean {
  return (
    href.startsWith("https://") ||
    href.startsWith("http://") ||
    href.startsWith("mailto:")
  );
}

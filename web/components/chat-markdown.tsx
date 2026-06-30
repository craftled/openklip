"use client";

import type { ReactNode } from "react";
import {
  type ChatMarkdownInline,
  parseChatMarkdown,
} from "@/lib/chat-markdown";

interface ChatMarkdownProps {
  children: string;
}

export function ChatMarkdown({ children }: ChatMarkdownProps) {
  const blocks = parseChatMarkdown(children);

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.kind === "list") {
          return (
            <ul className="list-disc space-y-1.5 pl-5" key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "code") {
          return (
            <pre
              className="overflow-x-auto rounded-md bg-background/70 p-2 font-mono text-xs"
              key={index}
            >
              <code>{block.code}</code>
            </pre>
          );
        }
        return (
          <p className="whitespace-pre-wrap" key={index}>
            {renderInline(block.children)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(tokens: ChatMarkdownInline[]): ReactNode {
  return tokens.map((token, index) => {
    if (token.kind === "strong") {
      return <strong key={index}>{renderInline(token.children)}</strong>;
    }
    if (token.kind === "code") {
      return (
        <code
          className="rounded bg-background/70 px-1 py-0.5 font-mono text-[0.9em]"
          key={index}
        >
          {token.text}
        </code>
      );
    }
    if (token.kind === "link") {
      return (
        <a
          className="underline underline-offset-2"
          href={token.href}
          key={index}
          rel="noopener"
          target="_blank"
        >
          {renderInline(token.children)}
        </a>
      );
    }
    return token.text;
  });
}

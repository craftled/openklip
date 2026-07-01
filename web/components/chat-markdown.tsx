"use client";

import {
  PRODUCT_ANNOUNCEMENT_HEIGHT,
  PRODUCT_ANNOUNCEMENT_WIDTH,
  type ProductAnnouncementValidation,
  validateProductAnnouncementSpec,
} from "@engine/product-announcement";
import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ChatMarkdownInline,
  parseChatMarkdown,
} from "@/lib/chat-markdown";
import { ProductAnnouncementFrame } from "./product-announcement-frame";

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
          if (block.language === "json-render") {
            return <JsonRenderPreviewCard code={block.code} key={index} />;
          }
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

function JsonRenderPreviewCard({ code }: { code: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.18);
  const parsed = useMemo<ProductAnnouncementValidation>(() => {
    try {
      const spec = JSON.parse(code) as unknown;
      return validateProductAnnouncementSpec(spec);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { success: false, issues: [detail] };
    }
  }, [code]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    const update = () => {
      const w = box.clientWidth;
      if (w > 0) {
        setScale(w / PRODUCT_ANNOUNCEMENT_WIDTH);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  if (!(parsed.success && parsed.spec)) {
    return (
      <div className="rounded-md border border-destructive/30 bg-background/70 p-3 text-xs">
        <div className="font-medium text-destructive">
          Invalid json-render spec
        </div>
        <div className="mt-1 text-muted-foreground">
          {parsed.issues[0] ?? "Spec failed validation"}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background/70">
      <div className="flex items-center justify-between gap-2 border-border border-b px-3 py-2 text-xs">
        <span className="font-medium">Announcement graphic</span>
        <span className="text-muted-foreground">Valid spec</span>
      </div>
      <div
        className="relative w-full overflow-hidden bg-black"
        ref={boxRef}
        style={{
          aspectRatio: `${PRODUCT_ANNOUNCEMENT_WIDTH} / ${PRODUCT_ANNOUNCEMENT_HEIGHT}`,
        }}
      >
        <div
          className="origin-top-left"
          style={{
            width: PRODUCT_ANNOUNCEMENT_WIDTH,
            height: PRODUCT_ANNOUNCEMENT_HEIGHT,
            transform: `scale(${scale})`,
          }}
        >
          <ProductAnnouncementFrame spec={parsed.spec} />
        </div>
      </div>
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

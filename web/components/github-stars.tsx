import type { CSSProperties } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GithubIcon } from "@/components/ui/svgs/githubIcon";
import { cn } from "@/lib/utils";

export interface GitHubStarsProps {
  className?: string;
  iconClassName?: string;
  /**
   * Optional locales for number formatting.
   * See [MDN - Intl - locales argument](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl#locales_argument).
   * @defaultValue "en-US"
   */
  locales?: Intl.LocalesArgument;
  /** GitHub repository in `owner/repo` format. */
  repo: string;
  /** Whether to show the formatted star count beside the icon. */
  showCount?: boolean;
  /** Number of stars to display. */
  stargazersCount: number;
}

const numberStyle = {
  textBox: "trim-end cap alphabetic",
} as CSSProperties & { textBox: string };

export function GitHubStars({
  repo,
  stargazersCount,
  className,
  iconClassName,
  locales = "en-US",
  showCount = true,
}: GitHubStarsProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "h-8 min-w-0 justify-start gap-2 rounded-md px-2 text-sidebar-foreground text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              showCount ? "w-full" : "w-8",
              className
            )}
            href={`https://github.com/${repo}`}
            rel="noopener"
            target="_blank"
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              <GithubIcon className={cn("size-3.5", iconClassName)} />
            </span>

            {showCount ? (
              <span
                className="text-[0.8125rem]/none text-muted-foreground tabular-nums"
                style={numberStyle}
              >
                {new Intl.NumberFormat(locales, {
                  compactDisplay: "short",
                  notation: "compact",
                })
                  .format(stargazersCount)
                  .toLowerCase()}
              </span>
            ) : null}
          </a>
        }
      />

      <TooltipContent className="tabular-nums">
        {new Intl.NumberFormat(locales).format(stargazersCount)} stars
      </TooltipContent>
    </Tooltip>
  );
}

import Image from "next/image";
import type { ComponentType, SVGProps } from "react";
import { GitHubStars } from "@/components/github-stars";
import { MarketingEditorMock } from "@/components/marketing-editor-mock";
import { MarketingThemeToggle } from "@/components/marketing-theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClaudeAiIcon } from "@/components/ui/svgs/claudeAiIcon";
import { CursorLight } from "@/components/ui/svgs/cursorLight";
import { Openai } from "@/components/ui/svgs/openai";
import { fetchGitHubStars, openklipGitHubUrl } from "@/lib/github-repo";
import { Book, BrandGithub, PlugConnected } from "@/lib/icon";
import { cn } from "@/lib/utils";

const SUPPORTS: {
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  { label: "Cursor", Icon: CursorLight },
  { label: "Claude Code", Icon: ClaudeAiIcon },
  { label: "Codex", Icon: Openai },
  { label: "MCP", Icon: PlugConnected },
];

const FEATURES = [
  {
    title: "Agent at the terminal",
    body: "Cursor, Claude Code, Codex, or your scripts drive cuts, overlays, and export through the CLI and MCP.",
  },
  {
    title: "Human at the browser",
    body: "Review the same project.json in the editor: transcript cuts, overlays, captions, and export.",
  },
  {
    title: "Plain files on disk",
    body: "Every project is a folder. project.json is the edit. No database, no cloud lock-in.",
  },
] as const;

const BADGE_CLASS =
  "h-3.5 border-transparent px-1 text-[9px] text-white uppercase tracking-[0.1em]";

function MarketingBadges() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge className={`${BADGE_CLASS} bg-[#3a966b]`}>Open source</Badge>
      <Badge className={`${BADGE_CLASS} bg-[#e11d48]`}>MIT License</Badge>
    </div>
  );
}

function OpenKlipMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        WebkitMask: "url('/openklip.svg') center / contain no-repeat",
        mask: "url('/openklip.svg') center / contain no-repeat",
      }}
    />
  );
}

function MarketingLogo({ className }: { className?: string }) {
  return (
    <a className={cn("flex items-center gap-2.5", className)} href="/">
      <OpenKlipMark className="size-7" />
      <span className="font-semibold text-base text-foreground tracking-tight">
        OpenKlip
      </span>
    </a>
  );
}

export async function MarketingSite() {
  const stars = await fetchGitHubStars();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <MarketingLogo />
        <nav
          aria-label="Marketing"
          className="flex items-center gap-5 text-muted-foreground text-sm"
        >
          <a
            className="transition-colors hover:text-foreground"
            href="/docs/download-install"
          >
            Download
          </a>
          <a className="transition-colors hover:text-foreground" href="/docs">
            Docs
          </a>
          <a
            className="transition-colors hover:text-foreground"
            href={openklipGitHubUrl()}
            rel="noopener"
            target="_blank"
          >
            GitHub
          </a>
          <MarketingThemeToggle />
          <GitHubStars
            className="h-auto w-auto gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            repo="craftled/openklip"
            showCount={stars > 0}
            stargazersCount={stars}
          />
        </nav>
      </header>

      <main className="flex w-full flex-col">
        <section className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-8">
          <MarketingBadges />
          <div className="space-y-4">
            <h1 className="font-medium text-3xl tracking-tight md:text-5xl md:leading-none">
              Edit videos with your favorite agents
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground leading-relaxed">
              Local-first video editing for agents and humans. CLI and MCP,
              browser review, plain files on disk.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              nativeButton={false}
              render={
                <a href="/docs/getting-started">
                  <BrandGithub data-icon="inline-start" />
                  Get started
                </a>
              }
              size="lg"
            />
            <Button
              nativeButton={false}
              render={
                <a href="/docs">
                  <Book data-icon="inline-start" />
                  Read Docs
                </a>
              }
              size="lg"
              variant="outline"
            />
            <Button
              nativeButton={false}
              render={
                <a
                  aria-label="GitHub"
                  href={openklipGitHubUrl()}
                  rel="noopener"
                  target="_blank"
                >
                  <BrandGithub />
                </a>
              }
              size="icon-lg"
              variant="outline"
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-sm">
            <span className="text-muted-foreground">Supports</span>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-foreground">
              {SUPPORTS.map(({ label, Icon }) => (
                <li className="flex items-center gap-1.5" key={label}>
                  <Icon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-foreground [&_path]:fill-current"
                  />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-muted-foreground text-sm">
            The editor runs locally on macOS today. This site is the project
            home; install from GitHub to edit video.
          </p>
        </section>

        <section
          aria-label="OpenKlip editor preview"
          className="mx-auto mt-10 w-full max-w-6xl px-4 sm:px-6 md:px-8"
        >
          <MarketingEditorMock />
        </section>

        <div className="mx-auto mt-16 flex w-full max-w-5xl flex-col gap-16 px-6">
          <section className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map((feature) => (
              <article
                className="rounded-xl bg-slate-100 p-5 dark:bg-slate-900/50"
                key={feature.title}
              >
                <h2 className="font-medium text-base">{feature.title}</h2>
                <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                  {feature.body}
                </p>
              </article>
            ))}
          </section>

          <section className="rounded-xl border border-border bg-muted/20 p-6 sm:p-8">
            <div className="space-y-2">
              <h2 className="font-semibold text-xl tracking-tight">
                Quick start
              </h2>
              <p className="text-muted-foreground text-sm">
                macOS, Bun 1.3.14+, Node 24+. Full pipeline details live in the
                README.
              </p>
            </div>
            <pre className="mt-5 overflow-x-auto rounded-lg border border-border bg-background p-4 font-mono text-[0.8125rem] text-foreground leading-relaxed">
              {`git clone https://github.com/craftled/openklip.git
cd openklip
bun install
bun run ingest /path/to/video.mp4
bun run serve <slug>
bun run export <slug>`}
            </pre>
          </section>
        </div>

        <section className="mt-20 bg-neutral-950 px-6 py-24 text-center text-white">
          <h2 className="mx-auto max-w-3xl font-medium text-4xl tracking-tight md:text-5xl">
            Try{" "}
            <span className="inline-flex items-center gap-[0.3em] align-[-0.08em]">
              <OpenKlipMark className="size-[0.85em]" />
              OpenKlip
            </span>{" "}
            now.
          </h2>
          <div className="mt-8 flex justify-center">
            <Button
              className="h-9 gap-1.5 overflow-visible rounded-full bg-neutral-200 px-4 font-medium text-[13px] text-neutral-950 leading-none tracking-tight hover:bg-white sm:h-9 [&_svg]:overflow-visible"
              nativeButton={false}
              render={
                <a href="/docs/getting-started">
                  <BrandGithub
                    aria-hidden
                    className="size-4 shrink-0 overflow-visible"
                  />
                  Get started
                </a>
              }
              size="lg"
            />
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8 text-muted-foreground text-sm sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <MarketingLogo />
            <p>Built for agents that edit by reading and writing files.</p>
            <MarketingBadges />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Built by</span>
              <div className="flex items-center gap-1">
                <Image
                  alt="Craftled"
                  className="shrink-0 dark:invert"
                  height={16}
                  src="/images/logos/craftled.svg"
                  unoptimized
                  width={16}
                />
                <a
                  className="inline-flex items-center justify-center font-medium text-muted-foreground text-xs transition-colors hover:text-foreground"
                  href="https://craftled.com/"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Craftled
                </a>
              </div>
            </div>
            <span className="text-muted-foreground text-xs">
              Standing on the shoulders of giants.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

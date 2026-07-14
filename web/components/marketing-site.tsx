import Image from "next/image";
import { GitHubStars } from "@/components/github-stars";
import { Button } from "@/components/ui/button";
import { fetchGitHubStars, openklipGitHubUrl } from "@/lib/github-repo";
import { Film, Link2 } from "@/lib/icon";

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

export async function MarketingSite() {
  const stars = await fetchGitHubStars();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="block size-8 shrink-0 bg-current"
            style={{
              WebkitMask: "url('/openklip.svg') center / contain no-repeat",
              mask: "url('/openklip.svg') center / contain no-repeat",
            }}
          />
          <span className="font-semibold text-lg tracking-tight">OpenKlip</span>
        </div>
        <div className="flex items-center gap-2">
          <GitHubStars
            className="h-9 w-auto px-3 hover:bg-muted"
            repo="craftled/openklip"
            showCount={stars > 0}
            stargazersCount={stars}
          />
          <Button
            nativeButton={false}
            render={
              <a href={openklipGitHubUrl()} rel="noopener" target="_blank">
                GitHub
                <Link2 data-icon="inline-end" />
              </a>
            }
            size="sm"
            variant="outline"
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 pt-8 pb-20">
        <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-6">
            <p className="font-medium text-primary text-sm uppercase tracking-[0.2em]">
              Open source
            </p>
            <div className="space-y-4">
              <h1 className="font-semibold text-4xl tracking-tight sm:text-5xl">
                Agent-native video toolchain
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground leading-relaxed">
                Local-first video editing for agents and humans. Run the edit
                loop from the CLI, review in the browser, keep every project as
                plain files on disk.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                nativeButton={false}
                render={
                  <a href={openklipGitHubUrl()}>
                    <Film data-icon="inline-start" />
                    Get started
                  </a>
                }
                size="lg"
              />
              <Button
                nativeButton={false}
                render={
                  <a
                    href={openklipGitHubUrl("blob/main/AGENTS.md")}
                    rel="noopener"
                    target="_blank"
                  >
                    Agent docs
                    <Link2 data-icon="inline-end" />
                  </a>
                }
                size="lg"
                variant="outline"
              />
            </div>
            <p className="text-muted-foreground text-sm">
              The editor runs locally on macOS today. This site is the project
              home; install from GitHub to edit video.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm">
            <Image
              alt="OpenKlip demo: transcript editing and export"
              className="h-auto w-full"
              height={540}
              priority
              src="/demo.gif"
              unoptimized
              width={960}
            />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              className="rounded-xl border border-border bg-card p-5"
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
      </main>

      <footer className="border-border border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-6 py-8 text-muted-foreground text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            MIT License. Built for agents that edit by reading and writing
            files.
          </p>
          <a
            className="hover:text-foreground"
            href={openklipGitHubUrl()}
            rel="noopener"
            target="_blank"
          >
            github.com/craftled/openklip
          </a>
        </div>
      </footer>
    </div>
  );
}

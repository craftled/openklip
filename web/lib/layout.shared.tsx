import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { openklipGitHubUrl } from "@/lib/github-repo";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="block size-5 shrink-0 bg-current"
            style={{
              WebkitMask: "url('/openklip.svg') center / contain no-repeat",
              mask: "url('/openklip.svg') center / contain no-repeat",
            }}
          />
          OpenKlip
        </span>
      ),
      url: "/",
    },
    githubUrl: openklipGitHubUrl(),
    links: [
      {
        text: "Home",
        url: "/",
        active: "none",
      },
      {
        text: "GitHub",
        url: openklipGitHubUrl(),
        external: true,
        active: "none",
      },
    ],
  };
}

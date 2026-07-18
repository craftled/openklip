import bundleAnalyzer from "@next/bundle-analyzer";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const withMDX = createMDX();

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    // Prevent the warning sentinel itself from being copied into any trace.
    "/*": ["./next.config.ts"],
    // Repo metadata and app source are not runtime inputs for the upload route.
    // Keep runtime folders and scripts traceable for standalone-style builds.
    "/api/projects": [
      "./AGENTS.md",
      "./CHANGELOG.md",
      "./CLAUDE.md",
      "./README.md",
      "./app/**/*",
      "./docs/**/*",
      "./tests/**/*",
      "./web/**/*",
    ],
  },
  // The engine shells out to native binaries (ffmpeg/ffprobe) and loads the
  // Whisper ONNX runtime; keep these out of the server bundle so their paths
  // resolve at runtime instead of being traced/bundled by Turbopack.
  serverExternalPackages: [
    "ffmpeg-static",
    "@ffprobe-installer/ffprobe",
    "@huggingface/transformers",
    // The rich-graphics renderer (src/headless-render.ts) drives headless Chrome
    // via puppeteer-core. It is imported lazily and must never be traced into a
    // client/server bundle.
    "puppeteer-core",
  ],
};

export default withMDX(withBundleAnalyzer(nextConfig));

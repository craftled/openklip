import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The engine shells out to native binaries (ffmpeg/ffprobe) and loads the
  // Whisper ONNX runtime; keep these out of the server bundle so their paths
  // resolve at runtime instead of being traced/bundled by Turbopack.
  serverExternalPackages: [
    "ffmpeg-static",
    "ffprobe-static",
    "@huggingface/transformers",
    // The graphics renderer pulls @hyperframes/producer, which bundles esbuild
    // (a native binary + non-JS assets like README.md). Keep both out of the
    // Turbopack bundle so they load at runtime on the server instead of being
    // traced/parsed.
    "@hyperframes/producer",
    "esbuild",
  ],
};

export default nextConfig;

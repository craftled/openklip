import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The engine shells out to native binaries (ffmpeg/ffprobe) and loads the
  // Whisper ONNX runtime; keep these out of the server bundle so their paths
  // resolve at runtime instead of being traced/bundled by Turbopack.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static", "@huggingface/transformers"],
};

export default nextConfig;

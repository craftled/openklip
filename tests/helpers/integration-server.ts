import { existsSync } from "node:fs";
import { join } from "node:path";
import { devServerAvailable } from "./integration-gate.ts";

export interface IntegrationServerHandle {
  baseUrl: string;
  port: number;
  stop: () => Promise<void>;
}

async function pickFreePort(): Promise<number> {
  const listener = Bun.serve({
    port: 0,
    fetch: () => new Response("ok"),
  });
  const port = listener.port ?? 0;
  await listener.stop(true);
  if (!port) {
    throw new Error("could not allocate a free port for integration tests");
  }
  return port;
}

export async function spawnIntegrationServer(
  projectsRoot: string
): Promise<IntegrationServerHandle> {
  const port = await pickFreePort();
  const baseUrl = `http://localhost:${port}/`;
  const repoRoot = joinRepoRoot();
  const useStart = existsSync(join(repoRoot, ".next/BUILD_ID"));
  const proc = Bun.spawn(
    useStart
      ? ["bun", "--bun", "next", "start", "-p", String(port)]
      : ["bun", "--bun", "next", "dev", "-p", String(port)],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        OPENKLIP_PROJECTS_ROOT: projectsRoot,
      },
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await devServerAvailable(baseUrl, 2000)) {
      return {
        port,
        baseUrl,
        stop: async () => {
          proc.kill();
          await proc.exited;
        },
      };
    }
    if (proc.exitCode !== null) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(
        `integration server exited before ready (code ${proc.exitCode}): ${stderr.slice(0, 500)}`
      );
    }
    await Bun.sleep(500);
  }

  proc.kill();
  throw new Error(`integration server did not start on port ${port}`);
}

function joinRepoRoot(): string {
  return new URL("../..", import.meta.url).pathname;
}

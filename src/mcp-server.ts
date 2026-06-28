#!/usr/bin/env bun
/**
 * OpenKlip MCP server (stdio). Exposes the same agent tools as the CLI query +
 * mutation surface so UI, CLI, and MCP stay in sync via src/agent-tools.ts.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { agentTools, callAgentTool } from "./agent-tools.ts";

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "openklip",
    version: "0.7.0",
  });

  for (const tool of agentTools("mcp")) {
    server.registerTool(
      tool.name,
      {
        description: tool.summary,
        inputSchema: tool.zodShape,
      },
      async (input) => {
        try {
          const result = await callAgentTool(tool.name, input);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            isError: true,
            content: [{ type: "text" as const, text: message }],
          };
        }
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.main) {
  startMcpServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

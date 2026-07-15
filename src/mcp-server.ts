#!/usr/bin/env bun
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * OpenKlip MCP server (stdio). Exposes the same agent tools as the CLI query +
 * mutation surface so UI, CLI, and MCP stay in sync via src/agent-tools.ts.
 *
 * Connect-time surface is deferred by default (CRAFT-6169): only a core tool
 * set is enabled so hosts pay ~schema tokens for the edit loop, not all ~98
 * tools. Discover deferred tools with tools_catalog, enable them with
 * tools_load, or call any tool by name with tools_invoke.
 * OPENKLIP_MCP_SURFACE=all enables every tool at connect (in-app edit agent).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { z } from "zod";
import { agentTools, callAgentTool, getAgentTool } from "./agent-tools.ts";
import { logger } from "./logger.ts";
import {
  buildToolsCatalog,
  filterToolsCatalog,
  MCP_TOOL_GROUPS,
  parseMcpSurfaceMode,
  planToolsLoad,
  shouldEnableAtConnect,
} from "./mcp-tool-surface.ts";

function textResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

export function createOpenKlipMcpServer(
  options: { surfaceMode?: ReturnType<typeof parseMcpSurfaceMode> } = {}
): {
  mode: ReturnType<typeof parseMcpSurfaceMode>;
  registered: Map<string, RegisteredTool>;
  server: McpServer;
} {
  const mode =
    options.surfaceMode ??
    parseMcpSurfaceMode(process.env.OPENKLIP_MCP_SURFACE);
  const server = new McpServer({
    name: "openklip",
    version: "0.7.0",
  });

  const mcpAgentTools = agentTools("mcp");
  const knownTools = mcpAgentTools.map((t) => ({
    name: t.name,
    summary: t.summary,
  }));
  const registered = new Map<string, RegisteredTool>();

  const catalogBase = buildToolsCatalog(
    mcpAgentTools.map((t) => ({ name: t.name, summary: t.summary })),
    mode
  );

  // Meta tools (always enabled): discover, load schemas, invoke by name.
  registered.set(
    "tools_catalog",
    server.registerTool(
      "tools_catalog",
      {
        description:
          "List OpenKlip agent tools (name + summary). Most tools are deferred at connect: use this to discover them, tools_load to enable their schemas, or tools_invoke to call by name. Optional query filters by name, summary, or group (overlays, look, cleanup, assets, multicam, export, search, core).",
        inputSchema: {
          query: z
            .string()
            .optional()
            .describe("Optional filter (name, summary, or group hint)"),
        } as unknown as ZodRawShapeCompat,
      },
      (input: Record<string, unknown>) => {
        try {
          const query =
            typeof input.query === "string" ? input.query : undefined;
          const tools = filterToolsCatalog(catalogBase, query);
          return textResult({
            surfaceMode: mode,
            groups: Object.keys(MCP_TOOL_GROUPS),
            count: tools.length,
            tools,
          });
        } catch (err) {
          return errorResult(err);
        }
      }
    )
  );

  registered.set(
    "tools_load",
    server.registerTool(
      "tools_load",
      {
        description:
          "Enable deferred OpenKlip MCP tools so their full input schemas appear in the host tool list (tools/list_changed). Pass names, a group (overlays|look|cleanup|assets|multicam|export|search|core), query substring, and/or all=true. Prefer tools_catalog first.",
        inputSchema: {
          names: z
            .array(z.string())
            .optional()
            .describe("Exact tool names to enable"),
          group: z
            .string()
            .optional()
            .describe(
              "Named group: overlays, look, cleanup, assets, multicam, export, search, core"
            ),
          query: z
            .string()
            .optional()
            .describe(
              "Same as tools_catalog: match name, summary, or group hint"
            ),
          all: z
            .boolean()
            .optional()
            .describe("Enable every OpenKlip agent tool"),
        } as unknown as ZodRawShapeCompat,
      },
      (input: Record<string, unknown>) => {
        try {
          const plan = planToolsLoad(
            {
              names: Array.isArray(input.names)
                ? input.names.map(String)
                : undefined,
              group: typeof input.group === "string" ? input.group : undefined,
              query: typeof input.query === "string" ? input.query : undefined,
              all: input.all === true,
            },
            knownTools
          );
          const newlyEnabled: string[] = [];
          const alreadyEnabled: string[] = [];
          for (const name of plan.toEnable) {
            const tool = registered.get(name);
            if (!tool) {
              continue;
            }
            if (tool.enabled) {
              alreadyEnabled.push(name);
            } else {
              tool.enable();
              newlyEnabled.push(name);
            }
          }
          return textResult({
            newlyEnabled,
            alreadyEnabled,
            unknownNames: plan.unknownNames,
            unknownGroups: plan.unknownGroups,
            enabledCount: [...registered.values()].filter((t) => t.enabled)
              .length,
          });
        } catch (err) {
          return errorResult(err);
        }
      }
    )
  );

  registered.set(
    "tools_invoke",
    server.registerTool(
      "tools_invoke",
      {
        description:
          "Call any OpenKlip agent tool by name without loading its schema into the host list. Use when a tool is deferred and you already know the input shape (from docs or tools_catalog). Prefer native tools after tools_load when the host refreshes schemas.",
        inputSchema: {
          name: z.string().describe("Agent tool name, e.g. broll-add"),
          arguments: z
            .record(z.string(), z.unknown())
            .optional()
            .describe("Tool input object (same fields as the native tool)"),
        } as unknown as ZodRawShapeCompat,
      },
      async (input: Record<string, unknown>) => {
        try {
          const name = String(input.name ?? "");
          if (!name) {
            throw new Error("name is required");
          }
          if (!getAgentTool(name)) {
            throw new Error(
              `unknown agent tool "${name}". Call tools_catalog for names.`
            );
          }
          const args =
            input.arguments &&
            typeof input.arguments === "object" &&
            !Array.isArray(input.arguments)
              ? (input.arguments as Record<string, unknown>)
              : {};
          const result = await callAgentTool(name, args);
          return textResult(result);
        } catch (err) {
          return errorResult(err);
        }
      }
    )
  );

  for (const tool of mcpAgentTools) {
    const registeredTool = server.registerTool(
      tool.name,
      {
        description: tool.summary,
        inputSchema: tool.zodShape as unknown as ZodRawShapeCompat,
      },
      async (input: Record<string, unknown>) => {
        try {
          const result = await callAgentTool(tool.name, input);
          return textResult(result);
        } catch (err) {
          return errorResult(err);
        }
      }
    );
    registered.set(tool.name, registeredTool);
    if (!shouldEnableAtConnect(tool.name, mode)) {
      registeredTool.disable();
    }
  }

  return { server, registered, mode };
}

export async function startMcpServer(): Promise<void> {
  logger.info({ surface: "mcp" }, "openklip mcp server starting");
  const { server } = createOpenKlipMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.main) {
  startMcpServer().catch((err) => {
    logger.error(err);
    process.exit(1);
  });
}

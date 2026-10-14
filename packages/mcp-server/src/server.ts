import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExcalihomeClient } from "./client";
import { diagramTools } from "./tools/diagrams";
import { versionTools } from "./tools/versions";
import type { ToolDefinition } from "./tools/types";

export const SERVER_INFO = { name: "excalihome", version: "1.0.0" };

/** Every tool the server exposes, in registration order. */
export function allTools(client: ExcalihomeClient): ToolDefinition[] {
  return [...diagramTools(client), ...versionTools(client)];
}

export function createServer(client: ExcalihomeClient): McpServer {
  const server = new McpServer(SERVER_INFO);

  for (const tool of allTools(client)) {
    server.registerTool(tool.name, tool.config, tool.handler);
  }

  return server;
}

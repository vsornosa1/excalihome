#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "./client";
import { resolveApiUrl } from "./config";
import { createServer } from "./server";

async function main() {
  const apiUrl = resolveApiUrl();
  const server = createServer(createClient(apiUrl));
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout carries the MCP protocol, so diagnostics go to stderr.
  console.error(`Excalihome MCP server ready (backend: ${apiUrl})`);
}

main().catch((error) => {
  console.error("Excalihome MCP server failed to start:", error);
  process.exit(1);
});

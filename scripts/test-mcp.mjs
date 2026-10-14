#!/usr/bin/env node
/**
 * End-to-end smoke test for the Excalihome MCP server.
 *
 * Spawns the built MCP server over stdio, performs a real MCP handshake, and
 * exercises the tools against a running backend. Verifies the concurrency
 * behaviour rather than just that the calls return something.
 *
 * Usage:
 *   node scripts/test-mcp.mjs
 *   node scripts/test-mcp.mjs --api-url http://localhost:3001/api
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const serverEntry = join(root, "packages", "mcp-server", "dist", "index.js");

const args = process.argv.slice(2);
const apiUrlFlag = args.indexOf("--api-url");
const apiUrl =
  apiUrlFlag !== -1 ? args[apiUrlFlag + 1] : process.env.EXCALIHOME_API_URL || "http://localhost:3001/api";

const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;

if (!existsSync(serverEntry)) {
  console.error(red("MCP server is not built."));
  console.error("Run: npm run build -w packages/mcp-server");
  process.exit(1);
}

const results = [];
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(pass);
  const detail = pass ? JSON.stringify(actual) : `${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`;
  console.log(`${pass ? green("PASS") : red("FAIL")}  ${label} => ${detail}`);
  return pass;
}

/** JSON-RPC over newline-delimited stdio. */
function startServer() {
  const child = spawn(process.execPath, [serverEntry], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, EXCALIHOME_API_URL: apiUrl },
  });

  let buffer = "";
  const pending = new Map();

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    }
  });

  child.stderr.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));

  let nextId = 1;
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), 20000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });

  const callTool = (name, toolArgs) => rpc("tools/call", { name, arguments: toolArgs }).then((r) => r.result);
  const payload = (result) => JSON.parse(result.content[0].text);

  return { child, rpc, callTool, payload };
}

console.log(cyan(`Backend: ${apiUrl}`));
try {
  const health = await fetch(`${apiUrl}/health`);
  if (!health.ok) throw new Error(`status ${health.status}`);
} catch (error) {
  console.error(red(`\nCannot reach the backend at ${apiUrl} (${error.message}).`));
  console.error("\nStart it first:");
  console.error("  docker compose up -d db");
  console.error('  $env:DATABASE_URL="postgres://excalihome:excalihome@localhost:5432/excalihome"');
  console.error("  npm run dev -w packages/backend        # or: node packages/backend/dist/index.js");
  process.exit(1);
}
console.log(green("Backend reachable."));

console.log(cyan("\nMCP handshake over stdio..."));
const { child, rpc, callTool, payload } = startServer();
let slug;

try {
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "excalihome-smoke", version: "1.0.0" },
  });
  console.log(`  server: ${JSON.stringify(init.result.serverInfo)}`);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const tools = (await rpc("tools/list", {})).result.tools.map((t) => t.name);
  check("tools/list exposes 10 tools", tools.length, 10);
  check("tool names have no duplicates", new Set(tools).size, tools.length);

  console.log(cyan("\nDiagram lifecycle..."));
  const created = payload(await callTool("create_diagram", { name: "MCP smoke test" }));
  slug = created.slug;
  check("new diagram starts at version 1", created.version, 1);

  const listed = payload(await callTool("list_diagrams", {}));
  check("list_diagrams includes it", listed.some((d) => d.id === created.id), true);

  const fetched = payload(await callTool("get_diagram", { id: slug }));
  check("get_diagram reports version 1", fetched.version, 1);

  console.log(cyan("\nConcurrency behaviour..."));
  const missing = await callTool("patch_diagram", {
    id: slug,
    update: [{ id: "ghost", version: 2, versionNonce: 1, baseVersion: 1, baseVersionNonce: 1 }],
  });
  check("patching a missing element is an error result", missing.isError, true);
  check("  ...with code ELEMENT_CONFLICT", payload(missing).code, "ELEMENT_CONFLICT");
  check("  ...and reason not_found", payload(missing).conflicts[0].reason, "not_found");

  const unchanged = payload(await callTool("get_diagram", { id: slug }));
  check("rejected patch did not bump the version", unchanged.version, 1);

  const added = payload(
    await callTool("patch_diagram", {
      id: slug,
      add: [{ id: "rect-1", type: "rectangle", version: 1, versionNonce: 5 }],
    })
  );
  check("add bumps the version to 2", added.version, 2);

  const updated = payload(
    await callTool("patch_diagram", {
      id: slug,
      update: [{ id: "rect-1", type: "rectangle", version: 2, versionNonce: 6, baseVersion: 1, baseVersionNonce: 5 }],
    })
  );
  check("update bumps the version to 3", updated.version, 3);

  const conflict = await callTool("patch_diagram", {
    id: slug,
    update: [{ id: "rect-1", type: "rectangle", version: 2, versionNonce: 7, baseVersion: 1, baseVersionNonce: 5 }],
  });
  check("replaying a stale revision conflicts", conflict.isError, true);
  check("  ...and reports stale_revision", payload(conflict).conflicts[0].reason, "stale_revision");
  check("  ...with the element's current revision", payload(conflict).conflicts[0].current, {
    version: 2,
    versionNonce: 6,
  });

  const settled = payload(await callTool("get_diagram", { id: slug }));
  check("version unchanged after the conflict", settled.version, 3);
  check("the winning revision is the one stored", settled.data.elements[0].versionNonce, 6);

  console.log(cyan("\nVersions and cleanup..."));
  check("list_versions is empty for a new diagram", payload(await callTool("list_versions", { id: slug })), []);

  await callTool("delete_diagram", { id: slug });
  slug = undefined;
  check("deleted diagram is gone", (await callTool("get_diagram", { id: slug ?? created.slug })).isError, true);
} catch (error) {
  console.error(red(`\nSmoke test errored: ${error.message}`));
  results.push(false);
} finally {
  if (slug) {
    try {
      await callTool("delete_diagram", { id: slug });
      console.log("Cleaned up test diagram.");
    } catch {
      /* best effort */
    }
  }
  child.kill();
}

const passed = results.filter(Boolean).length;
console.log("");
if (passed === results.length) {
  console.log(green(`All ${passed} MCP checks passed.`));
  process.exit(0);
}
console.log(red(`${passed}/${results.length} MCP checks passed.`));
process.exit(1);

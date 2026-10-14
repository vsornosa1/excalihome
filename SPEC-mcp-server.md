# Spec: Excalihome MCP Server

- **Module id:** `mcp-server`
- **Depends on:** `diagram-concurrency` (consumes its REST contract)
- **Provides:** nothing (leaf module)

## Objective

Give AI agents first-class access to Excalihome diagrams through the Model Context
Protocol, so an agent can list, inspect, create, edit, version, and delete drawings
it is working with. Writes that touch a diagram another agent is also editing must
be conflict-safe rather than blindly overwriting.

**User story.** As an AI agent connected over MCP, I can call `list_diagrams`,
`get_diagram`, and `patch_diagram` to read a diagram and modify specific elements.
If another agent changed the same element since I read it, the tool returns a
structured conflict so I can re-read and retry — instead of silently destroying
their work.

**Success looks like:** registering the server in an MCP client shows the tool set
below; `patch_diagram` against a stale revision returns an error result carrying
the conflicting element ids and the current diagram version.

## Tech Stack

- Node.js 18+ (global `fetch` — no HTTP client dependency).
- TypeScript 5 (`strict`), CommonJS output, matching `packages/backend`.
- `@modelcontextprotocol/sdk` (server + stdio transport), `zod` for input schemas.
- Dev: `tsx` (dev/watch), Jest 29 + `ts-jest` (unit tests).
- **Transport: stdio** (see Open Question 1 — the decisive unknown for remote
  multi-host agents).

## Commands

```bash
# Add the workspace package's dependencies
npm install @modelcontextprotocol/sdk zod -w packages/mcp-server
npm install -D typescript tsx jest ts-jest @types/jest @types/node -w packages/mcp-server

# Build
npm run build -w packages/mcp-server

# Dev (stdio; speaks MCP on stdin/stdout)
npm run dev -w packages/mcp-server

# Test
npm test -w packages/mcp-server

# Run the built server
node packages/mcp-server/dist/index.js
```

Configuration (environment):

| Variable | Default | Purpose |
|---|---|---|
| `EXCALIHOME_API_URL` | `http://localhost:3001/api` | Base URL of the Excalihome backend REST API |

## Project Structure

```
packages/mcp-server/
  package.json          # name: @excalihome/mcp-server; bin: excalihome-mcp
  tsconfig.json         # mirrors packages/backend/tsconfig.json
  jest.config.js        # mirrors packages/backend/jest.config.js
  src/
    index.ts            # entrypoint: build server, connect StdioServerTransport
    server.ts           # createServer(): registers tools on McpServer
    config.ts           # reads/validates EXCALIHOME_API_URL
    client.ts           # typed fetch wrapper over the REST API
    tools/
      diagrams.ts       # list/get/create/patch/update/delete diagram tools
      versions.ts       # list/get/create/restore version tools
  tests/
    client.test.ts      # fetch wrapper: URL, method, body, error mapping
    tools.test.ts       # tool handlers with a mocked client, incl. 409 mapping
```

## Code Style

Match the backend: double quotes, semicolons, 2-space indent, `async/await`, named
exports, no classes.

```ts
// packages/mcp-server/src/tools/diagrams.ts
server.registerTool(
  "patch_diagram",
  {
    title: "Patch diagram",
    description:
      "Add, update, or delete individual elements of a diagram. Provide each " +
      "update/delete with the baseVersion + baseVersionNonce you last read so " +
      "concurrent edits are detected instead of overwritten.",
    inputSchema: PatchDiagramInput,   // zod schema
  },
  async (input) => {
    const result = await client.patchDiagram(input);
    if (result.conflict) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify(result.conflict) }],
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(result.ok) }] };
  }
);
```

Tool results are always JSON text content. Failures use `isError: true` with a
machine-readable payload so the calling agent can branch on `code`.

## Tools

| Tool | Maps to | Notes |
|---|---|---|
| `list_diagrams` | `GET /diagrams` | id, name, slug, thumbnail, timestamps |
| `get_diagram` | `GET /diagrams/:idOrSlug` | includes `data` and `version` |
| `create_diagram` | `POST /diagrams` | optional initial `data` |
| `patch_diagram` | `POST /diagrams/:idOrSlug/patch` | **concurrency-safe write**; `add`/`update`/`delete`/`force` |
| `update_diagram` | `PUT /diagrams/:idOrSlug` | full replacement escape hatch; optional `baseVersion` |
| `delete_diagram` | `DELETE /diagrams/:idOrSlug` | destructive; describe clearly |
| `list_versions` | `GET /diagrams/:idOrSlug/versions` | |
| `get_version` | `GET /diagrams/:idOrSlug/versions/:versionId` | |
| `create_version` | `POST /diagrams/:idOrSlug/versions` | snapshot current data |
| `restore_version` | `POST /diagrams/:idOrSlug/restore/:versionId` | |

Error mapping: a backend `409` from `patch_diagram` becomes
`isError: true` with `{ code: "ELEMENT_CONFLICT", currentVersion, conflicts }`;
a backend `409` from `update_diagram` becomes `code: "STALE_DOCUMENT"`. Other
non-2xx responses become `isError: true` with `{ code: "HTTP_ERROR", status }`.
The server must **never** auto-retry with `force: true`.

## Testing Strategy

- Framework: Jest + `ts-jest`, tests in `packages/mcp-server/tests/`, run with
  `npm test -w packages/mcp-server`.
- Unit tests mock `fetch` (`client.test.ts`) and the client (`tools.test.ts`); no
  running backend or database is required for `npm test`.
- Required cases:
  - each tool builds the correct method, URL, and body;
  - `patch_diagram` maps a `409` to `isError: true` with the conflict payload;
  - `update_diagram` maps a `409` to `STALE_DOCUMENT`;
  - a 5xx maps to `HTTP_ERROR` and does not retry;
  - `config.ts` defaults to `http://localhost:3001/api` and rejects a malformed URL.
- Optional integration test gated by `EXCALIHOME_API_URL` being set; skipped
  otherwise so CI without a backend still passes.

## Boundaries

- **Always:** run `npm test -w packages/mcp-server` before proposing a commit;
  validate every tool input with a zod schema; return structured JSON so agents can
  branch on `code`; keep `EXCALIHOME_API_URL` configurable.
- **Ask first:** adding a dependency; changing the shared REST contract (that
  belongs to `SPEC-diagram-concurrency.md`); adding an HTTP/SSE transport; adding
  auth headers.
- **Never:** auto-retry a conflict with `force: true`; log diagram contents or
  credentials to stdout (stdout is the MCP protocol channel — diagnostics go to
  stderr); commit secrets; edit `dist/` or `node_modules/`.

## Success Criteria

1. `packages/mcp-server` is a workspace package that builds with
   `npm run build -w packages/mcp-server` under `strict` TypeScript.
2. `node packages/mcp-server/dist/index.js` starts and speaks MCP over stdio, and
   the ten tools above are listed by an MCP client.
3. `patch_diagram` against a stale element revision returns `isError: true` with
   the conflicting element ids and `currentVersion`, and performs no forced write.
4. `npm test -w packages/mcp-server` passes with no backend running.
5. The MCP server never writes diagram content or credentials to stdout.

## Open Questions

1. **Transport — pivotal.** This spec assumes **stdio**, which suits a local
   single-process agent. If "multiple agents concurrently edit" means agents on
   *different hosts*, a streamable HTTP/SSE transport is required instead
   (stateless, authenticated). Confirm before implementation.
2. **Auth.** stdio inherits the local trust model (the backend has no auth). If
   HTTP transport is chosen, what authenticates an agent, and does it map to a
   tenant?
3. **Packaging.** Should the server ship in `docker-compose.yml` / get a
   `Dockerfile`, or run only as a local MCP client subprocess for now?
4. **Element generation.** Should the server also expose a tool to *construct*
   Excalidraw element JSON from a description? The approved map scopes this out;
   confirm it stays out.

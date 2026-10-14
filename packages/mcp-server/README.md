# @excalihome/mcp-server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
Excalihome diagrams and their version history to AI agents.

## Tools

| Tool | Purpose |
|------|---------|
| `list_diagrams` | List diagrams, newest first |
| `get_diagram` | Get one diagram (elements, app state, current `version`) |
| `create_diagram` | Create a diagram |
| `patch_diagram` | **Concurrency-safe edit** — add/update/delete individual elements |
| `update_diagram` | Replace a diagram wholesale (optional `baseVersion` precondition) |
| `delete_diagram` | Delete a diagram and its versions |
| `list_versions` | List version snapshots |
| `get_version` | Get one snapshot |
| `create_version` | Save a snapshot |
| `restore_version` | Restore a snapshot into the live diagram |

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `EXCALIHOME_API_URL` | `http://localhost:3001/api` | Base URL of the Excalihome backend |

## Build and run

```bash
npm install
npm run build -w packages/mcp-server
node packages/mcp-server/dist/index.js
```

## Connecting an MCP client

The server speaks MCP over **stdio**, so it runs as a subprocess of the client.
Register it in the client's MCP configuration, for example:

```json
{
  "mcpServers": {
    "excalihome": {
      "command": "node",
      "args": ["/absolute/path/to/excalihome/packages/mcp-server/dist/index.js"],
      "env": { "EXCALIHOME_API_URL": "http://localhost:3001/api" }
    }
  }
}
```

Start the Excalihome backend first (`docker compose up -d db backend`, or
`npm run dev -w packages/backend`).

## Why stdio

The backend has no authentication and is intended for local, single-user use.
stdio inherits that local trust model and needs no ports, TLS, or credentials. If
agents must connect from other hosts, this transport is the piece to replace with
streamable HTTP plus authentication — the tool layer above it is unaffected.

## Editing diagrams safely

Several agents can edit one diagram at once. `patch_diagram` sends element-level
operations, each `update`/`delete` carrying the `baseVersion` and
`baseVersionNonce` the caller last read:

- edits to **different** elements from different agents all apply;
- edits to the **same** element resolve to one winner; the loser gets
  `isError: true` with `code: "ELEMENT_CONFLICT"`, `currentVersion`, and the
  conflicting element ids.

On a conflict the agent should re-read the diagram and retry. The server never
retries automatically and never sets `force` on the caller's behalf — `force: true`
is an explicit last-write-wins override.

## Tests

```bash
npm test -w packages/mcp-server
```

Unit tests mock `fetch`, so they need no running backend or database.

> Diagnostics are written to **stderr**; stdout carries the MCP protocol and must
> stay clean.

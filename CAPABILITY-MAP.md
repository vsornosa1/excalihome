# Capability Map: Excalihome MCP Server

Status: **approved** (2026-10-14)

## Definition

"Multitenant" for this initiative means: **more than one agent can concurrently edit
the same diagram at the same time without lost updates.** Per-tenant data isolation
(separate namespaces/accounts per agent) is *not* implied by this map; it is an open
question, not a requirement.

## Modules

| Module id | Responsibility | Depends on |
|---|---|---|
| `diagram-concurrency` | Backend document version counter and element-level patch endpoint with per-element conflict detection (rejects overlapping edits with 409, allows non-overlapping concurrent edits) | — |
| `mcp-server` | stdio MCP server exposing diagram and version tools to AI agents; surfaces patch conflicts as structured tool errors | `diagram-concurrency` |

Build order: `diagram-concurrency` → `mcp-server`

## Boundary contracts

- `mcp-server` consumes the REST contract owned by `diagram-concurrency`
  (version/etag + element-level patch + conflict response shape). That contract is
  specified in `SPEC-diagram-concurrency.md`, not duplicated here.
- No cycles: only `mcp-server` → `diagram-concurrency`.

## Explicitly out of scope

- Real-time live sync (websockets/SSE) and CRDT/OT continuous merging.
- Sequential exclusive locking / edit queues.
- Authentication and per-tenant isolation.
- Diagram generation from natural language (AI-draws-diagrams).

## Index

- `CAPABILITY-MAP.md` (this file) — the index of what exists.
- `SPEC-diagram-concurrency.md` — module spec.
- `SPEC-mcp-server.md` — module spec.

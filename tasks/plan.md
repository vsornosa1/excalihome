# Implementation Plan: Excalihome MCP Server + Element-Level Concurrency

## Overview

We are adding two modules, in dependency order: `diagram-concurrency` (backend
optimistic concurrency and an element-level patch endpoint, so several agents can
edit one diagram without clobbering each other) and `mcp-server` (a stdio MCP server
that exposes diagrams and versions as tools and surfaces conflicts as structured
errors). Approved specs: `SPEC-diagram-concurrency.md`, `SPEC-mcp-server.md`; module
boundaries: `CAPABILITY-MAP.md`.

**Task list target:** `tasks/todo.md` (default markdown checklist; no external
tracker is configured in this repository).

## Architecture Decisions

- **Element revision identity reuses Excalidraw's `(version, versionNonce)`** rather
  than a server-assigned per-element counter. No new table, and the identity travels
  with the element through export/import. Risk noted below.
- **Row lock, not advisory lock.** The patch handler runs in a transaction with
  `SELECT … FOR UPDATE` on the diagram row. This serializes concurrent writers and
  removes the read-modify-write race without introducing lock-management code.
- **Conflict detection is per element, not per document.** `baseVersion` is a
  descriptive ETag, never a hard precondition on the patch path — otherwise a
  document-level check would reject the disjoint concurrent edits we explicitly want
  to allow.
- **`PUT` stays last-write-wins and backwards compatible.** `baseVersion` /`If-Match`
  on `PUT` are optional. This keeps the existing frontend and `tests/diagrams.test.ts`
  green, so the backend can ship before the frontend adopts the patch path.
- **MCP server is a separate workspace package consuming the REST API**, not a direct
  database client. It reuses the API's contract and the repo's own auth-free local
  trust model.
- **stdio transport**, per the approved spec. This is the plan's single biggest
  external assumption (see Open Questions).
- **No new linter/build tooling.** Reuse `tsc` + Jest + supertest already present.
- **Tasks are sliced vertically:** backend slice = "an agent can safely patch a
  diagram" (migration → version on read → patch endpoint → race test); MCP slice =
  "an agent can call a tool and act on its result" (scaffold → client → tools →
  conflict mapping → live MCP check).

## Task List

### Phase 1: Foundation — `diagram-concurrency`

- [x] Task 1: Add `diagrams.version` migration
- [x] Task 2: Element revision helpers (`lib/elements.ts`)
- [ ] Task 3: Expose `version` + `ETag` on read/list

### Checkpoint: Foundation
- [ ] `npm run build -w packages/backend` passes
- [ ] `npm test -w packages/backend` passes (existing suite unchanged)
- [ ] Migration applies cleanly to a database with existing rows
- [ ] Review with human before proceeding

### Phase 2: Core concurrency — `diagram-concurrency`

- [ ] Task 4: `POST /api/diagrams/:id/patch` happy path + conflict detection
- [ ] Task 5: `force` escape hatch and optional `baseVersion`/`If-Match` on `PUT`
- [ ] Task 6: Parallel race test proving no lost updates

### Checkpoint: Core Features (module `diagram-concurrency` complete)
- [ ] Disjoint concurrent edits both commit; overlapping edits yield exactly one 409
- [ ] Rejected patches leave the document byte-identical and do not bump `version`
- [ ] Review with human before proceeding

### Phase 3: MCP foundation — `mcp-server`

- [ ] Task 7: Scaffold `packages/mcp-server` (package, tsconfig, jest, config)
- [ ] Task 8: Typed REST client with error mapping

### Checkpoint: MCP Foundation
- [ ] `npm run build -w packages/mcp-server` passes
- [ ] `npm test -w packages/mcp-server` passes with no backend running
- [ ] Review with human before proceeding

### Phase 4: MCP tools — `mcp-server`

- [ ] Task 9: Server bootstrap + stdio transport + diagram read/create/delete tools
- [ ] Task 10: `patch_diagram` with structured conflict mapping
- [ ] Task 11: Version tools (list/get/create/restore)
- [ ] Task 12: Public API shape (all 10 tools) + live MCP client check + docs

### Checkpoint: Complete
- [ ] All ten tools listed by an MCP client
- [ ] `patch_diagram` on a stale revision returns `isError: true` with conflicts and forces nothing
- [ ] Both packages build; both test suites pass
- [ ] Ready for review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `(version, versionNonce)` may not faithfully identify an element revision (e.g. a client that omits `versionNonce`) | High — conflict detection silently fails open | Task 2 centralizes revision extraction and defaults missing fields deterministically; Task 4 requires an explicit test for a missing-`versionNonce` update; confirm with the human (spec Open Question 1) |
| Read-modify-write race between two simultaneous patches | High — lost update, defeating the module's purpose | Row lock (`FOR UPDATE`) in Task 4; Task 6 adds a real parallel test, not just sequential assertions |
| Backend tests require a live PostgreSQL | Medium — test suite fails for anyone without a DB | Reuse the existing convention (tests already require `DATABASE_URL`); document the command in the spec and plan |
| MCP SDK API surface differs from `registerTool` sketch | Medium — rework in Tasks 9–11 | Pin the SDK version in Task 7 and verify the actual tool-registration API before writing ten tools |
| stdio transport may be wrong for cross-host agents | High — invalidates the MCP module's deployment model | Explicit spec open question; raised with the human before implementation; Tasks 7–12 are transport-agnostic enough that the tool layer survives a later HTTP transport |
| Emitting logs to stdout breaks the MCP protocol channel | Medium — client disconnects or misparses | Boundary rule in the spec; Task 9 routes all diagnostics to stderr and Task 12 asserts stdout carries only protocol frames |
| Scope creep into element generation / real-time sync | Medium — unbounded scope | Explicitly out of scope in `CAPABILITY-MAP.md`; no task references them |

## Parallelization Opportunities

- **Safe to parallelize:** Task 2 (`lib/elements.ts`) is independent of Task 1 and
  Task 3. Tasks 7–8 (MCP scaffold + client) depend only on the *published contract*,
  not on the backend code landing, so they may proceed in parallel with Tasks 4–6.
- **Must be sequential:** Task 1 → Task 3 → Task 4 (the patch handler reads
  `version` and is exercised by Tasks 5–6). Task 7 → Task 8 → Tasks 9–12.
- **Needs coordination:** Tasks 9–11 all edit `src/server.ts` and
  `tests/tools.test.ts`; run them sequentially or serialize edits to those files.
  The REST contract is already frozen in `SPEC-diagram-concurrency.md`, so the
  backend/MCP boundary needs no further negotiation.

## Verification Checkpoints

Checkpoints sit after Phases 1, 2, 3, and 4 (see Task List). Each requires the
focused build + test command for the module in flight. No checkpoint is skipped.

## Open Questions

- **Transport (pivotal):** stdio assumes local subprocess agents. If agents run on
  different hosts, Task 7's scaffold picks the wrong transport and Tasks 9–12 need
  rework around streamable HTTP/SSE plus auth.
- **Revision token:** is `(version, versionNonce)` acceptable, or a server-assigned
  per-element counter? Affects Tasks 2, 4, and 5.
- **Tenant isolation:** stay in the shared anonymous namespace, or add scoping? Affects
  Tasks 1 and 3 (would add a `user_id`/tenant predicate).
- **`PUT` deprecation:** should the frontend migrate to `patch`/`If-Match` later?
- **Packaging:** should `packages/mcp-server` get a Dockerfile / Compose entry?

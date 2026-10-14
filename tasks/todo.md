# Task List: Excalihome MCP Server + Element-Level Concurrency

Plan: `tasks/plan.md` · Specs: `SPEC-diagram-concurrency.md`, `SPEC-mcp-server.md`

Legend: `[ ]` pending · `[x]` done. Check tasks off as they complete; do not
reorder across phases.

---

## Phase 1: Foundation — `diagram-concurrency`

### Task 1: Add `diagrams.version` migration

**Description:** Add a monotonically increasing document version column to
`diagrams` so reads can expose an ETag and writes can report the resulting version.
Backfill existing rows to `1` and keep the column non-nullable.

**Acceptance criteria:**
- [x] `postgres/init/004_diagram_versioning.sql` adds `version INTEGER NOT NULL DEFAULT 1` idempotently (`ADD COLUMN IF NOT EXISTS`)
- [x] Existing rows have `version = 1` after the migration runs
- [x] Migration applies cleanly to a database that already contains diagrams

**Verification:**
- [x] Manual check: `docker compose exec -T db psql -U excalihome -d excalihome < postgres/init/004_diagram_versioning.sql` succeeds
- [x] Manual check: `SELECT count(*) FROM diagrams WHERE version IS NULL` returns `0`

**Dependencies:** None
**Files likely touched:** `postgres/init/004_diagram_versioning.sql`
**Estimated scope:** XS (1 file)

---

### Task 2: Element revision helpers (`lib/elements.ts`)

**Description:** Centralize the element revision identity used by conflict
detection: extract `(version, versionNonce)` with deterministic defaults for missing
fields, compare revisions, and index elements by `id`.

**Acceptance criteria:**
- [x] `revisionOf`, `sameRevision`, and `indexElements` are exported from `packages/backend/src/lib/elements.ts`
- [x] A missing `version` or `versionNonce` resolves deterministically (documented default), not `NaN`/`undefined`
- [x] Unit tests cover equal revisions, differing `version`, differing `versionNonce`, and missing fields

**Verification:**
- [x] Tests pass: `npm test -w packages/backend -- tests/elements.test.ts`
- [x] Build succeeds: `npm run build -w packages/backend`

**Dependencies:** None
**Files likely touched:** `packages/backend/src/lib/elements.ts`, `packages/backend/tests/elements.test.ts`
**Estimated scope:** S (2 files)

---

### Task 3: Expose `version` + `ETag` on read/list

**Description:** Return the document `version` from detail reads and set an `ETag`
header so callers can record the revision they read. Keep every existing field and
the `LIST_COLS`/`DETAIL_COLS` behavior intact so the frontend is unaffected.

**Acceptance criteria:**
- [x] `GET /api/diagrams/:idOrSlug` includes `version` in the body
- [x] `GET /api/diagrams/:idOrSlug` sets `ETag: W/"<version>"`
- [x] Existing `tests/diagrams.test.ts` assertions still pass unmodified
- [x] `POST /api/diagrams` still returns `201` with the existing fields

**Verification:**
- [x] Tests pass: `npm test -w packages/backend`
- [x] Build succeeds: `npm run build -w packages/backend`
- [x] Manual check: `curl -i http://localhost:3001/api/diagrams/<slug>` shows the `ETag` header

**Dependencies:** Task 1
**Files likely touched:** `packages/backend/src/routes/diagrams.ts`, `packages/backend/tests/diagrams.test.ts`
**Estimated scope:** S (2 files)

---

## Checkpoint: Foundation

- [x] `npm run build -w packages/backend` passes
- [x] `npm test -w packages/backend` passes
- [x] Migration applies cleanly with existing rows present
- [ ] Review with human before proceeding

---

## Phase 2: Core concurrency — `diagram-concurrency`

### Task 4: `POST /api/diagrams/:id/patch` happy path + conflict detection

**Description:** Implement the element-level patch endpoint. Inside one transaction
holding a row lock, classify `add`/`update`/`delete` entries, reject the whole
request with `409 ELEMENT_CONFLICT` if any revision is stale or an id is missing,
otherwise apply the changes and increment `version`.

**Acceptance criteria:**
- [x] Applying `add` + `update` + `delete` in one request returns `200` with `version` and an `applied` summary
- [x] `add` of an existing id → `409` with reason `already_exists`
- [x] `update`/`delete` of a missing id → `409` with reason `not_found`
- [x] `update`/`delete` with a mismatched revision → `409` with reason `stale_revision` and the element's current revision
- [x] On any conflict the document is unchanged and `version` is not incremented (atomic)
- [x] Concurrent access is serialized via `SELECT … FOR UPDATE` inside a transaction

**Verification:**
- [x] Tests pass: `npm test -w packages/backend -- tests/patch.test.ts`
- [x] Build succeeds: `npm run build -w packages/backend`
- [x] Manual check: rejected patch leaves `SELECT version FROM diagrams` unchanged

**Dependencies:** Tasks 1, 2, 3
**Files likely touched:** `packages/backend/src/routes/patch.ts`, `packages/backend/src/index.ts`, `packages/backend/tests/patch.test.ts`
**Estimated scope:** M (3 files)

---

### Task 5: `force` escape hatch and optional `baseVersion`/`If-Match` on `PUT`

**Description:** Add the explicit last-write-wins escape hatch (`force: true`) to the
patch endpoint, and let `PUT` accept an optional `baseVersion` body field or
`If-Match` header that returns `409 STALE_DOCUMENT` when stale. `PUT` without either
must behave exactly as before, still incrementing `version`.

**Acceptance criteria:**
- [x] `patch` with `force: true` overwrites a stale element instead of returning `409`
- [x] `PUT` with a stale `baseVersion` returns `409` with `code: "STALE_DOCUMENT"`
- [x] `PUT` with a matching `baseVersion` or `If-Match` succeeds and increments `version`
- [x] `PUT` with no precondition succeeds exactly as before (backwards compatible)
- [x] `force` still applies all changes atomically (no partial application)

**Verification:**
- [x] Tests pass: `npm test -w packages/backend`
- [x] Build succeeds: `npm run build -w packages/backend`

**Dependencies:** Task 4
**Files likely touched:** `packages/backend/src/routes/patch.ts`, `packages/backend/src/routes/diagrams.ts`, `packages/backend/tests/patch.test.ts`
**Estimated scope:** M (3 files)

---

### Task 6: Parallel race test proving no lost updates

**Description:** Add the concurrency tests that actually exercise the race: two
writers sharing a base revision, editing disjoint elements concurrently, must both
commit; two writers editing the same element concurrently must produce exactly one
success and one `409`.

**Acceptance criteria:**
- [x] Two `Promise.all` patches on disjoint elements both return `200` and leave both edits present
- [x] `version` advances by exactly 2 for the disjoint case
- [x] Two `Promise.all` patches on the same element yield exactly one `200` and one `409 ELEMENT_CONFLICT`
- [x] The winning edit is present and the losing edit is absent (no merge corruption)
- [x] A deterministic test proves the row lock is what prevents the lost update (fails when `FOR UPDATE` is removed)

**Verification:**
- [x] Tests pass: `npm test -w packages/backend -- tests/patch.test.ts`
- [x] Manual check: run the concurrency test file repeatedly and confirm it is not flaky (4 consecutive runs green)

**Dependencies:** Tasks 4, 5
**Files likely touched:** `packages/backend/tests/patch.test.ts`
**Estimated scope:** S (1 file)

---

## Checkpoint: Core Features (module `diagram-concurrency` complete)

- [x] Disjoint concurrent edits both commit; overlapping edits yield exactly one `409`
- [x] Rejected patches leave the document byte-identical and do not bump `version`
- [x] `npm test -w packages/backend` is green and not flaky across repeated runs
- [ ] Review with human before proceeding

---

## Phase 3: MCP foundation — `mcp-server`

### Task 7: Scaffold `packages/mcp-server`

**Description:** Create the workspace package with a `package.json`, TypeScript and
Jest config mirroring the backend, and a validated `EXCALIHOME_API_URL` config module
defaulting to `http://localhost:3001/api`.

**Acceptance criteria:**
- [x] `packages/mcp-server` is picked up by the root `workspaces` glob and `npm install` succeeds
- [x] `tsconfig.json` and `jest.config.js` mirror the backend (`strict`, CommonJS, roots `tests`)
- [x] `config.ts` defaults to `http://localhost:3001/api`, honors the env var, and rejects a malformed URL
- [x] The MCP SDK and `zod` versions are pinned, and the actual tool-registration API is confirmed against them

**Verification:**
- [x] Build succeeds: `npm run build -w packages/mcp-server`
- [x] Tests pass: `npm test -w packages/mcp-server -- tests/config.test.ts`

**Dependencies:** None (consumes the spec's frozen contract)
**Files likely touched:** `packages/mcp-server/package.json`, `packages/mcp-server/tsconfig.json`, `packages/mcp-server/jest.config.js`, `packages/mcp-server/src/config.ts`, `packages/mcp-server/tests/config.test.ts`
**Estimated scope:** M (5 files)

---

### Task 8: Typed REST client with error mapping

**Description:** Build the `fetch` wrapper the tools use: correct method/URL/body per
endpoint, JSON parsing, and normalization of non-2xx responses into a result that
distinguishes `ELEMENT_CONFLICT`, `STALE_DOCUMENT`, and generic `HTTP_ERROR`, without
retrying.

**Acceptance criteria:**
- [x] Each documented endpoint is reachable through one typed method
- [x] `409` with `code: ELEMENT_CONFLICT` surfaces `currentVersion` and `conflicts` to the caller
- [x] `409 STALE_DOCUMENT` is distinguished from `ELEMENT_CONFLICT`
- [x] A `5xx` maps to `HTTP_ERROR` and triggers exactly one request (no retry)
- [x] `EXCALIHOME_API_URL` is used as the base for every request

**Verification:**
- [x] Tests pass: `npm test -w packages/mcp-server -- tests/client.test.ts`
- [x] Build succeeds: `npm run build -w packages/mcp-server`

**Dependencies:** Task 7
**Files likely touched:** `packages/mcp-server/src/client.ts`, `packages/mcp-server/tests/client.test.ts`
**Estimated scope:** S (2 files)

---

## Checkpoint: MCP Foundation

- [x] `npm run build -w packages/mcp-server` passes
- [x] `npm test -w packages/mcp-server` passes with no backend running
- [ ] Review with human before proceeding

---

## Phase 4: MCP tools — `mcp-server`

### Task 9: Server bootstrap, stdio transport, and diagram read/create/delete tools

**Description:** Wire an `McpServer` to the stdio transport and register
`list_diagrams`, `get_diagram`, `create_diagram`, and `delete_diagram`, with zod input
schemas and JSON text results. All diagnostics go to stderr.

**Acceptance criteria:**
- [ ] `node packages/mcp-server/dist/index.js` starts and speaks MCP over stdio
- [ ] `list_diagrams`, `get_diagram`, `create_diagram`, `delete_diagram` are registered with titles, descriptions, and zod schemas
- [ ] Tool handlers return JSON text content
- [ ] Nothing is written to stdout except MCP protocol frames
- [ ] `get_diagram` exposes the document `version` to the caller

**Verification:**
- [ ] Tests pass: `npm test -w packages/mcp-server -- tests/tools.test.ts`
- [ ] Build succeeds: `npm run build -w packages/mcp-server`
- [ ] Manual check: stdout of a run contains only protocol frames (diagnostics on stderr)

**Dependencies:** Task 8
**Files likely touched:** `packages/mcp-server/src/index.ts`, `packages/mcp-server/src/server.ts`, `packages/mcp-server/src/tools/diagrams.ts`, `packages/mcp-server/tests/tools.test.ts`
**Estimated scope:** M (4 files)

---

### Task 10: `patch_diagram` with structured conflict mapping

**Description:** Register the concurrency-safe write tool. It forwards
`add`/`update`/`delete`/`force`, and maps a backend `ELEMENT_CONFLICT` into an
`isError: true` result carrying `code`, `currentVersion`, and `conflicts` so the agent
can re-read and retry.

**Acceptance criteria:**
- [ ] `patch_diagram` builds the correct `POST …/patch` request including per-element base revisions
- [ ] A backend `ELEMENT_CONFLICT` becomes `isError: true` with `code`, `currentVersion`, and `conflicts`
- [ ] The tool never auto-retries and never sets `force: true` on its own
- [ ] A successful patch returns the new `version`

**Verification:**
- [ ] Tests pass: `npm test -w packages/mcp-server -- tests/tools.test.ts`
- [ ] Build succeeds: `npm run build -w packages/mcp-server`

**Dependencies:** Task 9
**Files likely touched:** `packages/mcp-server/src/tools/diagrams.ts`, `packages/mcp-server/tests/tools.test.ts`
**Estimated scope:** S (2 files)

---

### Task 11: Version tools (list/get/create/restore)

**Description:** Register `list_versions`, `get_version`, `create_version`, and
`restore_version` against the existing versions endpoints.

**Acceptance criteria:**
- [ ] All four version tools are registered with descriptions and zod schemas
- [ ] `restore_version` is described as mutating the live diagram
- [ ] A non-2xx from any version tool returns `isError: true` with a `code`
- [ ] `update_diagram` (`PUT`, with optional `baseVersion`) is registered and maps `STALE_DOCUMENT`

**Verification:**
- [ ] Tests pass: `npm test -w packages/mcp-server -- tests/tools.test.ts`
- [ ] Build succeeds: `npm run build -w packages/mcp-server`

**Dependencies:** Task 10
**Files likely touched:** `packages/mcp-server/src/tools/versions.ts`, `packages/mcp-server/src/server.ts`, `packages/mcp-server/tests/tools.test.ts`
**Estimated scope:** M (3 files)

---

### Task 12: Public API shape, live MCP check, and docs

**Description:** Confirm all ten tools are registered and documented, verify the
server against a real MCP client end-to-end, and document how to build, configure, and
connect the server.

**Acceptance criteria:**
- [x] An MCP client lists exactly the ten specified tools with no duplicates
- [x] `patch_diagram` against a stale revision, run live, returns `isError: true` and mutates nothing
- [x] Documentation states the required `EXCALIHOME_API_URL` variable and the `node packages/mcp-server/dist/index.js` run command
- [x] Documentation records that transport is stdio and why

**Verification:**
- [x] Manual check: connect a real MCP client and exercise `list_diagrams` + `get_diagram` + a conflicting `patch_diagram` (18/18 live checks passed)
- [x] Tests pass: `npm test -w packages/mcp-server`
- [x] Build succeeds: `npm run build -w packages/mcp-server`

**Dependencies:** Task 11
**Files likely touched:** `packages/mcp-server/README.md`, `README.md`, `packages/mcp-server/tests/tools.test.ts`
**Estimated scope:** S (3 files)

---

## Checkpoint: Complete

- [x] All ten tools listed by an MCP client
- [x] `patch_diagram` on a stale revision returns `isError: true` and forces nothing
- [x] `npm run build -w packages/backend` and `npm run build -w packages/mcp-server` pass
- [x] `npm test -w packages/backend` and `npm test -w packages/mcp-server` pass
- [ ] Ready for review

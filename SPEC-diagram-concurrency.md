# Spec: Element-Level Optimistic Concurrency for Diagrams

- **Module id:** `diagram-concurrency`
- **Depends on:** —
- **Provides:** the REST contract consumed by `mcp-server` (see `CAPABILITY-MAP.md`)

## Objective

Today `PUT /api/diagrams/:id` overwrites the whole `data` JSONB column with no
concurrency control, so two agents editing the same diagram clobber each other
(last-write-wins). This module makes concurrent edits safe.

**User story.** As an AI agent, I can add, update, and delete individual
Excalidraw elements in a diagram knowing that (a) my changes are applied
atomically, and (b) if another agent changed the same element since I read it, my
write is rejected with a conflict I can resolve — while edits to *different*
elements by different agents both succeed.

**Definition.** "Multiple agents concurrently edit the same diagram" means *no
lost updates and per-element conflict detection*, not real-time live sync. CRDT/OT
continuous merging, websockets/SSE, and exclusive edit locks are out of scope.

**Success looks like:** two agents that read version 5 of a diagram and edit
disjoint elements both commit successfully (version becomes 6, then 7); two agents
that edit the *same* element both based on revision X have exactly one succeed and
the other receive `409 ELEMENT_CONFLICT` naming that element.

## Tech Stack

- Node.js 18+, Express 4, TypeScript 5 (`strict`), `pg` 8.
- PostgreSQL 15 — JSONB element storage (existing).
- Jest 29 + `ts-jest` + `supertest` (existing test setup).
- Element revision identity reuses Excalidraw's own `version` + `versionNonce`
  fields, so no extra per-element table is needed.

## Commands

```bash
# Build backend
npm run build -w packages/backend

# Run tests (requires a reachable PostgreSQL at DATABASE_URL)
npm test -w packages/backend

# Run a single test file
npm test -w packages/backend -- tests/patch.test.ts

# Dev server (tsx watch)
npm run dev -w packages/backend

# Apply the new migration to a running database
psql "$DATABASE_URL" -f postgres/init/004_diagram_versioning.sql

# Apply inside the Docker stack
docker compose exec -T db psql -U excalihome -d excalihome < postgres/init/004_diagram_versioning.sql
```

> The `postgres/init/` scripts only run on a **fresh** `db_data` volume. If the
> volume already exists, apply `004` manually with the command above.

> No linter is configured in this repository; do not add one for this change.

## Project Structure

```
postgres/init/
  004_diagram_versioning.sql   # NEW: diagrams.version counter + index
packages/backend/src/
  index.ts                     # mount the new patch router
  routes/
    diagrams.ts                # MODIFIED: version in SELECTs, ETag, optional baseVersion on PUT
    patch.ts                   # NEW: POST /:id/patch — element-level patch in a transaction
  lib/
    elements.ts                # NEW: revision identity + conflict detection helpers
packages/backend/tests/
  diagrams.test.ts             # MODIFIED: existing tests keep passing (version present)
  patch.test.ts                # NEW: concurrency + conflict tests
```

## Code Style

Existing conventions: double quotes, semicolons, 2-space indent, `async/await`,
named `export default router` for routers, no classes. Type the response contract
explicitly.

```ts
// packages/backend/src/lib/elements.ts
export type ElementRevision = { version: number; versionNonce: number };

export function revisionOf(element: { version?: number; versionNonce?: number }): ElementRevision {
  return { version: element.version ?? 0, versionNonce: element.versionNonce ?? 0 };
}

export function sameRevision(a: ElementRevision, b: ElementRevision): boolean {
  return a.version === b.version && a.versionNonce === b.versionNonce;
}

export function indexElements(elements: any[]): Map<string, any> {
  return new Map(elements.map((el) => [el.id, el]));
}
```

Router sketch (note the transaction and row lock — this is what actually
serializes concurrent writers):

```ts
// packages/backend/src/routes/patch.ts
router.post("/:id/patch", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, data, version FROM diagrams
       WHERE id::text = $1 OR slug = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (!rows.length) { await client.query("ROLLBACK"); res.status(404).json({ error: "Diagram not found" }); return; }
    // ...detect conflicts -> 409; else apply, version = version + 1, COMMIT
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});
```

## REST Contract (owned here; consumed by `mcp-server`)

### `GET /api/diagrams/:idOrSlug`

Response body adds `version: number`; response carries header
`ETag: W/"<version>"`. Existing fields unchanged.

### `POST /api/diagrams/:idOrSlug/patch`

Request:

```json
{
  "add": [ { "id": "el-1", "type": "rectangle", "version": 1, "versionNonce": 1234 } ],
  "update": [ { "id": "el-2", "type": "ellipse", "version": 6, "versionNonce": 777,
                "baseVersion": 5, "baseVersionNonce": 111 } ],
  "delete": [ { "id": "el-3", "baseVersion": 4, "baseVersionNonce": 222 } ],
  "force": false
}
```

Semantics (all-or-nothing, evaluated inside one transaction holding the row lock):

1. `add` — if an element with that `id` already exists → conflict `already_exists`;
   otherwise append it.
2. `update` — the element must exist (else conflict `not_found`) and its current
   revision must equal `{baseVersion, baseVersionNonce}` (else conflict
   `stale_revision`); otherwise replace it with the provided element.
3. `delete` — must exist (else conflict `not_found`) with a matching revision
   (else `stale_revision`); otherwise remove it.
4. `force: true` skips revision checks for `update`/`delete` (explicit
   last-write-wins escape hatch; still all-or-nothing).
5. On success: increment `diagrams.version` by 1, write `data`, return the new
   version. `updated_at` is set by the existing trigger.

Validation (rejected with `400` before any database work):

- `add`, `update`, `delete` must be arrays and `force` must be a boolean, else
  `400 INVALID_REQUEST`.
- Every entry needs a non-empty string `id`, else `400 INVALID_ELEMENT`.
- Unless `force` is true, `update` and `delete` entries need finite numeric
  `baseVersion` and `baseVersionNonce`, else `400 MISSING_PRECONDITION`. Applying
  a write whose precondition was never supplied cannot be verified, so it is
  refused rather than treated as last-write-wins.

The `baseVersion` / `baseVersionNonce` precondition fields are stripped before the
element is stored, so diagram data stays valid Excalidraw JSON.

Serialization: the read is `SELECT … FOR UPDATE`, so the read-modify-write is
atomic. Without the row lock two writers can both read the pre-state, both pass the
conflict check, and the second silently overwrites the first. This is covered by a
deterministic test (`tests/patch.test.ts`, "prevents a lost update…") that holds the
row in one transaction and confirms the two competing patches are rejected/accepted
one-and-one rather than both applying.

Success `200`:

```json
{ "id": "…", "version": 13, "applied": { "added": 1, "updated": 1, "deleted": 1 },
  "updated_at": "2026-10-14T19:00:00.000Z" }
```

Conflict `409` (nothing was applied):

```json
{
  "error": "Conflict",
  "code": "ELEMENT_CONFLICT",
  "currentVersion": 12,
  "conflicts": [
    { "id": "el-2", "reason": "stale_revision",
      "current": { "version": 6, "versionNonce": 999 } },
    { "id": "el-3", "reason": "not_found" }
  ]
}
```

### `PUT /api/diagrams/:idOrSlug` (backwards compatible)

- Remains last-write-wins and keeps the existing frontend working.
- Accepts an **optional** `baseVersion`; when supplied and stale → `409` with
  `code: "STALE_DOCUMENT"`. When omitted, behavior is unchanged except that
  `version` is incremented on every successful write.
- Also accepts an optional `If-Match: W/"<version>"` header as an alternative to
  `baseVersion`.

## Testing Strategy

- Framework: Jest + `ts-jest` + `supertest`, tests in `packages/backend/tests/`,
  run with `npm test -w packages/backend`.
- Tests hit a real PostgreSQL (existing pattern); `afterAll` closes the pool.
- Required cases in `patch.test.ts`:
  - disjoint concurrent edits both succeed and version increments twice;
  - same-element concurrent edits → exactly one `200`, one `409 ELEMENT_CONFLICT`;
  - `add` of an existing id → `409 already_exists`; `update`/`delete` of a missing
    id → `409 not_found`;
  - a rejected patch leaves the document byte-identical and does not bump `version`;
  - `force: true` overwrites a stale element;
  - `PUT` with a stale `baseVersion` → `409 STALE_DOCUMENT`; without it still `200`;
  - a deterministic lock test (hold the row in another transaction) that yields
    `[200, 409]` with the lock and `[200, 200]` without it, proving the row lock is
    load-bearing rather than incidental.
- Concurrency cases use `Promise.all` on two supertest requests sharing a base
  revision.
- Coverage expectation: every branch of the conflict classifier has a test.

## Boundaries

- **Always:** run `npm test -w packages/backend` before proposing a commit; keep
  the patch operation atomic (no partial application); return the current
  revision of a conflicting element so the caller can retry; keep existing
  diagram endpoints and the current frontend working unchanged.
- **Ask first:** adding any dependency; changing the shape of an existing response
  field; making `baseVersion` mandatory on `PUT`; adding tenant/user scoping.
- **Never:** commit the `.env` file or credentials; make the patch endpoint
  partially apply on conflict; silently downgrade a `409` to last-write-wins
  without an explicit `force: true`; edit `dist/` or `node_modules/`.

## Success Criteria

1. `postgres/init/004_diagram_versioning.sql` adds a `version` column that starts
   at `1` for existing rows and is never null.
2. `GET /api/diagrams/:id` returns `version` and sets `ETag`.
3. `POST /api/diagrams/:id/patch` applies disjoint concurrent edits from two
   clients without losing either (verified by test).
4. Overlapping edits produce exactly one `409 ELEMENT_CONFLICT` naming the
   conflicting element ids, and zero rows are modified by the rejected request.
5. The existing suite (`tests/diagrams.test.ts`) still passes untouched.
6. `npm run build -w packages/backend` succeeds with `strict` TypeScript.

## Open Questions

1. **Revision token.** The contract assumes Excalidraw's
   `(version, versionNonce)` pair identifies an element revision. Confirm that is
   acceptable, or switch to a server-assigned per-element revision counter.
2. **Tenant isolation.** The map defines "multitenant" as concurrent editing only.
   Should diagrams be isolated per agent/tenant (auth + `user_id` scoping), or stay
   in the shared anonymous namespace as today?
3. **`PUT` deprecation.** Should the frontend be migrated to `patch`/`If-Match`
   later, and should `PUT` then be deprecated?

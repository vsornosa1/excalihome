import { Router } from "express";
import pool from "../db";
import { indexElements, revisionOf, sameRevision } from "../lib/elements";

const router = Router();

type Element = { id: string; version?: number; versionNonce?: number; [key: string]: unknown };

type ConflictReason = "already_exists" | "not_found" | "stale_revision";

type Conflict = {
  id: string;
  reason: ConflictReason;
  current?: { version: number; versionNonce: number };
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Drops the precondition fields so they never reach stored diagram data. */
function withoutPrecondition(entry: Record<string, unknown>): Element {
  const { baseVersion, baseVersionNonce, ...element } = entry;
  return element as Element;
}

/** The revision the caller claims to have read. Validated as finite numbers upstream. */
function baseRevisionOf(entry: Element) {
  return {
    version: Number(entry.baseVersion ?? 0),
    versionNonce: Number(entry.baseVersionNonce ?? 0),
  };
}

router.post("/:id/patch", async (req, res) => {
  const body = req.body ?? {};
  const add: Element[] = Array.isArray(body.add) ? body.add : [];
  const update: Element[] = Array.isArray(body.update) ? body.update : [];
  const remove: Element[] = Array.isArray(body.delete) ? body.delete : [];

  if (
    (body.add !== undefined && !Array.isArray(body.add)) ||
    (body.update !== undefined && !Array.isArray(body.update)) ||
    (body.delete !== undefined && !Array.isArray(body.delete)) ||
    (body.force !== undefined && typeof body.force !== "boolean")
  ) {
    res.status(400).json({ error: "add, update and delete must be arrays", code: "INVALID_REQUEST" });
    return;
  }

  const force = body.force === true;
  const preconditionsOff = force;

  const malformed = [...add, ...update, ...remove].find(
    (entry) => typeof entry?.id !== "string" || entry.id.length === 0
  );
  if (malformed) {
    res.status(400).json({ error: "Every entry requires a string id", code: "INVALID_ELEMENT" });
    return;
  }

  if (!preconditionsOff) {
    const missingPrecondition = [...update, ...remove].find(
      (entry) => !isFiniteNumber(entry.baseVersion) || !isFiniteNumber(entry.baseVersionNonce)
    );
    if (missingPrecondition) {
      res.status(400).json({
        error: "baseVersion and baseVersionNonce are required for update and delete unless force is true",
        code: "MISSING_PRECONDITION",
      });
      return;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the row so concurrent patches serialize instead of racing.
    const { rows } = await client.query(
      `SELECT id, data, version FROM diagrams
       WHERE id::text = $1 OR slug = $1 FOR UPDATE`,
      [req.params.id]
    );

    if (!rows.length) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Diagram not found" });
      return;
    }

    const row = rows[0];
    const data = row.data ?? {};
    const elements: Element[] = Array.isArray(data.elements) ? data.elements : [];
    const index = indexElements(elements);
    const conflicts: Conflict[] = [];

    for (const entry of add) {
      if (index.has(entry.id)) {
        conflicts.push({ id: entry.id, reason: "already_exists" });
      }
    }

    for (const entry of update) {
      const existing = index.get(entry.id);
      if (!existing) {
        conflicts.push({ id: entry.id, reason: "not_found" });
        continue;
      }
      if (!preconditionsOff) {
        const current = revisionOf(existing);
        if (!sameRevision(current, baseRevisionOf(entry))) {
          conflicts.push({ id: entry.id, reason: "stale_revision", current });
        }
      }
    }

    for (const entry of remove) {
      const existing = index.get(entry.id);
      if (!existing) {
        conflicts.push({ id: entry.id, reason: "not_found" });
        continue;
      }
      if (!preconditionsOff) {
        const current = revisionOf(existing);
        if (!sameRevision(current, baseRevisionOf(entry))) {
          conflicts.push({ id: entry.id, reason: "stale_revision", current });
        }
      }
    }

    if (conflicts.length) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error: "Conflict",
        code: "ELEMENT_CONFLICT",
        currentVersion: row.version,
        conflicts,
      });
      return;
    }

    let next = elements.map((element) => ({ ...element }));
    for (const entry of add) {
      next.push(withoutPrecondition(entry));
    }
    for (const entry of update) {
      const replacement = withoutPrecondition(entry);
      const position = next.findIndex((element) => element.id === replacement.id);
      next[position] = replacement;
    }
    if (remove.length) {
      const removedIds = new Set(remove.map((entry) => entry.id));
      next = next.filter((element) => !removedIds.has(element.id));
    }

    const { rows: updated } = await client.query(
      `UPDATE diagrams SET data = $1::jsonb, version = version + 1
       WHERE id = $2
       RETURNING id, version, updated_at`,
      [JSON.stringify({ ...data, elements: next }), row.id]
    );
    await client.query("COMMIT");

    res.json({
      id: updated[0].id,
      version: updated[0].version,
      applied: { added: add.length, updated: update.length, deleted: remove.length },
      updated_at: updated[0].updated_at,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

export default router;

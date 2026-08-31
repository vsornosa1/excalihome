import { Router } from "express";
import { randomUUID } from "crypto";
import pool from "../db";

const router = Router();

// Fixed anonymous user for diagrams created without authentication.
export const ANONYMOUS_USER_ID = "00000000-0000-0000-0000-000000000000";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base || "diagram";
}

function makeSlug(name: string, id: string): string {
  return `${slugify(name)}-${id.slice(0, 6)}`;
}

const LIST_COLS = "id, name, slug, thumbnail, created_at, updated_at";
const DETAIL_COLS = "id, name, slug, thumbnail, data, created_at, updated_at";

// Matches either a UUID or a slug
const WHERE_ID_OR_SLUG = "(id::text = $1 OR slug = $1)";

router.get("/", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT ${LIST_COLS} FROM diagrams ORDER BY updated_at DESC`
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { name, data = { elements: [], appState: {} }, thumbnail = null } = req.body;
  const id = randomUUID();
  const diagramName = name || "Untitled diagram";
  const slug = makeSlug(diagramName, id);
  const { rows } = await pool.query(
    `INSERT INTO diagrams (id, user_id, name, slug, thumbnail, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${LIST_COLS}`,
    [id, ANONYMOUS_USER_ID, diagramName, slug, thumbnail, JSON.stringify(data)]
  );
  res.status(201).json(rows[0]);
});

router.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${DETAIL_COLS} FROM diagrams WHERE ${WHERE_ID_OR_SLUG}`,
    [req.params.id]
  );
  if (!rows.length) {
    res.status(404).json({ error: "Diagram not found" });
    return;
  }
  res.json(rows[0]);
});

router.put("/:id", async (req, res) => {
  const { name, data, thumbnail } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (name !== undefined) {
    updates.push(`name = $${idx++}`);
    values.push(name);
  }
  if (data !== undefined) {
    updates.push(`data = $${idx++}::jsonb`);
    values.push(JSON.stringify(data));
  }
  if (thumbnail !== undefined) {
    updates.push(`thumbnail = $${idx++}`);
    values.push(thumbnail);
  }
  if (!updates.length) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE diagrams SET ${updates.join(", ")} WHERE ${WHERE_ID_OR_SLUG.replace(/\$1/g, `$${idx}`)}
     RETURNING ${LIST_COLS}`,
    values
  );
  if (!rows.length) {
    res.status(404).json({ error: "Diagram not found" });
    return;
  }
  res.json(rows[0]);
});

router.delete("/:id", async (req, res) => {
  const { rowCount } = await pool.query(
    `DELETE FROM diagrams WHERE ${WHERE_ID_OR_SLUG}`,
    [req.params.id]
  );
  if (!rowCount) {
    res.status(404).json({ error: "Diagram not found" });
    return;
  }
  res.status(204).send();
});

export default router;

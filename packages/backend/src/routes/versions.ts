import { Router } from "express";
import pool from "../db";

const router = Router({ mergeParams: true });

async function resolveDiagramId(idOrSlug: string): Promise<string | null> {
  const { rows } = await pool.query(
    "SELECT id FROM diagrams WHERE id::text = $1 OR slug = $1",
    [idOrSlug]
  );
  return rows.length ? rows[0].id : null;
}

router.post("/:id/versions", async (req, res) => {
  const diagramId = await resolveDiagramId(req.params.id);
  const { name, data } = req.body;
  if (!data) {
    res.status(400).json({ error: "Version data required" });
    return;
  }
  if (!diagramId) {
    res.status(404).json({ error: "Diagram not found" });
    return;
  }
  const { rows } = await pool.query(
    "INSERT INTO versions (diagram_id, name, data) VALUES ($1, $2, $3) RETURNING id, name, created_at",
    [diagramId, name || `Version at ${new Date().toISOString()}`, JSON.stringify(data)]
  );
  res.status(201).json(rows[0]);
});

router.get("/:id/versions", async (req, res) => {
  const diagramId = await resolveDiagramId(req.params.id);
  if (!diagramId) {
    res.status(404).json({ error: "Diagram not found" });
    return;
  }
  const { rows } = await pool.query(
    "SELECT id, name, created_at FROM versions WHERE diagram_id = $1 ORDER BY created_at DESC",
    [diagramId]
  );
  res.json(rows);
});

router.get("/:id/versions/:versionId", async (req, res) => {
  const { versionId } = req.params;
  const diagramId = await resolveDiagramId(req.params.id);
  if (!diagramId) {
    res.status(404).json({ error: "Diagram not found" });
    return;
  }
  const { rows } = await pool.query(
    "SELECT id, name, data, created_at FROM versions WHERE id = $1 AND diagram_id = $2",
    [versionId, diagramId]
  );
  if (!rows.length) {
    res.status(404).json({ error: "Version not found" });
    return;
  }
  res.json(rows[0]);
});

router.post("/:id/restore/:versionId", async (req, res) => {
  const { versionId } = req.params;
  const diagramId = await resolveDiagramId(req.params.id);
  if (!diagramId) {
    res.status(404).json({ error: "Diagram not found" });
    return;
  }
  const { rows } = await pool.query(
    "SELECT data FROM versions WHERE id = $1 AND diagram_id = $2",
    [versionId, diagramId]
  );
  if (!rows.length) {
    res.status(404).json({ error: "Version not found" });
    return;
  }
  const { rows: updated } = await pool.query(
    "UPDATE diagrams SET data = $1::jsonb WHERE id = $2 RETURNING id, name, slug, created_at, updated_at",
    [JSON.stringify(rows[0].data), diagramId]
  );
  res.json(updated[0]);
});

export default router;

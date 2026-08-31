import request from "supertest";
import app from "../src/index";
import pool from "../src/db";

let diagramId: string;

afterAll(async () => {
  await pool.end();
});

describe("Diagram lifecycle", () => {
  it("creates a diagram and generates a slug", async () => {
    const res = await request(app)
      .post("/api/diagrams")
      .send({ name: "Test diagram", data: { elements: [], appState: {} } })
      .expect(201);
    diagramId = res.body.id;
    expect(res.body.name).toBe("Test diagram");
    expect(res.body.slug).toMatch(/^test-diagram-/);
  });

  it("loads a diagram by slug", async () => {
    const created = await request(app).post("/api/diagrams").send({ name: "Slug lookup" });
    const res = await request(app).get(`/api/diagrams/${created.body.slug}`).expect(200);
    expect(res.body.name).toBe("Slug lookup");
  });

  it("lists diagrams", async () => {
    const res = await request(app).get("/api/diagrams").expect(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("saves and loads diagram data by slug", async () => {
    const created = await request(app)
      .post("/api/diagrams")
      .send({ name: "Slug save", data: { elements: [], appState: {} } });
    const slug = created.body.slug;
    const data = { elements: [{ id: "el1", type: "rectangle" }], appState: { theme: "light" } };
    await request(app).put(`/api/diagrams/${slug}`).send({ data }).expect(200);

    const res = await request(app).get(`/api/diagrams/${slug}`).expect(200);
    expect(res.body.data.elements[0].type).toBe("rectangle");
    diagramId = res.body.id;
  });

  it("creates and restores a version", async () => {
    const data = { elements: [{ id: "v1", type: "ellipse" }], appState: {} };
    const version = await request(app)
      .post(`/api/diagrams/${diagramId}/versions`)
      .send({ name: "v1", data })
      .expect(201);

    await request(app)
      .put(`/api/diagrams/${diagramId}`)
      .send({ data: { elements: [{ id: "changed", type: "diamond" }], appState: {} } })
      .expect(200);

    await request(app)
      .post(`/api/diagrams/${diagramId}/restore/${version.body.id}`)
      .expect(200);

    const restored = await request(app).get(`/api/diagrams/${diagramId}`).expect(200);
    expect(restored.body.data.elements[0].type).toBe("ellipse");
  });
});

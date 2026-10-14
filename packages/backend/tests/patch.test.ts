import request from "supertest";
import app from "../src/index";
import pool from "../src/db";

afterAll(async () => {
  await pool.end();
});

const elA = { id: "a", type: "rectangle", version: 1, versionNonce: 11 };
const elB = { id: "b", type: "ellipse", version: 1, versionNonce: 22 };

async function createDiagram(elements: unknown[] = [elA, elB]) {
  const res = await request(app)
    .post("/api/diagrams")
    .send({ name: "Patch target", data: { elements, appState: {} } })
    .expect(201);
  return res.body as { id: string; slug: string; version: number };
}

async function loadElements(idOrSlug: string) {
  const res = await request(app).get(`/api/diagrams/${idOrSlug}`).expect(200);
  return res.body as { version: number; data: { elements: any[] } };
}

describe("POST /api/diagrams/:id/patch", () => {
  it("applies an add, an update and a delete in one request", async () => {
    const diagram = await createDiagram();

    const res = await request(app)
      .post(`/api/diagrams/${diagram.slug}/patch`)
      .send({
        add: [{ id: "c", type: "diamond", version: 1, versionNonce: 33 }],
        update: [{ ...elA, version: 2, versionNonce: 44, baseVersion: 1, baseVersionNonce: 11 }],
        delete: [{ id: "b", baseVersion: 1, baseVersionNonce: 22 }],
      })
      .expect(200);

    expect(res.body.version).toBe(2);
    expect(res.body.applied).toEqual({ added: 1, updated: 1, deleted: 1 });

    const { data, version } = await loadElements(diagram.slug);
    expect(version).toBe(2);
    expect(data.elements.map((el) => el.id)).toEqual(["a", "c"]);
    expect(data.elements[0].versionNonce).toBe(44);
  });

  it("does not leak the base revision fields into stored elements", async () => {
    const diagram = await createDiagram();

    await request(app)
      .post(`/api/diagrams/${diagram.slug}/patch`)
      .send({
        update: [{ ...elA, version: 2, versionNonce: 44, baseVersion: 1, baseVersionNonce: 11 }],
      })
      .expect(200);

    const { data } = await loadElements(diagram.slug);
    expect(data.elements[0]).not.toHaveProperty("baseVersion");
    expect(data.elements[0]).not.toHaveProperty("baseVersionNonce");
  });

  it("rejects adding an element id that already exists", async () => {
    const diagram = await createDiagram();

    const res = await request(app)
      .post(`/api/diagrams/${diagram.slug}/patch`)
      .send({ add: [{ id: "a", type: "diamond", version: 9, versionNonce: 99 }] })
      .expect(409);

    expect(res.body.code).toBe("ELEMENT_CONFLICT");
    expect(res.body.currentVersion).toBe(1);
    expect(res.body.conflicts).toEqual([{ id: "a", reason: "already_exists" }]);
  });

  it("rejects updating an element that is not present", async () => {
    const diagram = await createDiagram();

    const res = await request(app)
      .post(`/api/diagrams/${diagram.slug}/patch`)
      .send({
        update: [{ id: "missing", type: "rectangle", version: 2, versionNonce: 1, baseVersion: 1, baseVersionNonce: 11 }],
      })
      .expect(409);

    expect(res.body.conflicts).toEqual([{ id: "missing", reason: "not_found" }]);
  });

  it("rejects deleting an element that is not present", async () => {
    const diagram = await createDiagram();

    const res = await request(app)
      .post(`/api/diagrams/${diagram.slug}/patch`)
      .send({ delete: [{ id: "missing", baseVersion: 1, baseVersionNonce: 11 }] })
      .expect(409);

    expect(res.body.conflicts).toEqual([{ id: "missing", reason: "not_found" }]);
  });

  it("rejects a stale revision and reports the element's current revision", async () => {
    const diagram = await createDiagram();

    const res = await request(app)
      .post(`/api/diagrams/${diagram.slug}/patch`)
      .send({
        update: [{ ...elA, version: 2, versionNonce: 44, baseVersion: 1, baseVersionNonce: 999 }],
      })
      .expect(409);

    expect(res.body.conflicts).toEqual([
      {
        id: "a",
        reason: "stale_revision",
        current: { version: 1, versionNonce: 11 },
      },
    ]);
  });

  it("leaves the document and version untouched when any entry conflicts", async () => {
    const diagram = await createDiagram();

    await request(app)
      .post(`/api/diagrams/${diagram.slug}/patch`)
      .send({
        add: [{ id: "c", type: "diamond", version: 1, versionNonce: 33 }],
        update: [{ ...elA, version: 2, versionNonce: 44, baseVersion: 1, baseVersionNonce: 999 }],
      })
      .expect(409);

    const { data, version } = await loadElements(diagram.slug);
    expect(version).toBe(1);
    expect(data.elements.map((el) => el.id)).toEqual(["a", "b"]);
  });

  it("requires a base revision for update and delete entries", async () => {
    const diagram = await createDiagram();

    const res = await request(app)
      .post(`/api/diagrams/${diagram.slug}/patch`)
      .send({ update: [{ ...elA, version: 2, versionNonce: 44 }] })
      .expect(400);

    expect(res.body.code).toBe("MISSING_PRECONDITION");
  });

  it("returns 404 for an unknown diagram", async () => {
    await request(app)
      .post("/api/diagrams/does-not-exist/patch")
      .send({ add: [{ id: "x", version: 1, versionNonce: 1 }] })
      .expect(404);
  });
});

describe("PATCH force escape hatch", () => {
  it("overwrites a stale element when force is true", async () => {
    const diagram = await createDiagram();

    const res = await request(app)
      .post(`/api/diagrams/${diagram.slug}/patch`)
      .send({
        force: true,
        update: [{ ...elA, version: 2, versionNonce: 44, baseVersion: 1, baseVersionNonce: 999 }],
      })
      .expect(200);

    expect(res.body.version).toBe(2);
    const { data } = await loadElements(diagram.slug);
    expect(data.elements[0].versionNonce).toBe(44);
  });

  it("allows update and delete entries with no base revision when force is true", async () => {
    const diagram = await createDiagram();

    await request(app)
      .post(`/api/diagrams/${diagram.slug}/patch`)
      .send({ force: true, update: [{ ...elA, version: 5, versionNonce: 55 }] })
      .expect(200);

    const { data } = await loadElements(diagram.slug);
    expect(data.elements[0].versionNonce).toBe(55);
  });

  it("still rejects a missing element when force is true, applying nothing", async () => {
    const diagram = await createDiagram();

    const res = await request(app)
      .post(`/api/diagrams/${diagram.slug}/patch`)
      .send({
        force: true,
        add: [{ id: "ok", version: 1, versionNonce: 1 }],
        update: [{ id: "missing", version: 2, versionNonce: 2 }],
      })
      .expect(409);

    expect(res.body.conflicts).toEqual([{ id: "missing", reason: "not_found" }]);
    const { data, version } = await loadElements(diagram.slug);
    expect(version).toBe(1);
    expect(data.elements.map((el) => el.id)).toEqual(["a", "b"]);
  });
});

describe("PUT /api/diagrams/:id precondition", () => {
  it("accepts a write with no precondition and bumps the version", async () => {
    const diagram = await createDiagram();

    const res = await request(app)
      .put(`/api/diagrams/${diagram.slug}`)
      .send({ data: { elements: [], appState: {} } })
      .expect(200);

    expect(res.body.version).toBe(2);
  });

  it("accepts a write whose baseVersion is current", async () => {
    const diagram = await createDiagram();

    const res = await request(app)
      .put(`/api/diagrams/${diagram.slug}`)
      .send({ baseVersion: 1, data: { elements: [], appState: {} } })
      .expect(200);

    expect(res.body.version).toBe(2);
  });

  it("rejects a stale baseVersion with STALE_DOCUMENT", async () => {
    const diagram = await createDiagram();
    await request(app)
      .put(`/api/diagrams/${diagram.slug}`)
      .send({ data: { elements: [], appState: {} } })
      .expect(200);

    const res = await request(app)
      .put(`/api/diagrams/${diagram.slug}`)
      .send({ baseVersion: 1, name: "stale write" })
      .expect(409);

    expect(res.body.code).toBe("STALE_DOCUMENT");
    expect(res.body.currentVersion).toBe(2);
  });

  it("accepts a matching If-Match header", async () => {
    const diagram = await createDiagram();

    const res = await request(app)
      .put(`/api/diagrams/${diagram.slug}`)
      .set("If-Match", 'W/"1"')
      .send({ data: { elements: [], appState: {} } })
      .expect(200);

    expect(res.body.version).toBe(2);
  });

  it("rejects a stale If-Match header with STALE_DOCUMENT", async () => {
    const diagram = await createDiagram();
    await request(app)
      .put(`/api/diagrams/${diagram.slug}`)
      .send({ data: { elements: [], appState: {} } })
      .expect(200);

    const res = await request(app)
      .put(`/api/diagrams/${diagram.slug}`)
      .set("If-Match", 'W/"1"')
      .send({ name: "stale header" })
      .expect(409);

    expect(res.body.code).toBe("STALE_DOCUMENT");
  });

  it("does not modify the diagram when a stale write is rejected", async () => {
    const diagram = await createDiagram();
    await request(app)
      .put(`/api/diagrams/${diagram.slug}`)
      .send({ name: "renamed once" })
      .expect(200);

    await request(app)
      .put(`/api/diagrams/${diagram.slug}`)
      .send({ baseVersion: 1, name: "should not apply" })
      .expect(409);

    const detail = await request(app).get(`/api/diagrams/${diagram.slug}`).expect(200);
    expect(detail.body.version).toBe(2);
    expect(detail.body.name).toBe("renamed once");
  });
});

describe("Concurrent patches", () => {
  it("applies disjoint concurrent edits without losing either", async () => {
    const diagram = await createDiagram();
    const url = `/api/diagrams/${diagram.slug}/patch`;

    const [first, second] = await Promise.all([
      request(app)
        .post(url)
        .send({
          update: [{ ...elA, version: 2, versionNonce: 100, baseVersion: 1, baseVersionNonce: 11 }],
        }),
      request(app)
        .post(url)
        .send({
          update: [{ ...elB, version: 2, versionNonce: 200, baseVersion: 1, baseVersionNonce: 22 }],
        }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const { data, version } = await loadElements(diagram.slug);
    expect(version).toBe(3);
    const byId = new Map(data.elements.map((el) => [el.id, el]));
    expect(byId.get("a").versionNonce).toBe(100);
    expect(byId.get("b").versionNonce).toBe(200);
  });

  it("allows one and rejects the other when both edit the same element", async () => {
    const diagram = await createDiagram();
    const url = `/api/diagrams/${diagram.slug}/patch`;

    const results = await Promise.all([
      request(app)
        .post(url)
        .send({
          update: [{ ...elA, version: 2, versionNonce: 100, baseVersion: 1, baseVersionNonce: 11 }],
        }),
      request(app)
        .post(url)
        .send({
          update: [{ ...elA, version: 2, versionNonce: 101, baseVersion: 1, baseVersionNonce: 11 }],
        }),
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);

    const rejected = results.find((r) => r.status === 409);
    expect(rejected!.body.code).toBe("ELEMENT_CONFLICT");
    expect(rejected!.body.conflicts).toMatchObject([{ id: "a", reason: "stale_revision" }]);
  });

  it("stores exactly the winning edit and still bumps the version once", async () => {
    const diagram = await createDiagram();
    const url = `/api/diagrams/${diagram.slug}/patch`;

    const results = await Promise.all([
      request(app)
        .post(url)
        .send({
          update: [{ ...elA, version: 2, versionNonce: 100, baseVersion: 1, baseVersionNonce: 11 }],
        }),
      request(app)
        .post(url)
        .send({
          update: [{ ...elA, version: 2, versionNonce: 101, baseVersion: 1, baseVersionNonce: 11 }],
        }),
    ]);

    const winnerIndex = results.findIndex((r) => r.status === 200);
    const losingIndex = results.findIndex((r) => r.status === 409);
    expect(winnerIndex).not.toBe(-1);
    expect(losingIndex).not.toBe(-1);

    const winningNonce = winnerIndex === 0 ? 100 : 101;
    const losingNonce = winnerIndex === 0 ? 101 : 100;

    const { data, version } = await loadElements(diagram.slug);
    expect(version).toBe(2);
    const elementA = data.elements.find((el) => el.id === "a");
    expect(elementA.versionNonce).toBe(winningNonce);
    expect(data.elements.some((el) => el.versionNonce === losingNonce)).toBe(false);
  });

  it("does not lose concurrent adds of different elements", async () => {
    const diagram = await createDiagram([]);
    const url = `/api/diagrams/${diagram.slug}/patch`;

    const [first, second] = await Promise.all([
      request(app).post(url).send({ add: [{ id: "x", type: "rectangle", version: 1, versionNonce: 1 }] }),
      request(app).post(url).send({ add: [{ id: "y", type: "ellipse", version: 1, versionNonce: 2 }] }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const { data, version } = await loadElements(diagram.slug);
    expect(version).toBe(3);
    expect(data.elements.map((el) => el.id).sort()).toEqual(["x", "y"]);
  });

  it("prevents a lost update when two writers read before either commits", async () => {
    const diagram = await createDiagram();
    const url = `/api/diagrams/${diagram.slug}/patch`;
    const blocker = await pool.connect();

    try {
      // Hold the row so both writers are forced to contend for it.
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM diagrams WHERE id = $1 FOR UPDATE", [diagram.id]);

      const send = (nonce: number) =>
        request(app)
          .post(url)
          .send({
            update: [{ ...elA, version: 2, versionNonce: nonce, baseVersion: 1, baseVersionNonce: 11 }],
          });

      const first = send(100);
      const second = send(101);

      await new Promise((resolve) => setTimeout(resolve, 400));
      await blocker.query("COMMIT");

      const results = await Promise.all([first, second]);
      const statuses = results.map((response) => response.status).sort();

      // Without a row lock both writers read the stale element, both pass the
      // conflict check, and the second silently overwrites the first.
      expect(statuses).toEqual([200, 409]);

      const { data } = await loadElements(diagram.slug);
      const elementA = data.elements.find((el) => el.id === "a");
      expect([100, 101]).toContain(elementA.versionNonce);
    } finally {
      blocker.release();
    }
  });
});

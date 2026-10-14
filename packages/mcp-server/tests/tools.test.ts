import { diagramTools } from "../src/tools/diagrams";
import { versionTools } from "../src/tools/versions";
import type { ApiError, ExcalihomeClient } from "../src/client";
import type { ToolDefinition } from "../src/tools/types";

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: ApiError) => ({ ok: false as const, error });

function stubClient(overrides: Partial<ExcalihomeClient> = {}): ExcalihomeClient {
  const base = {
    listDiagrams: jest.fn(),
    getDiagram: jest.fn(),
    createDiagram: jest.fn(),
    patchDiagram: jest.fn(),
    updateDiagram: jest.fn(),
    deleteDiagram: jest.fn(),
    listVersions: jest.fn(),
    getVersion: jest.fn(),
    createVersion: jest.fn(),
    restoreVersion: jest.fn(),
  };
  return { ...base, ...overrides } as unknown as ExcalihomeClient;
}

function findTool(defs: ToolDefinition[], name: string): ToolDefinition {
  const found = defs.find((def) => def.name === name);
  if (!found) throw new Error(`tool not registered: ${name}`);
  return found;
}

function textOf(result: { content: { type: string; text: string }[] }): unknown {
  return JSON.parse(result.content[0].text);
}

describe("diagram tool definitions", () => {
  it("registers the diagram tools with a title, description and input schema", () => {
    const defs = diagramTools(stubClient());
    const names = defs.map((def) => def.name);

    expect(names).toEqual([
      "list_diagrams",
      "get_diagram",
      "create_diagram",
      "patch_diagram",
      "update_diagram",
      "delete_diagram",
    ]);

    for (const def of defs) {
      expect(def.config.title.length).toBeGreaterThan(0);
      expect(def.config.description.length).toBeGreaterThan(0);
      expect(def.config.inputSchema).toBeDefined();
    }
  });
});

describe("list_diagrams", () => {
  it("returns the diagram list as JSON text", async () => {
    const client = stubClient({
      listDiagrams: jest.fn().mockResolvedValue(ok([{ id: "1", name: "One", version: 2 }])),
    });

    const result = await findTool(diagramTools(client), "list_diagrams").handler({});

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual([{ id: "1", name: "One", version: 2 }]);
  });
});

describe("get_diagram", () => {
  it("passes the identifier through and exposes the version", async () => {
    const getDiagram = jest
      .fn()
      .mockResolvedValue(ok({ id: "d1", name: "D", version: 5, data: { elements: [] } }));
    const client = stubClient({ getDiagram });

    const result = await findTool(diagramTools(client), "get_diagram").handler({ id: "d1" });

    expect(getDiagram).toHaveBeenCalledWith("d1");
    expect(textOf(result)).toMatchObject({ version: 5 });
  });

  it("maps a transport failure to an error result", async () => {
    const client = stubClient({
      getDiagram: jest.fn().mockResolvedValue(fail({ code: "HTTP_ERROR", status: 404, message: "Diagram not found" })),
    });

    const result = await findTool(diagramTools(client), "get_diagram").handler({ id: "nope" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatchObject({ code: "HTTP_ERROR", status: 404 });
  });
});

describe("create_diagram", () => {
  it("forwards the name and initial data", async () => {
    const createDiagram = jest.fn().mockResolvedValue(ok({ id: "new", version: 1 }));
    const client = stubClient({ createDiagram });

    const data = { elements: [], appState: {} };
    const result = await findTool(diagramTools(client), "create_diagram").handler({
      name: "Fresh",
      data,
    });

    expect(createDiagram).toHaveBeenCalledWith({ name: "Fresh", data });
    expect(textOf(result)).toMatchObject({ id: "new", version: 1 });
  });
});

describe("delete_diagram", () => {
  it("reports success", async () => {
    const deleteDiagram = jest.fn().mockResolvedValue(ok(null));
    const client = stubClient({ deleteDiagram });

    const result = await findTool(diagramTools(client), "delete_diagram").handler({ id: "d1" });

    expect(deleteDiagram).toHaveBeenCalledWith("d1");
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toEqual({ deleted: "d1" });
  });

  it("surfaces a failure as an error result", async () => {
    const client = stubClient({
      deleteDiagram: jest.fn().mockResolvedValue(fail({ code: "HTTP_ERROR", status: 500, message: "boom" })),
    });

    const result = await findTool(diagramTools(client), "delete_diagram").handler({ id: "d1" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatchObject({ code: "HTTP_ERROR" });
  });
});

describe("patch_diagram", () => {
  it("forwards the element operations to the API", async () => {
    const patchDiagram = jest
      .fn()
      .mockResolvedValue(ok({ id: "d1", version: 4, applied: { added: 1, updated: 0, deleted: 0 } }));
    const client = stubClient({ patchDiagram });
    const operations = {
      add: [{ id: "x", version: 1, versionNonce: 1 }],
      update: [{ id: "a", version: 2, versionNonce: 2, baseVersion: 1, baseVersionNonce: 1 }],
      delete: [{ id: "b", baseVersion: 1, baseVersionNonce: 2 }],
    };

    const result = await findTool(diagramTools(client), "patch_diagram").handler({
      id: "d1",
      ...operations,
    });

    expect(patchDiagram).toHaveBeenCalledWith("d1", operations);
    expect(textOf(result)).toMatchObject({ version: 4 });
  });

  it("omits force when the caller does not ask for it", async () => {
    const patchDiagram = jest.fn().mockResolvedValue(ok({ version: 2 }));
    const client = stubClient({ patchDiagram });

    await findTool(diagramTools(client), "patch_diagram").handler({ id: "d1" });

    const [, sentBody] = patchDiagram.mock.calls[0];
    expect(sentBody).not.toHaveProperty("force");
  });

  it("passes force through when the caller explicitly asks for it", async () => {
    const patchDiagram = jest.fn().mockResolvedValue(ok({ version: 2 }));
    const client = stubClient({ patchDiagram });

    await findTool(diagramTools(client), "patch_diagram").handler({ id: "d1", force: true });

    const [, sentBody] = patchDiagram.mock.calls[0];
    expect(sentBody.force).toBe(true);
  });

  it("returns the conflict details as an error result without retrying", async () => {
    const patchDiagram = jest.fn().mockResolvedValue(
      fail({
        code: "ELEMENT_CONFLICT",
        status: 409,
        currentVersion: 12,
        conflicts: [{ id: "a", reason: "stale_revision", current: { version: 6, versionNonce: 9 } }],
      })
    );
    const client = stubClient({ patchDiagram });

    const result = await findTool(diagramTools(client), "patch_diagram").handler({
      id: "d1",
      update: [{ id: "a" }],
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatchObject({
      code: "ELEMENT_CONFLICT",
      currentVersion: 12,
      conflicts: [{ id: "a", reason: "stale_revision" }],
    });
    expect(patchDiagram).toHaveBeenCalledTimes(1);
  });
});

describe("update_diagram", () => {
  it("forwards the replacement payload", async () => {
    const updateDiagram = jest.fn().mockResolvedValue(ok({ id: "d1", version: 3 }));
    const client = stubClient({ updateDiagram });

    const result = await findTool(diagramTools(client), "update_diagram").handler({
      id: "d1",
      name: "Renamed",
      baseVersion: 2,
    });

    expect(updateDiagram).toHaveBeenCalledWith("d1", { name: "Renamed", baseVersion: 2 });
    expect(textOf(result)).toMatchObject({ version: 3 });
  });

  it("maps a stale document conflict to an error result", async () => {
    const client = stubClient({
      updateDiagram: jest
        .fn()
        .mockResolvedValue(fail({ code: "STALE_DOCUMENT", status: 409, currentVersion: 5 })),
    });

    const result = await findTool(diagramTools(client), "update_diagram").handler({
      id: "d1",
      name: "x",
      baseVersion: 1,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatchObject({ code: "STALE_DOCUMENT", currentVersion: 5 });
  });
});

describe("version tools", () => {
  it("registers the version tools with titles and descriptions", () => {
    const defs = versionTools(stubClient());

    expect(defs.map((def) => def.name)).toEqual([
      "list_versions",
      "get_version",
      "create_version",
      "restore_version",
    ]);
    for (const def of defs) {
      expect(def.config.title.length).toBeGreaterThan(0);
      expect(def.config.description.length).toBeGreaterThan(0);
    }
  });

  it("lists versions for a diagram", async () => {
    const listVersions = jest.fn().mockResolvedValue(ok([{ id: "v1", name: "Initial" }]));
    const client = stubClient({ listVersions });

    const result = await findTool(versionTools(client), "list_versions").handler({ id: "d1" });

    expect(listVersions).toHaveBeenCalledWith("d1");
    expect(textOf(result)).toEqual([{ id: "v1", name: "Initial" }]);
  });

  it("fetches a single version", async () => {
    const getVersion = jest.fn().mockResolvedValue(ok({ id: "v1", name: "Initial", data: {} }));
    const client = stubClient({ getVersion });

    await findTool(versionTools(client), "get_version").handler({ id: "d1", versionId: "v1" });

    expect(getVersion).toHaveBeenCalledWith("d1", "v1");
  });

  it("creates a version snapshot", async () => {
    const createVersion = jest.fn().mockResolvedValue(ok({ id: "v2", name: "Snapshot" }));
    const client = stubClient({ createVersion });
    const data = { elements: [], appState: {} };

    await findTool(versionTools(client), "create_version").handler({ id: "d1", name: "Snapshot", data });

    expect(createVersion).toHaveBeenCalledWith("d1", { name: "Snapshot", data });
  });

  it("describes restore_version as mutating the live diagram", () => {
    const tool = findTool(versionTools(stubClient()), "restore_version");
    expect(tool.config.description.toLowerCase()).toContain("live");
  });

  it("restores a version", async () => {
    const restoreVersion = jest.fn().mockResolvedValue(ok({ id: "d1", version: 6 }));
    const client = stubClient({ restoreVersion });

    const result = await findTool(versionTools(client), "restore_version").handler({
      id: "d1",
      versionId: "v1",
    });

    expect(restoreVersion).toHaveBeenCalledWith("d1", "v1");
    expect(textOf(result)).toMatchObject({ version: 6 });
  });

  it("maps a failure from a version tool to an error result", async () => {
    const client = stubClient({
      getVersion: jest.fn().mockResolvedValue(fail({ code: "HTTP_ERROR", status: 404, message: "Version not found" })),
    });

    const result = await findTool(versionTools(client), "get_version").handler({
      id: "d1",
      versionId: "missing",
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatchObject({ code: "HTTP_ERROR", status: 404 });
  });
});

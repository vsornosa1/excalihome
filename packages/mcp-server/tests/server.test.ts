import { allTools, SERVER_INFO } from "../src/server";
import { createClient } from "../src/client";

const client = () => createClient("http://localhost:3001/api");

describe("MCP server tool surface", () => {
  it("exposes exactly the documented tools, in order", () => {
    expect(allTools(client()).map((tool) => tool.name)).toEqual([
      "list_diagrams",
      "get_diagram",
      "create_diagram",
      "patch_diagram",
      "update_diagram",
      "delete_diagram",
      "list_versions",
      "get_version",
      "create_version",
      "restore_version",
    ]);
  });

  it("has no duplicate tool names", () => {
    const names = allTools(client()).map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every tool a usable schema object", () => {
    for (const tool of allTools(client())) {
      expect(typeof tool.config.inputSchema).toBe("object");
      expect(tool.config.inputSchema).not.toBeNull();
    }
  });

  it("identifies itself as excalihome", () => {
    expect(SERVER_INFO.name).toBe("excalihome");
    expect(SERVER_INFO.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

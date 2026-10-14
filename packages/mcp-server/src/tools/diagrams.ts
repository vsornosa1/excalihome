import { z } from "zod";
import type { ExcalihomeClient, PatchInput } from "../client";
import { describeError, errorResult, jsonResult, type ToolDefinition } from "./types";

export function diagramTools(client: ExcalihomeClient): ToolDefinition[] {
  return [
    {
      name: "list_diagrams",
      config: {
        title: "List diagrams",
        description: "List every diagram, most recently updated first.",
        inputSchema: {},
      },
      handler: async () => {
        const result = await client.listDiagrams();
        return result.ok ? jsonResult(result.data) : errorResult(describeError(result.error));
      },
    },
    {
      name: "get_diagram",
      config: {
        title: "Get diagram",
        description:
          "Fetch one diagram by id or slug, including its elements, app state and current version.",
        inputSchema: { id: z.string().describe("Diagram id or slug") },
      },
      handler: async ({ id }) => {
        const result = await client.getDiagram(id);
        return result.ok ? jsonResult(result.data) : errorResult(describeError(result.error));
      },
    },
    {
      name: "create_diagram",
      config: {
        title: "Create diagram",
        description: "Create a new, empty diagram, optionally seeded with initial data.",
        inputSchema: {
          name: z.string().optional().describe("Diagram name"),
          data: z
            .object({ elements: z.array(z.any()), appState: z.any().optional() })
            .optional()
            .describe("Initial Excalidraw document"),
        },
      },
      handler: async ({ name, data }) => {
        const result = await client.createDiagram({ name, data });
        return result.ok ? jsonResult(result.data) : errorResult(describeError(result.error));
      },
    },
    {
      name: "patch_diagram",
      config: {
        title: "Patch diagram",
        description:
          "Add, update or delete individual elements of a diagram atomically. Supply each " +
          "update/delete entry with the baseVersion and baseVersionNonce you last read so " +
          "concurrent edits by other agents are detected instead of overwritten. On " +
          "ELEMENT_CONFLICT, re-read the diagram and retry; set force only to deliberately " +
          "overwrite.",
        inputSchema: {
          id: z.string().describe("Diagram id or slug"),
          add: z.array(z.record(z.string(), z.unknown())).optional().describe("Elements to add"),
          update: z
            .array(z.record(z.string(), z.unknown()))
            .optional()
            .describe("Elements to replace, each with baseVersion and baseVersionNonce"),
          delete: z
            .array(z.record(z.string(), z.unknown()))
            .optional()
            .describe("Elements to remove, each with id, baseVersion and baseVersionNonce"),
          force: z
            .boolean()
            .optional()
            .describe("Skip revision checks and overwrite (last-write-wins)"),
        },
      },
      handler: async ({ id, add, update, delete: remove, force }) => {
        const body: PatchInput = {};
        if (add !== undefined) body.add = add;
        if (update !== undefined) body.update = update;
        if (remove !== undefined) body.delete = remove;
        if (force !== undefined) body.force = force;

        const result = await client.patchDiagram(id, body);
        return result.ok ? jsonResult(result.data) : errorResult(describeError(result.error));
      },
    },
    {
      name: "update_diagram",
      config: {
        title: "Update diagram",
        description:
          "Replace a diagram's data, name or thumbnail wholesale. Prefer patch_diagram for " +
          "element edits. Supply baseVersion (or rely on the API's If-Match) to avoid " +
          "overwriting another agent's work; on STALE_DOCUMENT, re-read and retry.",
        inputSchema: {
          id: z.string().describe("Diagram id or slug"),
          name: z.string().optional().describe("New name"),
          data: z
            .object({ elements: z.array(z.any()), appState: z.any().optional() })
            .optional()
            .describe("Replacement Excalidraw document"),
          thumbnail: z.string().nullable().optional().describe("Replacement thumbnail"),
          baseVersion: z
            .number()
            .optional()
            .describe("Document version you last read; rejected with STALE_DOCUMENT if stale"),
        },
      },
      handler: async ({ id, name, data, thumbnail, baseVersion }) => {
        const body: Record<string, unknown> = {};
        if (name !== undefined) body.name = name;
        if (data !== undefined) body.data = data;
        if (thumbnail !== undefined) body.thumbnail = thumbnail;
        if (baseVersion !== undefined) body.baseVersion = baseVersion;

        const result = await client.updateDiagram(id, body);
        return result.ok ? jsonResult(result.data) : errorResult(describeError(result.error));
      },
    },
    {
      name: "delete_diagram",
      config: {
        title: "Delete diagram",
        description: "Permanently delete a diagram and all of its version history.",
        inputSchema: { id: z.string().describe("Diagram id or slug") },
      },
      handler: async ({ id }) => {
        const result = await client.deleteDiagram(id);
        return result.ok ? jsonResult({ deleted: id }) : errorResult(describeError(result.error));
      },
    },
  ];
}

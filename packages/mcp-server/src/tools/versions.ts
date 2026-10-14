import { z } from "zod";
import type { ExcalihomeClient } from "../client";
import { describeError, errorResult, jsonResult, type ToolDefinition } from "./types";

export function versionTools(client: ExcalihomeClient): ToolDefinition[] {
  return [
    {
      name: "list_versions",
      config: {
        title: "List versions",
        description: "List the saved version snapshots of a diagram, newest first.",
        inputSchema: { id: z.string().describe("Diagram id or slug") },
      },
      handler: async ({ id }) => {
        const result = await client.listVersions(id);
        return result.ok ? jsonResult(result.data) : errorResult(describeError(result.error));
      },
    },
    {
      name: "get_version",
      config: {
        title: "Get version",
        description: "Fetch one version snapshot, including the elements it captured.",
        inputSchema: {
          id: z.string().describe("Diagram id or slug"),
          versionId: z.string().describe("Version id"),
        },
      },
      handler: async ({ id, versionId }) => {
        const result = await client.getVersion(id, versionId);
        return result.ok ? jsonResult(result.data) : errorResult(describeError(result.error));
      },
    },
    {
      name: "create_version",
      config: {
        title: "Create version",
        description: "Save a snapshot of the supplied diagram data as a named version.",
        inputSchema: {
          id: z.string().describe("Diagram id or slug"),
          name: z.string().optional().describe("Version name"),
          data: z
            .object({ elements: z.array(z.any()), appState: z.any().optional() })
            .describe("Diagram data to snapshot"),
        },
      },
      handler: async ({ id, name, data }) => {
        const result = await client.createVersion(id, { name, data });
        return result.ok ? jsonResult(result.data) : errorResult(describeError(result.error));
      },
    },
    {
      name: "restore_version",
      config: {
        title: "Restore version",
        description:
          "Replace the live diagram's data with a saved version. This mutates the diagram " +
          "other agents may be editing, and bumps its version.",
        inputSchema: {
          id: z.string().describe("Diagram id or slug"),
          versionId: z.string().describe("Version id to restore"),
        },
      },
      handler: async ({ id, versionId }) => {
        const result = await client.restoreVersion(id, versionId);
        return result.ok ? jsonResult(result.data) : errorResult(describeError(result.error));
      },
    },
  ];
}

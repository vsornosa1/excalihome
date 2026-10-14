import type { ZodType } from "zod";
import type { ApiError } from "../client";

/** MCP tool result: JSON text so the calling agent can branch on `code`. */
export type ToolTextResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/**
 * A tool described independently of the MCP server so it can be unit tested by
 * calling the handler directly, without standing up a transport.
 */
export type ToolDefinition = {
  name: string;
  config: {
    title: string;
    description: string;
    inputSchema: Record<string, ZodType>;
  };
  handler: (args: any) => Promise<ToolTextResult>;
};

export function jsonResult(data: unknown): ToolTextResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export function errorResult(payload: unknown): ToolTextResult {
  return { isError: true, content: [{ type: "text", text: JSON.stringify(payload) }] };
}

/**
 * Flattens an ApiError into a stable payload. Conflicts keep the information the
 * agent needs to re-read and retry; nothing here triggers an automatic retry.
 */
export function describeError(error: ApiError): Record<string, unknown> {
  if (error.code === "ELEMENT_CONFLICT") {
    return {
      code: error.code,
      status: error.status,
      currentVersion: error.currentVersion,
      conflicts: error.conflicts,
    };
  }
  if (error.code === "STALE_DOCUMENT") {
    return { code: error.code, status: error.status, currentVersion: error.currentVersion };
  }
  return { code: error.code, status: error.status, message: error.message };
}

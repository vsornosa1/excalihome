/** Base URL of the Excalihome backend REST API. */
export const DEFAULT_API_URL = "http://localhost:3001/api";

/**
 * Resolves the backend URL from the environment. Falls back to the local
 * development backend so the server works out of the box, and fails fast on a
 * malformed value rather than issuing requests to a nonsense URL.
 */
export function resolveApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.EXCALIHOME_API_URL?.trim();
  if (!raw) {
    return DEFAULT_API_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`EXCALIHOME_API_URL is not a valid URL: ${raw}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`EXCALIHOME_API_URL must use http or https: ${raw}`);
  }

  return raw.replace(/\/+$/, "");
}

import type { DiagramDetail, DiagramSummary, DiagramVersion } from "./types";

/** Element-level conflict detail returned by a rejected patch. */
export type ConflictDetail = {
  id: string;
  reason: "already_exists" | "not_found" | "stale_revision";
  current?: { version: number; versionNonce: number };
};

/**
 * Normalized failure. `ELEMENT_CONFLICT` and `STALE_DOCUMENT` are recoverable by
 * re-reading and retrying, so they are kept distinct from transport failures.
 */
export type ApiError =
  | { code: "ELEMENT_CONFLICT"; status: number; currentVersion: number; conflicts: ConflictDetail[] }
  | { code: "STALE_DOCUMENT"; status: number; currentVersion?: number }
  | { code: "HTTP_ERROR"; status: number; message: string };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type PatchInput = {
  add?: unknown[];
  update?: unknown[];
  delete?: unknown[];
  force?: boolean;
};

export function createClient(baseUrl: string) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });

    const text = await response.text();
    let payload: any = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (response.ok) {
      return { ok: true, data: payload as T };
    }

    const status = response.status;
    if (status === 409 && payload?.code === "ELEMENT_CONFLICT") {
      return {
        ok: false,
        error: {
          code: "ELEMENT_CONFLICT",
          status,
          currentVersion: payload.currentVersion,
          conflicts: payload.conflicts ?? [],
        },
      };
    }
    if (status === 409 && payload?.code === "STALE_DOCUMENT") {
      return {
        ok: false,
        error: { code: "STALE_DOCUMENT", status, currentVersion: payload.currentVersion },
      };
    }

    return {
      ok: false,
      error: {
        code: "HTTP_ERROR",
        status,
        message:
          typeof payload?.error === "string" ? payload.error : `Request failed with status ${status}`,
      },
    };
  }

  const path = (id: string) => `/diagrams/${encodeURIComponent(id)}`;

  const send = <T>(url: string, method: string, body?: unknown) =>
    request<T>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    listDiagrams: () => request<DiagramSummary[]>("/diagrams"),
    getDiagram: (id: string) => request<DiagramDetail>(path(id)),
    createDiagram: (body: { name?: string; data?: unknown }) => send<DiagramSummary>("/diagrams", "POST", body),
    patchDiagram: (id: string, body: PatchInput) => send<PatchResult>(`${path(id)}/patch`, "POST", body),
    updateDiagram: (id: string, body: { name?: string; data?: unknown; thumbnail?: string | null; baseVersion?: number }) =>
      send<DiagramSummary>(path(id), "PUT", body),
    deleteDiagram: (id: string) => send<null>(path(id), "DELETE"),

    listVersions: (id: string) => request<DiagramVersion[]>(`${path(id)}/versions`),
    getVersion: (id: string, versionId: string) =>
      request<DiagramVersion>(`${path(id)}/versions/${encodeURIComponent(versionId)}`),
    createVersion: (id: string, body: { name?: string; data: unknown }) =>
      send<DiagramVersion>(`${path(id)}/versions`, "POST", body),
    restoreVersion: (id: string, versionId: string) =>
      send<DiagramSummary>(`${path(id)}/restore/${encodeURIComponent(versionId)}`, "POST"),
  };
}

export type PatchResult = {
  id: string;
  version: number;
  applied: { added: number; updated: number; deleted: number };
  updated_at: string;
};

export type ExcalihomeClient = ReturnType<typeof createClient>;

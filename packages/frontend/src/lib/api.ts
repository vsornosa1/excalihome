/// <reference types="vite/client" />
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function request(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data;
}

export const api = {
  listDiagrams: () => request("/diagrams"),

  createDiagram: (name: string, data?: any) =>
    request("/diagrams", { method: "POST", body: JSON.stringify({ name, data }) }),

  getDiagram: (id: string) => request(`/diagrams/${id}`),

  updateDiagram: (id: string, payload: { name?: string; data?: any; thumbnail?: string | null }) =>
    request(`/diagrams/${id}`, { method: "PUT", body: JSON.stringify(payload) }),

  deleteDiagram: (id: string) => request(`/diagrams/${id}`, { method: "DELETE" }),

  listVersions: (id: string) => request(`/diagrams/${id}/versions`),

  createVersion: (id: string, name: string, data: any) =>
    request(`/diagrams/${id}/versions`, { method: "POST", body: JSON.stringify({ name, data }) }),

  getVersion: (id: string, versionId: string) => request(`/diagrams/${id}/versions/${versionId}`),

  restoreVersion: (id: string, versionId: string) =>
    request(`/diagrams/${id}/restore/${versionId}`, { method: "POST" }),
};

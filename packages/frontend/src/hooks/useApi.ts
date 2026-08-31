import { useCallback, useMemo } from "react";
import { api } from "../lib/api";

export function useApi() {
  const wrap = useCallback(<T>(fn: () => Promise<T>): Promise<T> => fn(), []);

  return useMemo(
    () => ({
      listDiagrams: () => wrap(() => api.listDiagrams()),
      createDiagram: (name: string, data?: any) => wrap(() => api.createDiagram(name, data)),
      getDiagram: (id: string) => wrap(() => api.getDiagram(id)),
      updateDiagram: (id: string, payload: { name?: string; data?: any; thumbnail?: string | null }) =>
        wrap(() => api.updateDiagram(id, payload)),
      deleteDiagram: (id: string) => wrap(() => api.deleteDiagram(id)),
      listVersions: (id: string) => wrap(() => api.listVersions(id)),
      createVersion: (id: string, name: string, data: any) =>
        wrap(() => api.createVersion(id, name, data)),
      getVersion: (id: string, versionId: string) => wrap(() => api.getVersion(id, versionId)),
      restoreVersion: (id: string, versionId: string) =>
        wrap(() => api.restoreVersion(id, versionId)),
    }),
    [wrap]
  );
}

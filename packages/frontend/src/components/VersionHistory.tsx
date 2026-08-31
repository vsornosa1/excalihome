import { useEffect, useState } from "react";
import { Version } from "../types";
import { useApi } from "../hooks/useApi";

interface VersionHistoryProps {
  diagramId: string;
  onRestore: (versionId: string) => void;
  onPreview: (versionId: string) => void;
  onCreate: () => void;
}

export function VersionHistory({ diagramId, onRestore, onPreview, onCreate }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const api = useApi();

  useEffect(() => {
    setLoading(true);
    api
      .listVersions(diagramId)
      .then(setVersions)
      .finally(() => setLoading(false));
  }, [diagramId]);

  return (
    <div
      style={{
        width: "260px",
        background: "#fff",
        borderLeft: "1px solid #e0e0e0",
        padding: "1rem",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Version History</h3>
        <button style={smallBtn} onClick={onCreate}>
          Save point
        </button>
      </div>

      {loading && <div style={{ color: "#666", fontSize: "0.85rem" }}>Loading...</div>}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {versions.map((v) => (
          <div
            key={v.id}
            style={{
              padding: "0.6rem",
              border: "1px solid #e0e0e0",
              borderRadius: "4px",
              marginBottom: "0.5rem",
            }}
          >
            <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>{v.name}</div>
            <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: "0.5rem" }}>
              {new Date(v.created_at).toLocaleString()}
            </div>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <button style={smallBtn} onClick={() => onPreview(v.id)}>
                Preview
              </button>
              <button style={smallBtn} onClick={() => onRestore(v.id)}>
                Restore
              </button>
            </div>
          </div>
        ))}
        {!loading && versions.length === 0 && (
          <div style={{ color: "#888", fontSize: "0.85rem" }}>No versions yet.</div>
        )}
      </div>
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  padding: "0.3rem 0.5rem",
  border: "1px solid #ccc",
  borderRadius: "4px",
  background: "#fff",
  fontSize: "0.75rem",
};

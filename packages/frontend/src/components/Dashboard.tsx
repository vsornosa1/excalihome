import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DiagramMeta } from "../types";
import { useApi } from "../hooks/useApi";

export function Dashboard() {
  const [diagrams, setDiagrams] = useState<DiagramMeta[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const api = useApi();
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api
      .listDiagrams()
      .then(setDiagrams)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return diagrams;
    return diagrams.filter((d) => d.name.toLowerCase().includes(q));
  }, [diagrams, search]);

  const create = async () => {
    const diagram = await api.createDiagram("Untitled diagram");
    navigate(`/diagram/${diagram.slug}`);
  };

  const startRename = (d: DiagramMeta) => {
    setRenamingId(d.id);
    setRenameValue(d.name);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const value = renameValue.trim();
    if (value) {
      await api.updateDiagram(renamingId, { name: value });
    }
    setRenamingId(null);
    load();
  };

  const remove = async (d: DiagramMeta) => {
    if (!confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    await api.deleteDiagram(d.id);
    load();
  };

  return (
    <div style={{ display: "flex", height: "100%", background: "#fff" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: "220px",
          borderRight: "1px solid #e9e9ec",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <span style={{ fontSize: "1.4rem" }}>✏️</span>
          <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>Excalihome</span>
        </div>
        <div style={{ ...navItemStyle, ...navItemActiveStyle }}>Diagrams</div>
        <div style={{ ...navItemStyle, color: "#888", cursor: "default" }}>Libraries</div>
        <div style={{ marginTop: "auto", fontSize: "0.75rem", color: "#999" }}>
          Self-hosted Excalidraw+ clone
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid #e9e9ec",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <input
            placeholder="Search diagrams"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              maxWidth: "420px",
              padding: "0.55rem 0.85rem",
              borderRadius: "8px",
              border: "1px solid #e0e0e6",
              background: "#f6f6f9",
              outline: "none",
            }}
          />
          <div style={{ marginLeft: "auto" }}>
            <button
              onClick={create}
              style={{
                padding: "0.55rem 1.1rem",
                background: "#6965db",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
              }}
            >
              + New diagram
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {loading && <div style={{ color: "#888" }}>Loading...</div>}

          {!loading && filtered.length === 0 && (
            <div style={{ color: "#888", marginTop: "3rem", textAlign: "center" }}>
              {search ? "No diagrams match your search." : "No diagrams yet. Create your first one!"}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {filtered.map((d) => (
              <div
                key={d.id}
                style={{
                  border: "1px solid #e9e9ec",
                  borderRadius: "10px",
                  overflow: "hidden",
                  cursor: "pointer",
                  background: "#fff",
                }}
                onClick={() => navigate(`/diagram/${d.slug}`)}
              >
                <div
                  style={{
                    height: "140px",
                    background: "#f6f6f9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {d.thumbnail ? (
                    <img
                      src={d.thumbnail}
                      alt={d.name}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    <span style={{ fontSize: "2rem", opacity: 0.25 }}>✏️</span>
                  )}
                </div>
                <div style={{ padding: "0.75rem 0.85rem" }}>
                  {renamingId === d.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: "100%", padding: "0.25rem 0.35rem", fontSize: "0.9rem" }}
                    />
                  ) : (
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.2rem" }}>
                      {d.name}
                    </div>
                  )}
                  <div style={{ fontSize: "0.75rem", color: "#888" }}>
                    Edited {new Date(d.updated_at).toLocaleString()}
                  </div>
                  <div
                    style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button style={cardBtn} onClick={() => startRename(d)}>
                      Rename
                    </button>
                    <button style={{ ...cardBtn, color: "#d32f2f" }} onClick={() => remove(d)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

const navItemStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderRadius: "8px",
  fontSize: "0.9rem",
  cursor: "pointer",
};

const navItemActiveStyle: React.CSSProperties = {
  background: "#ececfc",
  color: "#4945c4",
  fontWeight: 600,
};

const cardBtn: React.CSSProperties = {
  padding: "0.25rem 0.55rem",
  border: "1px solid #ddd",
  borderRadius: "6px",
  background: "#fff",
  fontSize: "0.75rem",
};

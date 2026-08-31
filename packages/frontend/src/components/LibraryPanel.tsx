import { useEffect } from "react";
import libraryItems from "../lib/library.json";

interface LibraryPanelProps {
  excalidrawAPI: any;
}

export function LibraryPanel({ excalidrawAPI }: LibraryPanelProps) {
  useEffect(() => {
    if (excalidrawAPI) {
      excalidrawAPI.updateLibrary({
        libraryItems: (libraryItems as any).libraryItems,
        merge: true,
      });
    }
  }, [excalidrawAPI]);

  return (
    <div
      style={{
        width: "220px",
        background: "#fff",
        borderLeft: "1px solid #e0e0e0",
        padding: "1rem",
        overflowY: "auto",
      }}
    >
      <h3 style={{ marginTop: 0, fontSize: "1rem" }}>Shape Library</h3>
      <p style={{ fontSize: "0.85rem", color: "#666" }}>
        Open the Excalidraw library tab on the canvas toolbar to insert built-in shapes.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "1rem" }}>
        {(libraryItems as any).libraryItems.map((item: any) => (
          <div
            key={item.id}
            style={{
              border: "1px solid #e0e0e0",
              borderRadius: "4px",
              padding: "0.5rem",
              textAlign: "center",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
            onClick={() => {
              if (excalidrawAPI) {
                excalidrawAPI.updateLibrary({ libraryItems: [item], merge: true });
                excalidrawAPI.setActiveTool({ type: "selection" });
              }
            }}
          >
            {item.id}
          </div>
        ))}
      </div>
    </div>
  );
}

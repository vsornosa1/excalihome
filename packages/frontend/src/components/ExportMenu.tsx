import { exportAsSvg, exportAsPng, exportAsJson, exportAsPdf, downloadFile } from "../lib/export";

interface ExportMenuProps {
  elements: any[];
  appState: any;
  diagramName: string;
}

export function ExportMenu({ elements, appState, diagramName }: ExportMenuProps) {
  const safeName = (diagramName || "diagram").replace(/[^a-z0-9]/gi, "_").toLowerCase();

  const handlePng = async () => {
    const data = await exportAsPng(elements, appState);
    downloadFile(data, `${safeName}.png`, "image/png");
  };

  const handleSvg = async () => {
    const svg = await exportAsSvg(elements, appState);
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    downloadFile(
      `<?xml version="1.0" encoding="UTF-8"?>\n${source}`,
      `${safeName}.svg`,
      "image/svg+xml"
    );
  };

  const handleJson = () => {
    const json = exportAsJson(elements, appState);
    downloadFile(json, `${safeName}.excalidraw.json`, "application/json");
  };

  const handlePdf = async () => {
    const blob = await exportAsPdf(elements, appState);
    downloadFile(blob, `${safeName}.pdf`, "application/pdf");
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <button style={btnStyle} onClick={handlePng}>
        PNG
      </button>
      <button style={btnStyle} onClick={handleSvg}>
        SVG
      </button>
      <button style={btnStyle} onClick={handleJson}>
        JSON
      </button>
      <button style={btnStyle} onClick={handlePdf}>
        PDF
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "0.35rem 0.6rem",
  border: "1px solid #ccc",
  borderRadius: "4px",
  background: "#fff",
  fontSize: "0.85rem",
};

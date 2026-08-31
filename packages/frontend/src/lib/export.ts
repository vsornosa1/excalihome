import {
  exportToSvg,
  exportToCanvas,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import { jsPDF } from "jspdf";
import { sanitizeAppState } from "./appState";

export async function exportAsSvg(elements: any[], appState: any) {
  const svg = exportToSvg({ elements, appState, files: null });
  return svg;
}

export async function exportAsPng(elements: any[], appState: any): Promise<Blob> {
  const canvas = await exportToCanvas({ elements, appState, files: null });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG export failed"));
    }, "image/png");
  });
}

export function exportAsJson(elements: any[], appState: any) {
  return serializeAsJSON(elements, sanitizeAppState(appState), null as any, "local");
}

export async function exportAsPdf(elements: any[], appState: any) {
  const canvas = await exportToCanvas({ elements, appState, files: null });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? "landscape" : "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
  return pdf.output("blob");
}

export async function generateThumbnail(elements: any[], appState: any): Promise<string | null> {
  const visible = elements.filter((el) => !el.isDeleted);
  if (!visible.length) return null;
  try {
    const canvas = await exportToCanvas({
      elements: visible,
      appState: { ...appState, exportWithDarkMode: false, exportBackground: true },
      files: null,
      maxWidthOrHeight: 480,
      exportPadding: 24,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function downloadFile(data: string | Blob, filename: string, type?: string) {
  const blob =
    typeof data === "string"
      ? data.startsWith("data:")
        ? dataURLtoBlob(data)
        : new Blob([data], { type: type || "text/plain" })
      : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function dataURLtoBlob(dataURL: string): Blob {
  const [meta, base64] = dataURL.split(",");
  const mime = /data:(.*?);/.exec(meta)?.[1] || "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

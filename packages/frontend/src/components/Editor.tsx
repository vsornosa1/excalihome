import { useEffect, useState, useCallback, useMemo } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";
import { Diagram, ExcalidrawData } from "../types";
import { useApi } from "../hooks/useApi";
import { Header } from "./Header";
import { ExportMenu } from "./ExportMenu";
import { VersionHistory } from "./VersionHistory";
import { LibraryPanel } from "./LibraryPanel";
import { CanvasErrorBoundary } from "./CanvasErrorBoundary";
import { generateThumbnail } from "../lib/export";
import { sanitizeAppState } from "../lib/appState";

interface EditorProps {
  diagramSlug: string;
  onBack: () => void;
}

const defaultAppState = { theme: "light" as const, viewBackgroundColor: "#ffffff" };

export function Editor({ diagramSlug, onBack }: EditorProps) {
  const api = useApi();
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [elements, setElements] = useState<any[]>([]);
  const [appState, setAppState] = useState<any>(defaultAppState);
  const [name, setName] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .getDiagram(diagramSlug)
      .then((d) => {
        if (cancelled) return;
        setDiagram(d);
        setName(d.name);
        setElements(d.data?.elements || []);
        setAppState({ ...defaultAppState, ...sanitizeAppState(d.data?.appState) });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message || "Failed to load diagram");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [diagramSlug, api]);

  const showMsg = useCallback((text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 2000);
  }, []);

  const handleChange = useCallback((els: any, st: any) => {
    setElements(els);
    setAppState(st);
  }, []);

  const excalidrawAPICallback = useCallback((apiInstance: ExcalidrawImperativeAPI | null) => {
    setExcalidrawAPI(apiInstance);
  }, []);

  const uiOptions = useMemo(
    () => ({
      canvasActions: {
        changeViewBackgroundColor: true,
        clearCanvas: false,
        export: false as false,
        loadScene: false,
        saveToActiveFile: false,
        toggleTheme: false as false,
        saveAsImage: false,
      },
    }),
    []
  );

  const save = useCallback(async () => {
    if (!diagram) return;
    setSaving(true);
    const data: ExcalidrawData = { elements, appState: sanitizeAppState(appState) };
    const thumbnail = await generateThumbnail(elements, appState);
    await api.updateDiagram(diagram.id, { name, data, thumbnail });
    setSaving(false);
    showMsg("Saved");
  }, [diagram, elements, appState, name, api, showMsg]);

  const saveVersion = useCallback(async () => {
    if (!diagram) return;
    const data: ExcalidrawData = { elements, appState: sanitizeAppState(appState) };
    await api.createVersion(diagram.id, `Version ${new Date().toLocaleString()}`, data);
    showMsg("Version saved");
  }, [diagram, elements, appState, api, showMsg]);

  const restoreVersion = useCallback(
    async (versionId: string) => {
      if (!diagram) return;
      if (!confirm("Restore this version? Unsaved changes will be lost.")) return;
      await api.restoreVersion(diagram.id, versionId);
      const d = await api.getDiagram(diagram.id);
      setDiagram(d);
      setName(d.name);
      const newElements = d.data?.elements || [];
      const newAppState = { ...defaultAppState, ...sanitizeAppState(d.data?.appState) };
      setElements(newElements);
      setAppState(newAppState);
      excalidrawAPI?.updateScene({ elements: newElements, appState: newAppState });
      showMsg("Version restored");
    },
    [diagram, excalidrawAPI, api, showMsg]
  );

  const previewVersion = useCallback(
    async (versionId: string) => {
      const v = await api.getVersion(diagramSlug, versionId);
      const newElements = v.data.elements || [];
      const newAppState = { ...appState, ...sanitizeAppState(v.data.appState) };
      setElements(newElements);
      setAppState(newAppState);
      excalidrawAPI?.updateScene({ elements: newElements, appState: newAppState });
    },
    [diagramSlug, appState, excalidrawAPI, api]
  );

  const importJson = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          const newElements = parsed.elements || [];
          const newAppState = { ...appState, ...sanitizeAppState(parsed.appState) };
          setElements(newElements);
          setAppState(newAppState);
          excalidrawAPI?.updateScene({ elements: newElements, appState: newAppState });
          showMsg("File imported");
        } catch {
          alert("Invalid Excalidraw file");
        }
      };
      reader.readAsText(file);
    },
    [appState, excalidrawAPI, showMsg]
  );

  const moveSelected = useCallback(
    (direction: "up" | "down") => {
      if (!excalidrawAPI) return;
      const selectedIds = new Set(
        Object.keys(excalidrawAPI.getAppState().selectedElementIds || {})
      );
      if (!selectedIds.size) return;

      const next = [...elements];
      if (direction === "up") {
        for (let i = next.length - 1; i >= 0; i--) {
          if (selectedIds.has(next[i].id) && i < next.length - 1) {
            [next[i], next[i + 1]] = [next[i + 1], next[i]];
          }
        }
      } else {
        for (let i = 0; i < next.length; i++) {
          if (selectedIds.has(next[i].id) && i > 0) {
            [next[i], next[i - 1]] = [next[i - 1], next[i]];
          }
        }
      }
      setElements(next);
      excalidrawAPI.updateScene({ elements: next });
    },
    [elements, excalidrawAPI]
  );

  const toggleLockSelected = useCallback(() => {
    if (!excalidrawAPI) return;
    const selectedIds = excalidrawAPI.getAppState().selectedElementIds || {};
    const ids = Object.keys(selectedIds);
    if (!ids.length) return;
    const next = elements.map((el) =>
      ids.includes(el.id) ? { ...el, locked: !el.locked } : el
    );
    setElements(next);
    excalidrawAPI.updateScene({ elements: next });
  }, [elements, excalidrawAPI]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Header title={name || "Untitled"}>
        <button onClick={onBack} style={btnStyle} title="Back to your library">
          ← Library
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
          style={{ padding: "0.3rem 0.5rem", minWidth: "200px" }}
          placeholder="Diagram name"
        />
        <button onClick={save} disabled={saving} style={primaryBtnStyle}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={saveVersion} style={btnStyle}>
          Save version
        </button>
        <button onClick={() => setShowLibrary((s) => !s)} style={btnStyle}>
          Library
        </button>
        <button onClick={() => setShowVersions((s) => !s)} style={btnStyle}>
          History
        </button>
        <label style={{ ...btnStyle, display: "inline-block" }}>
          Import
          <input type="file" accept=".json,application/json" onChange={importJson} hidden />
        </label>
        <ExportMenu elements={elements} appState={appState} diagramName={name} />
        {message && (
          <span style={{ fontSize: "0.85rem", color: "#2e7d32", marginLeft: "0.5rem" }}>
            {message}
          </span>
        )}
      </Header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Canvas area */}
        <div style={{ flex: 1, position: "relative" }}>
          {loadError ? (
            <div style={{ padding: "2rem", color: "#b00020" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Couldn’t open diagram</div>
              <div style={{ fontSize: "0.85rem" }}>{loadError}</div>
              <button style={{ ...btnStyle, marginTop: "1rem" }} onClick={onBack}>
                ← Back to library
              </button>
            </div>
          ) : loading ? (
            <div style={{ padding: "2rem", color: "#666" }}>Loading diagram...</div>
          ) : (
            <CanvasErrorBoundary>
              <Excalidraw
                excalidrawAPI={excalidrawAPICallback}
                initialData={{ elements, appState }}
                theme="light"
                onChange={handleChange}
                UIOptions={uiOptions}
              />
            </CanvasErrorBoundary>
          )}
        </div>

        {showLibrary && <LibraryPanel excalidrawAPI={excalidrawAPI} />}

        {showVersions && (
          <VersionHistory
            diagramId={diagramSlug}
            onRestore={restoreVersion}
            onPreview={previewVersion}
            onCreate={saveVersion}
          />
        )}

        {/* Layers panel */}
        <div
          style={{
            width: "220px",
            background: "#fff",
            borderLeft: "1px solid #e0e0e0",
            padding: "1rem",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: "1rem" }}>Layers</h3>
          <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.75rem" }}>
            <button style={smallBtn} onClick={() => moveSelected("up")}>
              ▲
            </button>
            <button style={smallBtn} onClick={() => moveSelected("down")}>
              ▼
            </button>
            <button style={smallBtn} onClick={toggleLockSelected}>
              Lock/Unlock
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {[...elements]
              .filter((el) => !el.isDeleted)
              .reverse()
              .map((el) => (
                <div
                  key={el.id}
                  style={{
                    padding: "0.4rem 0.5rem",
                    borderBottom: "1px solid #f0f0f0",
                    fontSize: "0.8rem",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>
                    {el.type} {el.locked ? "🔒" : ""}
                  </span>
                </div>
              ))}
            {elements.filter((el) => !el.isDeleted).length === 0 && (
              <div style={{ color: "#888", fontSize: "0.8rem" }}>No elements</div>
            )}
          </div>
          <p style={{ fontSize: "0.75rem", color: "#666", marginTop: "auto" }}>
            Use the canvas toolbar for grouping, z-index, and precise layer controls.
          </p>
        </div>
      </div>
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

const primaryBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "#6965db",
  borderColor: "#6965db",
  color: "#fff",
  fontWeight: 600,
};

const smallBtn: React.CSSProperties = {
  padding: "0.25rem 0.4rem",
  border: "1px solid #ccc",
  borderRadius: "4px",
  background: "#fff",
  fontSize: "0.75rem",
};

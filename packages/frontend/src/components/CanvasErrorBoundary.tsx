import React from "react";

interface ErrorBoundaryState {
  error: string | null;
}

/**
 * Renders a friendly error instead of a white screen when
 * the Excalidraw canvas throws (e.g., corrupted diagram data).
 */
export class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: "0.75rem",
            color: "#555",
            padding: "2rem",
          }}
        >
          <div style={{ fontSize: "2rem" }}>⚠️</div>
          <div style={{ fontWeight: 600 }}>Couldn’t render this diagram</div>
          <pre
            style={{
              background: "#f6f6f9",
              padding: "0.5rem 0.75rem",
              borderRadius: "6px",
              fontSize: "0.75rem",
              maxWidth: "480px",
              whiteSpace: "pre-wrap",
            }}
          >
            {this.state.error}
          </pre>
          <button
            style={{
              padding: "0.4rem 0.9rem",
              border: "1px solid #ccc",
              borderRadius: "6px",
              background: "#fff",
            }}
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Excalidraw appState contains live, non-serializable UI state
 * (Maps, file handles, context menus, viewport dimensions, etc.).
 * Persisting it raw corrupts any diagram after save/reload.
 * Keep only the canvas-relevant, JSON-safe keys.
 */
const PERSISTENT_KEYS = [
  "viewBackgroundColor",
  "gridSize",
  "zoom",
  "scrollX",
  "scrollY",
  "theme",
  "exportBackground",
  "exportWithDarkMode",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "currentItemFillStyle",
  "currentItemStrokeWidth",
  "currentItemStrokeStyle",
  "currentItemRoughness",
  "currentItemRoundness",
  "currentItemOpacity",
  "currentItemFontFamily",
  "currentItemFontSize",
  "currentItemTextAlign",
  "currentItemStartArrowhead",
  "currentItemEndArrowhead",
  "frameRendering",
  "isBindingEnabled",
  "objectsSnapModeEnabled",
  "zenModeEnabled",
];

export function sanitizeAppState(appState: Record<string, any> | null | undefined) {
  const out: Record<string, any> = {};
  if (!appState) return out;
  for (const key of PERSISTENT_KEYS) {
    if (appState[key] !== undefined) {
      out[key] = appState[key];
    }
  }
  return out;
}

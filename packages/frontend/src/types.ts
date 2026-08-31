export interface User {
  id: string;
  username: string;
}

export interface Diagram {
  id: string;
  name: string;
  slug: string;
  thumbnail: string | null;
  data: ExcalidrawData;
  created_at: string;
  updated_at: string;
}

export interface DiagramMeta {
  id: string;
  name: string;
  slug: string;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
}

export interface Version {
  id: string;
  name: string;
  created_at: string;
}

export interface VersionDetail extends Version {
  data: ExcalidrawData;
}

export interface ExcalidrawData {
  elements: any[];
  appState?: Record<string, any>;
}

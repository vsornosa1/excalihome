/** Shapes returned by the Excalihome backend REST API. */

export type DiagramSummary = {
  id: string;
  name: string;
  slug: string;
  thumbnail: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type DiagramDetail = DiagramSummary & {
  data: { elements: unknown[]; appState?: unknown };
};

export type DiagramVersion = {
  id: string;
  name: string;
  created_at: string;
  data?: { elements: unknown[]; appState?: unknown };
};

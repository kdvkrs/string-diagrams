export type LayoutPoint = { x: number; y: number };

export type LayoutNode = {
  id: string;
  label: string;
  color: string;
  selectable: boolean;
  boundary: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutEdge = {
  id: string;
  color: string;
  points: LayoutPoint[];
};

export type LayoutGraph = {
  id: string;
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
};

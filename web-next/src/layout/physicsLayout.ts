import type { PortRef, SceneEdge, SceneGraph, SceneNode } from '../model/interop';
import type { LayoutEdge, LayoutGraph, LayoutNode, LayoutPoint } from './layoutTypes';

type Vec = { x: number; y: number };
type KnownPortRef =
  | { kind: 'source'; index: number }
  | { kind: 'target'; index: number }
  | { kind: 'nodeSource'; nodeId: string; port: number }
  | { kind: 'nodeTarget'; nodeId: string; port: number };

type SimNode = {
  source: SceneNode;
  id: string;
  label: string;
  color: string;
  selectable: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  inputs: number;
  outputs: number;
  pointLike: boolean;
};

const SPEED = 0.01;
const MIN_MOVE = 0.2;
const ATTRACT_X = 5.0;
const ATTRACT_Y = 4.0;
const ITERATIONS = 260;
const PADDING = 24;
const BOUNDARY_RADIUS = 8;

const isPortRef = (p: PortRef): p is KnownPortRef =>
  typeof p === 'object' && p !== null && 'kind' in p;

const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const smul = (s: number, a: Vec): Vec => ({ x: s * a.x, y: s * a.y });
const norm = (a: Vec) => Math.hypot(a.x, a.y);
const unit = (a: Vec): Vec => {
  const d = norm(a);
  return d === 0 ? { x: 0, y: -1 } : { x: a.x / d, y: a.y / d };
};

const portKey = (p: KnownPortRef) => {
  switch (p.kind) {
    case 'source':
      return `source:${p.index}`;
    case 'target':
      return `target:${p.index}`;
    case 'nodeSource':
      return `nodeSource:${p.nodeId}:${p.port}`;
    case 'nodeTarget':
      return `nodeTarget:${p.nodeId}:${p.port}`;
  }
};

const collectNodePortCounts = (g: SceneGraph) => {
  const counts = new Map(g.nodes.map((node) => [node.id, { inputs: node.nsources, outputs: node.ntargets }]));
  g.edges.forEach((edge) => {
    if (isPortRef(edge.to) && edge.to.kind === 'nodeSource') {
      const count = counts.get(edge.to.nodeId);
      if (count) count.inputs = Math.max(count.inputs, edge.to.port);
    }
    if (isPortRef(edge.from) && edge.from.kind === 'nodeTarget') {
      const count = counts.get(edge.from.nodeId);
      if (count) count.outputs = Math.max(count.outputs, edge.from.port);
    }
  });
  return counts;
};

const makeSimNodes = (g: SceneGraph): SimNode[] => {
  const portCounts = collectNodePortCounts(g);
  return g.nodes.map((node) => {
    const counts = portCounts.get(node.id) ?? { inputs: node.nsources, outputs: node.ntargets };
    const rawW = Math.abs(node.x1 - node.x0);
    const rawH = Math.abs(node.y0 - node.y1);
    const pointLike = rawW <= 12 && rawH <= 12 && counts.inputs === 2 && counts.outputs === 2;
    return {
      source: node,
      id: node.id,
      label: node.label,
      color: node.color,
      selectable: node.selectable,
      x: node.x,
      y: node.y,
      w: Math.max(pointLike ? 10 : 16, rawW),
      h: Math.max(pointLike ? 10 : 16, rawH),
      inputs: counts.inputs,
      outputs: counts.outputs,
      pointLike
    };
  });
};

const boundaryPoints = (g: SceneGraph) => {
  const points = new Map<string, Vec>();
  g.edges.forEach((edge) => {
    if (edge.curve.length !== 4) return;
    if (isPortRef(edge.from) && edge.from.kind === 'source') points.set(portKey(edge.from), edge.curve[0]);
    if (isPortRef(edge.to) && edge.to.kind === 'target') points.set(portKey(edge.to), edge.curve[3]);
  });
  return points;
};

const edgeDirections = (g: SceneGraph) => {
  const dirs = new Map<string, Vec>();
  g.edges.forEach((edge) => {
    if (edge.curve.length !== 4 || !isPortRef(edge.from) || !isPortRef(edge.to)) return;
    const [p, c1, c2, q] = edge.curve;
    const d = Math.max(1, norm(sub(q, p)) / 3);
    dirs.set(`${edge.id}:from`, unit(smul(1 / d, sub(c1, p))));
    dirs.set(`${edge.id}:to`, unit(smul(1 / d, sub(q, c2))));
  });
  return dirs;
};

const topPort = (node: SimNode, port: number): Vec => {
  if (node.pointLike) return { x: node.x, y: node.y };
  const count = Math.max(1, node.inputs);
  const left = node.x - node.w / 2;
  return { x: left + (node.w / (2 * count)) * (2 * port - 1), y: node.y + node.h / 2 };
};

const bottomPort = (node: SimNode, port: number): Vec => {
  if (node.pointLike) return { x: node.x, y: node.y };
  const count = Math.max(1, node.outputs);
  const left = node.x - node.w / 2;
  return { x: left + (node.w / (2 * count)) * (2 * port - 1), y: node.y - node.h / 2 };
};

const portPosition = (p: KnownPortRef, nodes: Map<string, SimNode>, boundaries: Map<string, Vec>): Vec => {
  switch (p.kind) {
    case 'source':
    case 'target':
      return boundaries.get(portKey(p)) ?? { x: 0, y: 0 };
    case 'nodeSource': {
      const node = nodes.get(p.nodeId);
      return node ? topPort(node, p.port) : { x: 0, y: 0 };
    }
    case 'nodeTarget': {
      const node = nodes.get(p.nodeId);
      return node ? bottomPort(node, p.port) : { x: 0, y: 0 };
    }
  }
};

const portDirection = (edge: SceneEdge, end: 'from' | 'to', ref: KnownPortRef, dirs: Map<string, Vec>) => {
  const fromCurve = dirs.get(`${edge.id}:${end}`);
  if (fromCurve) return fromCurve;
  if (ref.kind === 'nodeSource' || ref.kind === 'nodeTarget') return { x: 0, y: -1 };
  return ref.kind === 'source' ? { x: 0, y: -1 } : { x: 0, y: 1 };
};

const addForce = (forces: Map<string, Vec>, id: string, force: Vec) => {
  forces.set(id, add(forces.get(id) ?? { x: 0, y: 0 }, force));
};

const improveOnce = (g: SceneGraph, nodes: Map<string, SimNode>, boundaries: Map<string, Vec>) => {
  const forces = new Map<string, Vec>();

  g.edges.forEach((edge) => {
    if (!isPortRef(edge.from) || !isPortRef(edge.to)) return;
    const p = portPosition(edge.from, nodes, boundaries);
    const q = portPosition(edge.to, nodes, boundaries);
    const horizontal = { x: q.x - p.x, y: 0 };
    if (edge.from.kind === 'nodeTarget') {
      const node = nodes.get(edge.from.nodeId);
      if (node) addForce(forces, node.id, smul(ATTRACT_X / Math.max(1, node.outputs), horizontal));
    }
    if (edge.to.kind === 'nodeSource') {
      const node = nodes.get(edge.to.nodeId);
      if (node) addForce(forces, node.id, smul(-ATTRACT_X / Math.max(1, node.inputs), horizontal));
    }
  });

  nodes.forEach((node) => {
    const prevs: Vec[] = [];
    const nexts: Vec[] = [];
    g.edges.forEach((edge) => {
      if (!isPortRef(edge.from) || !isPortRef(edge.to)) return;
      if (edge.to.kind === 'nodeSource' && edge.to.nodeId === node.id) prevs.push(portPosition(edge.from, nodes, boundaries));
      if (edge.from.kind === 'nodeTarget' && edge.from.nodeId === node.id) nexts.push(portPosition(edge.to, nodes, boundaries));
    });
    if (prevs.length > 0) {
      const v = prevs.reduce((sum, p) => sum + (p.y - node.y), 0) / prevs.length;
      addForce(forces, node.id, { x: 0, y: ATTRACT_Y * v });
    }
    if (nexts.length > 0) {
      const v = nexts.reduce((sum, p) => sum + (p.y - node.y), 0) / nexts.length;
      addForce(forces, node.id, { x: 0, y: ATTRACT_Y * v });
    }
  });

  let stable = true;
  forces.forEach((force, id) => {
    const node = nodes.get(id);
    if (!node) return;
    const move = smul(SPEED, force);
    if (norm(move) > MIN_MOVE) {
      node.x += move.x;
      node.y += move.y;
      stable = false;
    }
  });
  return stable;
};

const simulate = (g: SceneGraph) => {
  const nodes = new Map(makeSimNodes(g).map((node) => [node.id, node]));
  const boundaries = boundaryPoints(g);
  for (let i = 0; i < ITERATIONS; i += 1) {
    if (improveOnce(g, nodes, boundaries)) break;
  }
  return { nodes, boundaries, dirs: edgeDirections(g) };
};

const rawBounds = (nodes: Map<string, SimNode>, boundaries: Map<string, Vec>, edges: Vec[][]) => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const see = (p: Vec) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  };
  nodes.forEach((node) => {
    see({ x: node.x - node.w / 2, y: node.y - node.h / 2 });
    see({ x: node.x + node.w / 2, y: node.y + node.h / 2 });
  });
  boundaries.forEach(see);
  edges.forEach((edge) => edge.forEach(see));
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  return { minX, maxX, minY, maxY };
};

export const layoutSceneGraph = async (g: SceneGraph): Promise<LayoutGraph> => {
  const { nodes, boundaries, dirs } = simulate(g);
  const rawEdges = g.edges.flatMap((edge) => {
    if (!isPortRef(edge.from) || !isPortRef(edge.to)) return [];
    const p = portPosition(edge.from, nodes, boundaries);
    const q = portPosition(edge.to, nodes, boundaries);
    const d = norm(sub(q, p)) / 3;
    const ui = portDirection(edge, 'from', edge.from, dirs);
    const uo = portDirection(edge, 'to', edge.to, dirs);
    return [[p, add(p, smul(d, ui)), sub(q, smul(d, uo)), q]];
  });
  const bounds = rawBounds(nodes, boundaries, rawEdges);
  const toLayout = (p: Vec): LayoutPoint => ({ x: p.x - bounds.minX + PADDING, y: bounds.maxY - p.y + PADDING });

  const layoutNodes: LayoutNode[] = [
    ...Array.from(boundaries.entries()).map(([id, p]) => {
      const q = toLayout(p);
      return {
        id,
        label: '',
        color: '#8796a6',
        selectable: false,
        boundary: true,
        x: q.x - BOUNDARY_RADIUS / 2,
        y: q.y - BOUNDARY_RADIUS / 2,
        w: BOUNDARY_RADIUS,
        h: BOUNDARY_RADIUS
      };
    }),
    ...Array.from(nodes.values()).map((node) => {
      const q = toLayout({ x: node.x, y: node.y });
      return {
        id: node.id,
        label: node.label,
        color: node.color || '#7f8c8d',
        selectable: node.selectable,
        boundary: false,
        x: q.x - node.w / 2,
        y: q.y - node.h / 2,
        w: node.w,
        h: node.h
      };
    })
  ];

  const layoutEdges: LayoutEdge[] = g.edges.flatMap((edge) => {
    if (!isPortRef(edge.from) || !isPortRef(edge.to)) return [];
    const p = portPosition(edge.from, nodes, boundaries);
    const q = portPosition(edge.to, nodes, boundaries);
    const d = norm(sub(q, p)) / 3;
    const ui = portDirection(edge, 'from', edge.from, dirs);
    const uo = portDirection(edge, 'to', edge.to, dirs);
    return [{
      id: edge.id,
      color: edge.color,
      points: [p, add(p, smul(d, ui)), sub(q, smul(d, uo)), q].map(toLayout)
    }];
  });

  return {
    id: g.id,
    width: bounds.maxX - bounds.minX + PADDING * 2,
    height: bounds.maxY - bounds.minY + PADDING * 2,
    nodes: layoutNodes,
    edges: layoutEdges
  };
};

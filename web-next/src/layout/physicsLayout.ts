import type { PortRef, SceneGraph, SceneNode } from '../model/interop';
import type { LayoutEdge, LayoutGraph, LayoutNode, LayoutPoint } from './layoutTypes';

type Vec = { x: number; y: number };
type Shape = 'rect' | 'triangle' | 'cross' | 'circle';
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
  radius: number;
  inputs: number;
  outputs: number;
  sourceTypes: string[];
  targetTypes: string[];
  shape: Shape;
  pointLike: boolean;
  level: number;
  ceiling?: KnownPortRef;
  zeroLaneX?: number;
  crossDirs?: { a: Vec; b: Vec };
};

type BoundaryCursor =
  | { side: 'left' }
  | { side: 'right' }
  | { side: 'leftI'; port: KnownPortRef }
  | { side: 'rightI'; port: KnownPortRef }
  | { side: 'leftO'; port: KnownPortRef }
  | { side: 'rightO'; port: KnownPortRef };

type SimState = {
  nodes: Map<string, SimNode>;
  boundaries: Map<string, Vec>;
};

export type LayoutSeed = {
  nodePositions?: Map<string, LayoutPoint>;
  fallbackCenter?: LayoutPoint;
};

const SPEED = 0.01;
const MIN_MOVE = 0.2;
const ATTRACT_X = 5.0;
const ATTRACT_Y = 4.0;
const MIN_EDGE_DROP = 30;
const ATTRACT_FLOW = 2.5;
const MIN_ZERO_INPUT_SPACING = 82;
const ATTRACT_ZERO_INPUT_SPACING = 2.6;
const ITERATIONS = 420;
const PADDING = 24;
const BOUNDARY_RADIUS = 8;
const POINT_RADIUS = 5;
const CROSS_RADIUS = 5;
const TRIANGLE_RADIUS = 8;
const RECT_SPACING = 33;
const LEVEL_SPACING = 92;
const PORT_SPACING = 88;
const MIN_FLOW_LEVELS = 2;

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
const polar = (r: number, angle: number): Vec => ({ x: r * Math.cos(angle), y: r * Math.sin(angle) });

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

const samePort = (a: KnownPortRef, b: KnownPortRef) => portKey(a) === portKey(b);

const sameCursor = (a: BoundaryCursor, b: BoundaryCursor) => {
  if (a.side !== b.side) return false;
  if ('port' in a || 'port' in b) return 'port' in a && 'port' in b && samePort(a.port, b.port);
  return true;
};

const equalTypes = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, idx) => x === b[idx]);

const inferShape = (node: SceneNode, inputs: number, outputs: number): Shape => {
  const explicit = node.visual?.shape;
  if (explicit === 'rect' || explicit === 'square') return 'rect';
  if (explicit === 'circle' || explicit === 'point') return 'circle';
  if (explicit === 'cross') return 'cross';
  if (explicit === 'triangle') return 'triangle';
  if (node.visual?.radius !== undefined) return 'circle';
  const src = node.sourceTypes ?? [];
  const tgt = node.targetTypes ?? [];
  if (inputs === 0 && outputs === 1) return 'triangle';
  if (inputs === 2 && outputs === 1 && equalTypes(src, [tgt[0], tgt[0]])) return 'triangle';
  if (inputs === 2 && outputs === 2 && equalTypes(src, [tgt[1], tgt[0]])) return 'cross';
  return 'rect';
};

const nodeSize = (node: SceneNode, shape: Shape, inputs: number, outputs: number) => {
  if (node.visual?.size) return { w: Math.max(1, node.visual.size.x), h: Math.max(1, Math.abs(node.visual.size.y)) };
  if (shape === 'triangle') return { w: TRIANGLE_RADIUS * 2, h: TRIANGLE_RADIUS * 2 };
  if (shape === 'cross') return { w: CROSS_RADIUS * 2, h: CROSS_RADIUS * 2 };
  if (shape === 'circle') {
    const radius = node.visual?.radius ?? POINT_RADIUS;
    return { w: radius * 2, h: radius * 2 };
  }
  const size = Math.max(1, Math.max(inputs, outputs)) * RECT_SPACING;
  return { w: size, h: RECT_SPACING };
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
    const shape = inferShape(node, counts.inputs, counts.outputs);
    const size = nodeSize(node, shape, counts.inputs, counts.outputs);
    const radius = shape === 'triangle' ? TRIANGLE_RADIUS : shape === 'cross' ? CROSS_RADIUS : shape === 'circle' ? Math.max(size.w, size.h) / 2 : 0;
    return {
      source: node,
      id: node.id,
      label: node.label,
      color: node.color,
      selectable: node.selectable,
      x: 0,
      y: 0,
      w: size.w,
      h: size.h,
      radius,
      inputs: counts.inputs,
      outputs: counts.outputs,
      sourceTypes: node.sourceTypes ?? [],
      targetTypes: node.targetTypes ?? [],
      shape,
      pointLike: shape === 'cross' || shape === 'circle' || shape === 'triangle',
      level: 1
    };
  });
};

const nodeByLevelOrder = (nodes: Map<string, SimNode>) =>
  Array.from(nodes.values()).sort((a, b) => b.level - a.level || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));

const assignLevels = (g: SceneGraph, nodes: Map<string, SimNode>) => {
  const incoming = new Map<string, KnownPortRef[]>();
  g.edges.forEach((edge) => {
    if (!isPortRef(edge.from) || !isPortRef(edge.to)) return;
    if (edge.to.kind === 'nodeSource') {
      const refs = incoming.get(edge.to.nodeId) ?? [];
      refs.push(edge.from);
      incoming.set(edge.to.nodeId, refs);
    }
  });
  const visiting = new Set<string>();
  const visit = (node: SimNode): number => {
    if (!visiting.has(node.id) && node.level > 1) return node.level;
    if (visiting.has(node.id)) return node.level;
    visiting.add(node.id);
    let level = 1;
    (incoming.get(node.id) ?? []).forEach((ref) => {
      if (ref.kind !== 'nodeTarget') return;
      const pred = nodes.get(ref.nodeId);
      if (pred) level = Math.max(level, visit(pred) + 1);
    });
    visiting.delete(node.id);
    node.level = level;
    return level;
  };
  nodes.forEach(visit);
};

const boundaryPoints = (g: SceneGraph, maxLevel: number) => {
  const verticalLevels = Math.max(maxLevel, MIN_FLOW_LEVELS);
  const count = Math.max(g.sources, g.targets, 1);
  const width = Math.max(1, count - 1) * PORT_SPACING;
  const left = -width / 2;
  const sourceY = 0;
  const targetY = -(verticalLevels + 1) * LEVEL_SPACING;
  const points = new Map<string, Vec>();
  for (let i = 1; i <= g.sources; i += 1) {
    const denom = Math.max(1, g.sources - 1);
    points.set(portKey({ kind: 'source', index: i }), { x: left + ((i - 1) * width) / denom, y: sourceY });
  }
  for (let i = 1; i <= g.targets; i += 1) {
    const denom = Math.max(1, g.targets - 1);
    points.set(portKey({ kind: 'target', index: i }), { x: left + ((i - 1) * width) / denom, y: targetY });
  }
  return points;
};

const boundaryByKind = (boundaries: Map<string, Vec>, kind: 'source' | 'target') =>
  Array.from(boundaries.entries())
    .filter(([key]) => key.startsWith(`${kind}:`))
    .sort(([a], [b]) => Number(a.split(':')[1]) - Number(b.split(':')[1]))
    .map(([, p]) => p);

const interpolateBoundary = (points: Vec[], index: number) => {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const lo = Math.max(1, Math.min(points.length, Math.floor(index)));
  const hi = Math.max(1, Math.min(points.length, Math.ceil(index)));
  const a = points[lo - 1];
  const b = points[hi - 1];
  const t = index - lo;
  return add(a, smul(t, sub(b, a)));
};

const average = (points: Vec[]) =>
  points.length === 0
    ? { x: 0, y: 0 }
    : {
        x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
        y: points.reduce((sum, p) => sum + p.y, 0) / points.length
      };

const topPort = (node: SimNode, port: number): Vec => {
  if (node.shape === 'cross' || node.shape === 'circle') return { x: node.x, y: node.y };
  if (node.shape === 'triangle' && node.inputs === 2) {
    const v1 = polar(1, -Math.PI / 4);
    const v2 = polar(-1, Math.PI / 4);
    const v = port === 1 ? v1 : v2;
    return sub({ x: node.x, y: node.y }, smul(0.66 * node.radius, v));
  }
  const count = Math.max(1, node.inputs);
  const left = node.x - node.w / 2;
  return { x: left + (node.w / (2 * count)) * (2 * port - 1), y: node.y + node.h / 2 };
};

const bottomPort = (node: SimNode, port: number): Vec => {
  void port;
  if (node.shape === 'cross' || node.shape === 'circle') return { x: node.x, y: node.y };
  if (node.shape === 'triangle') return { x: node.x, y: node.y - 0.66 * node.radius };
  const count = Math.max(1, node.outputs);
  const left = node.x - node.w / 2;
  return { x: left + (node.w / (2 * count)) * (2 * port - 1), y: node.y - node.h / 2 };
};

const fakeTopPort = (node: SimNode, port: number): Vec => {
  if (node.shape === 'cross' || node.shape === 'triangle') return { x: node.x, y: node.y };
  if (node.shape === 'circle') return add({ x: node.x, y: node.y }, polar(0.66 * node.radius, (Math.PI * (node.inputs - port + 1)) / (node.inputs + 1)));
  const count = Math.max(1, node.inputs);
  const clamped = Math.max(1, Math.min(count, port));
  const lo = topPort(node, Math.floor(clamped));
  const hi = topPort(node, Math.ceil(clamped));
  const t = clamped - Math.floor(clamped);
  return add(lo, smul(t, sub(hi, lo)));
};

const fakeBottomPort = (node: SimNode, port: number): Vec => {
  if (node.shape === 'cross' || node.shape === 'triangle') return { x: node.x, y: node.y };
  if (node.shape === 'circle') return add({ x: node.x, y: node.y }, polar(0.66 * node.radius, (-Math.PI * (node.outputs - port + 1)) / (node.outputs + 1)));
  if (node.outputs <= 1) return bottomPort(node, 1);
  const clamped = Math.max(1, Math.min(node.outputs, port));
  const lo = bottomPort(node, Math.floor(clamped));
  const hi = bottomPort(node, Math.ceil(clamped));
  const t = clamped - Math.floor(clamped);
  return add(lo, smul(t, sub(hi, lo)));
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

const fakePortPosition = (p: KnownPortRef, nodes: Map<string, SimNode>, boundaries: Map<string, Vec>): Vec => {
  switch (p.kind) {
    case 'source':
      return interpolateBoundary(boundaryByKind(boundaries, 'source'), p.index);
    case 'target':
      return interpolateBoundary(boundaryByKind(boundaries, 'target'), p.index);
    case 'nodeSource': {
      const node = nodes.get(p.nodeId);
      return node ? fakeTopPort(node, p.port) : { x: 0, y: 0 };
    }
    case 'nodeTarget': {
      const node = nodes.get(p.nodeId);
      return node ? fakeBottomPort(node, p.port) : { x: 0, y: 0 };
    }
  }
};

const nextOpt = (g: SceneGraph, p: KnownPortRef): KnownPortRef | undefined => {
  const edge = g.edges.find((e) => isPortRef(e.from) && isPortRef(e.to) && samePort(e.from, p));
  return edge && isPortRef(edge.to) ? edge.to : undefined;
};

const prevOpt = (g: SceneGraph, p: KnownPortRef): KnownPortRef | undefined => {
  const edge = g.edges.find((e) => isPortRef(e.from) && isPortRef(e.to) && samePort(e.to, p));
  return edge && isPortRef(edge.from) ? edge.from : undefined;
};

const assignCeilings = (g: SceneGraph, nodes: Map<string, SimNode>) => {
  const step = (cursor: BoundaryCursor): { hits: SimNode[]; next: BoundaryCursor } => {
    switch (cursor.side) {
      case 'left':
        return { hits: [], next: g.sources === 0 ? { side: 'right' } : { side: 'leftI', port: { kind: 'source', index: 1 } } };
      case 'right':
        return { hits: [], next: g.targets === 0 ? { side: 'left' } : { side: 'rightO', port: { kind: 'target', index: g.targets } } };
      case 'leftI': {
        const next = nextOpt(g, cursor.port);
        return { hits: [], next: next ? { side: 'leftO', port: next } : { side: 'rightI', port: cursor.port } };
      }
      case 'rightO': {
        const prev = prevOpt(g, cursor.port);
        return { hits: [], next: prev ? { side: 'rightI', port: prev } : { side: 'leftO', port: cursor.port } };
      }
      case 'leftO': {
        const p = cursor.port;
        if (p.kind === 'target') return { hits: [], next: p.index === 1 ? { side: 'left' } : { side: 'rightO', port: { kind: 'target', index: p.index - 1 } } };
        if (p.kind === 'nodeSource') {
          const node = nodes.get(p.nodeId);
          if (!node) return { hits: [], next: { side: 'left' } };
          if (p.port === 1) {
            return {
              hits: [],
              next: node.outputs === 0
                ? { side: 'rightO', port: { kind: 'nodeSource', nodeId: node.id, port: node.inputs } }
                : { side: 'leftI', port: { kind: 'nodeTarget', nodeId: node.id, port: 1 } }
            };
          }
          return { hits: [], next: { side: 'rightO', port: { kind: 'nodeSource', nodeId: node.id, port: p.port - 1 } } };
        }
        return { hits: [], next: { side: 'left' } };
      }
      case 'rightI': {
        const p = cursor.port;
        if (p.kind === 'source') return { hits: [], next: p.index === g.sources ? { side: 'right' } : { side: 'leftI', port: { kind: 'source', index: p.index + 1 } } };
        if (p.kind === 'nodeTarget') {
          const node = nodes.get(p.nodeId);
          if (!node) return { hits: [], next: { side: 'right' } };
          if (p.port === node.outputs) {
            return {
              hits: node.inputs === 0 ? [node] : [],
              next: node.inputs === 0
                ? { side: 'leftI', port: { kind: 'nodeTarget', nodeId: node.id, port: 1 } }
                : { side: 'rightO', port: { kind: 'nodeSource', nodeId: node.id, port: node.inputs } }
            };
          }
          return { hits: [], next: { side: 'leftI', port: { kind: 'nodeTarget', nodeId: node.id, port: p.port + 1 } } };
        }
        return { hits: [], next: { side: 'right' } };
      }
    }
  };

  const collect = (start: BoundaryCursor) => {
    const hits: SimNode[] = [];
    let { hits: firstHits, next } = step(start);
    hits.push(...firstHits);
    let guard = 0;
    while (!sameCursor(next, start) && guard < 10000) {
      const result = step(next);
      hits.push(...result.hits);
      next = result.next;
      guard += 1;
    }
    return hits;
  };

  const addCeiling = (hits: SimNode[], ceiling: (p: number) => KnownPortRef) => {
    const denom = hits.length + 1;
    hits.forEach((node, idx) => {
      node.ceiling = ceiling((idx + 1) / denom);
    });
  };

  addCeiling(collect({ side: 'left' }), (p) => ({ kind: 'source', index: 0.5 + p / 2 }));
  for (let i = 1; i <= g.sources; i += 1) {
    const d = i === g.sources ? 2 : 1;
    addCeiling(collect({ side: 'rightI', port: { kind: 'source', index: i } }), (p) => ({ kind: 'source', index: i + p / d }));
  }
  nodes.forEach((node) => {
    for (let i = 1; i <= node.outputs - 1; i += 1) {
      addCeiling(
        collect({ side: 'rightI', port: { kind: 'nodeTarget', nodeId: node.id, port: i } }),
        (p) => ({ kind: 'nodeTarget', nodeId: node.id, port: i + p })
      );
    }
  });

  nodes.forEach((node) => {
    if (node.inputs === 0 && !node.ceiling) node.ceiling = { kind: 'source', index: (g.sources + 1) / 2 };
  });
};

const seedInitialPositions = (g: SceneGraph, nodes: Map<string, SimNode>, boundaries: Map<string, Vec>, seed?: LayoutSeed) => {
  const maxLevel = Array.from(nodes.values()).reduce((m, node) => Math.max(m, node.level), 0);
  const sourcePoints = boundaryByKind(boundaries, 'source');
  const targetPoints = boundaryByKind(boundaries, 'target');
  const sourceY = sourcePoints.length > 0 ? average(sourcePoints).y : 0;
  const targetY = targetPoints.length > 0 ? average(targetPoints).y : -(maxLevel + 1) * LEVEL_SPACING;
  const fallbackX = seed?.fallbackCenter?.x ?? 0;
  const fallbackY = seed?.fallbackCenter?.y ?? (sourceY + targetY) * 0.5;

  const refX = (ref: KnownPortRef): number | undefined => {
    if (ref.kind === 'source' || ref.kind === 'target') return boundaries.get(portKey(ref))?.x;
    const node = nodes.get(ref.nodeId);
    if (!node) return undefined;
    return node.x !== 0 || node.y !== 0 ? node.x : undefined;
  };

  const ceilingX = (node: SimNode): number | undefined => {
    if (!node.ceiling) return undefined;
    if (node.ceiling.kind === 'source' || node.ceiling.kind === 'target') {
      return fakePortPosition(node.ceiling, nodes, boundaries).x;
    }
    const anchor = nodes.get(node.ceiling.nodeId);
    if (!anchor || (anchor.x === 0 && anchor.y === 0)) return undefined;
    return fakePortPosition(node.ceiling, nodes, boundaries).x;
  };

  nodeByLevelOrder(nodes).forEach((node) => {
    const prev = seed?.nodePositions?.get(node.id);
    if (prev) {
      node.x = prev.x;
      node.y = prev.y;
      return;
    }
    const levelT = node.level / Math.max(1, maxLevel + 1);
    node.y = targetY + (sourceY - targetY) * levelT;
    const anchors: number[] = [];
    g.edges.forEach((edge) => {
      if (!isPortRef(edge.from) || !isPortRef(edge.to)) return;
      if (edge.to.kind === 'nodeSource' && edge.to.nodeId === node.id) {
        const x = refX(edge.from);
        if (x !== undefined) anchors.push(x);
      }
      if (edge.from.kind === 'nodeTarget' && edge.from.nodeId === node.id) {
        const x = refX(edge.to);
        if (x !== undefined) anchors.push(x);
      }
    });
    const noInputAnchor = node.inputs === 0 ? ceilingX(node) : undefined;
    node.x = noInputAnchor ?? (anchors.length > 0 ? anchors.reduce((sum, x) => sum + x, 0) / anchors.length : fallbackX);
    if (seed?.fallbackCenter && !seed.nodePositions?.has(node.id)) {
      node.x = node.x * 0.45 + fallbackX * 0.55;
      node.y = node.y * 0.92 + fallbackY * 0.08;
    }
  });

  const byLevel = new Map<number, SimNode[]>();
  nodes.forEach((node) => {
    const bucket = byLevel.get(node.level) ?? [];
    bucket.push(node);
    byLevel.set(node.level, bucket);
  });
  byLevel.forEach((bucket) => {
    bucket.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    bucket.forEach((node, idx) => {
      node.x += (idx - (bucket.length - 1) / 2) * Math.min(24, PORT_SPACING / Math.max(1, bucket.length));
    });
  });
};

const assignZeroInputLanes = (nodes: Map<string, SimNode>, boundaries: Map<string, Vec>) => {
  const byLevel = new Map<number, SimNode[]>();
  nodes.forEach((node) => {
    if (node.inputs !== 0) return;
    const bucket = byLevel.get(node.level) ?? [];
    bucket.push(node);
    byLevel.set(node.level, bucket);
  });
  byLevel.forEach((bucket) => {
    bucket.sort((a, b) => a.x - b.x || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    const center = average(bucket.map((node) => node.ceiling ? fakePortPosition(node.ceiling, nodes, boundaries) : { x: node.x, y: node.y }));
    const spacing = Math.max(MIN_ZERO_INPUT_SPACING, PORT_SPACING * 1.12);
    bucket.forEach((node, idx) => {
      node.zeroLaneX = center.x + (idx - (bucket.length - 1) / 2) * spacing;
      node.x = node.x * 0.35 + node.zeroLaneX * 0.65;
    });
  });
};

const sourceDir = (node: SimNode, port: number) => {
  if (node.shape === 'triangle' && node.inputs === 2) return port === 1 ? polar(1, -Math.PI / 4) : polar(-1, Math.PI / 4);
  if (node.shape === 'cross' && node.crossDirs) return port === 1 ? node.crossDirs.a : node.crossDirs.b;
  if (!node.pointLike) return { x: 0, y: -1 };
  return polar(-1, (Math.PI * (node.inputs - port + 1)) / (node.inputs + 1));
};

const targetDir = (node: SimNode, port: number) => {
  if (node.shape === 'triangle') return { x: 0, y: -1 };
  if (node.shape === 'cross' && node.crossDirs) return port === 1 ? node.crossDirs.b : node.crossDirs.a;
  if (!node.pointLike) return { x: 0, y: -1 };
  return polar(1, (-Math.PI * (node.outputs - port + 1)) / (node.outputs + 1));
};

const portDirection = (ref: KnownPortRef, nodes: Map<string, SimNode>) => {
  if (ref.kind === 'nodeSource') {
    const node = nodes.get(ref.nodeId);
    return node ? sourceDir(node, ref.port) : { x: 0, y: -1 };
  }
  if (ref.kind === 'nodeTarget') {
    const node = nodes.get(ref.nodeId);
    return node ? targetDir(node, ref.port) : { x: 0, y: -1 };
  }
  return { x: 0, y: -1 };
};

const updateCrossDirections = (g: SceneGraph, nodes: Map<string, SimNode>, boundaries: Map<string, Vec>) => {
  nodes.forEach((node) => {
    if (node.shape !== 'cross' || node.inputs !== 2 || node.outputs !== 2) return;
    const incoming = (port: number) => {
      const edge = g.edges.find((e) => isPortRef(e.from) && isPortRef(e.to) && e.to.kind === 'nodeSource' && e.to.nodeId === node.id && e.to.port === port);
      if (!edge || !isPortRef(edge.from)) return undefined;
      return { pos: portPosition(edge.from, nodes, boundaries), dir: portDirection(edge.from, nodes) };
    };
    const outgoing = (port: number) => {
      const edge = g.edges.find((e) => isPortRef(e.from) && isPortRef(e.to) && e.from.kind === 'nodeTarget' && e.from.nodeId === node.id && e.from.port === port);
      if (!edge || !isPortRef(edge.to)) return undefined;
      return { pos: portPosition(edge.to, nodes, boundaries), dir: portDirection(edge.to, nodes) };
    };
    const d = (a: { pos: Vec; dir: Vec } | undefined, b: { pos: Vec; dir: Vec } | undefined) => {
      if (!a || !b) return undefined;
      const distance = norm(sub(b.pos, a.pos)) / 4;
      return unit(sub(sub(b.pos, a.pos), smul(distance, add(a.dir, b.dir))));
    };
    const a = d(incoming(1), outgoing(2));
    const b = d(incoming(2), outgoing(1));
    if (a && b) node.crossDirs = { a, b };
  });
};

const addForce = (forces: Map<string, Vec>, id: string, force: Vec) => {
  forces.set(id, add(forces.get(id) ?? { x: 0, y: 0 }, force));
};

const improveOnce = (g: SceneGraph, nodes: Map<string, SimNode>, boundaries: Map<string, Vec>) => {
  updateCrossDirections(g, nodes, boundaries);
  const forces = new Map<string, Vec>();
  const maxLevel = Array.from(nodes.values()).reduce((m, node) => Math.max(m, node.level), 0);

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
    if (edge.from.kind === 'nodeTarget' && edge.to.kind === 'nodeSource') {
      const from = nodes.get(edge.from.nodeId);
      const to = nodes.get(edge.to.nodeId);
      if (from && to && from.id !== to.id) {
        const drop = from.y - to.y;
        if (drop < MIN_EDGE_DROP) {
          const correction = MIN_EDGE_DROP - drop;
          addForce(forces, from.id, { x: 0, y: ATTRACT_FLOW * correction / Math.max(1, from.outputs) });
          addForce(forces, to.id, { x: 0, y: -ATTRACT_FLOW * correction / Math.max(1, to.inputs) });
        }
      }
    }
  });

  nodes.forEach((node) => {
    if (node.inputs === 0 && node.ceiling) {
      const ceiling = fakePortPosition(node.ceiling, nodes, boundaries);
      const ceilingWeight = node.zeroLaneX === undefined ? ATTRACT_X : 1.2;
      addForce(forces, node.id, smul(ceilingWeight, { x: ceiling.x - node.x, y: 0 }));
    }
    if (node.inputs === 0 && node.zeroLaneX !== undefined) {
      addForce(forces, node.id, { x: 5.5 * (node.zeroLaneX - node.x), y: 0 });
    }
  });

  const zeroInputNodes = Array.from(nodes.values()).filter((node) => node.inputs === 0);
  for (let i = 0; i < zeroInputNodes.length; i += 1) {
    for (let j = i + 1; j < zeroInputNodes.length; j += 1) {
      const a = zeroInputNodes[i];
      const b = zeroInputNodes[j];
      if (Math.abs(a.y - b.y) > LEVEL_SPACING * 1.1) continue;
      const dx = b.x - a.x;
      const gap = Math.abs(dx);
      if (gap >= MIN_ZERO_INPUT_SPACING) continue;
      const dir = dx === 0 ? (a.id < b.id ? 1 : -1) : Math.sign(dx);
      const correction = (MIN_ZERO_INPUT_SPACING - gap) * ATTRACT_ZERO_INPUT_SPACING;
      addForce(forces, a.id, { x: -dir * correction, y: 0 });
      addForce(forces, b.id, { x: dir * correction, y: 0 });
    }
  }

  nodes.forEach((node) => {
    const prevs: Vec[] = [];
    const nexts: Vec[] = [];
    let prevLevel = maxLevel + 2;
    let nextLevel = -1;
    g.edges.forEach((edge) => {
      if (!isPortRef(edge.from) || !isPortRef(edge.to)) return;
      if (edge.to.kind === 'nodeSource' && edge.to.nodeId === node.id) {
        const level = edge.from.kind === 'nodeTarget' ? nodes.get(edge.from.nodeId)?.level ?? 0 : maxLevel + 1;
        const p = portPosition(edge.from, nodes, boundaries);
        if (level < prevLevel) {
          prevLevel = level;
          prevs.length = 0;
          prevs.push(p);
        } else if (level === prevLevel) prevs.push(p);
      }
      if (edge.from.kind === 'nodeTarget' && edge.from.nodeId === node.id) {
        const level = edge.to.kind === 'nodeSource' ? nodes.get(edge.to.nodeId)?.level ?? 0 : 0;
        const p = portPosition(edge.to, nodes, boundaries);
        if (level > nextLevel) {
          nextLevel = level;
          nexts.length = 0;
          nexts.push(p);
        } else if (level === nextLevel) nexts.push(p);
      }
    });
    if (node.inputs === 0 && node.ceiling) {
      prevs.length = 0;
      prevs.push(fakePortPosition(node.ceiling, nodes, boundaries));
    }
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

const initSimulation = (g: SceneGraph, seed?: LayoutSeed): SimState => {
  const nodes = new Map(makeSimNodes(g).map((node) => [node.id, node]));
  assignLevels(g, nodes);
  const maxLevel = Array.from(nodes.values()).reduce((m, node) => Math.max(m, node.level), 0);
  const boundaries = boundaryPoints(g, maxLevel);
  assignCeilings(g, nodes);
  seedInitialPositions(g, nodes, boundaries, seed);
  assignZeroInputLanes(nodes, boundaries);
  updateCrossDirections(g, nodes, boundaries);
  return { nodes, boundaries };
};

const simulate = (g: SceneGraph, seed?: LayoutSeed) => {
  const state = initSimulation(g, seed);
  for (let i = 0; i < ITERATIONS; i += 1) {
    if (improveOnce(g, state.nodes, state.boundaries)) break;
  }
  return state;
};

const curveForEdge = (edge: { from: KnownPortRef; to: KnownPortRef; id: string; color: string }, nodes: Map<string, SimNode>, boundaries: Map<string, Vec>) => {
  const p = portPosition(edge.from, nodes, boundaries);
  const q = portPosition(edge.to, nodes, boundaries);
  const d = Math.max(18, Math.min(74, norm(sub(q, p)) / 3));
  const ui = portDirection(edge.from, nodes);
  const uo = portDirection(edge.to, nodes);
  return [p, add(p, smul(d, ui)), sub(q, smul(d, uo)), q];
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

const layoutFromSimulation = (g: SceneGraph, { nodes, boundaries }: SimState): LayoutGraph => {
  const knownEdges = g.edges.flatMap((edge) => (isPortRef(edge.from) && isPortRef(edge.to) ? [{ ...edge, from: edge.from, to: edge.to }] : []));
  const rawEdges = knownEdges.map((edge) => curveForEdge(edge, nodes, boundaries));
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
        shape: 'circle' as const,
        inputs: 1,
        outputs: 1,
        modelX: p.x,
        modelY: p.y,
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
        shape: node.shape,
        inputs: node.inputs,
        outputs: node.outputs,
        modelX: node.x,
        modelY: node.y,
        x: q.x - node.w / 2,
        y: q.y - node.h / 2,
        w: node.w,
        h: node.h
      };
    })
  ];

  const layoutEdges: LayoutEdge[] = knownEdges.map((edge, idx) => ({
    id: edge.id,
    color: edge.color,
    points: rawEdges[idx].map(toLayout)
  }));

  return {
    id: g.id,
    width: bounds.maxX - bounds.minX + PADDING * 2,
    height: bounds.maxY - bounds.minY + PADDING * 2,
    nodes: layoutNodes,
    edges: layoutEdges
  };
};

export const layoutSceneGraph = async (g: SceneGraph, seed?: LayoutSeed): Promise<LayoutGraph> =>
  layoutFromSimulation(g, simulate(g, seed));

const nextAnimationFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const animateSceneGraphLayout = async (
  g: SceneGraph,
  onFrame: (layout: LayoutGraph, iteration: number) => void,
  options: {
    frameEvery?: number;
    forceFrameUntil?: number;
    maxIterations?: number;
    frameDelayMs?: number;
    shouldPause?: () => boolean;
    shouldStop?: () => boolean;
    waitWhilePaused?: () => Promise<void>;
    seed?: LayoutSeed;
  } = {}
): Promise<LayoutGraph> => {
  const frameEvery = options.frameEvery ?? 5;
  const forceFrameUntil = options.forceFrameUntil ?? 0;
  const maxIterations = options.maxIterations ?? ITERATIONS;
  const frameDelayMs = options.frameDelayMs ?? 0;
  const state = initSimulation(g, options.seed);
  onFrame(layoutFromSimulation(g, state), 0);
  for (let i = 1; i <= maxIterations; i += 1) {
    if (options.shouldStop?.()) break;
    while (options.shouldPause?.() && !options.shouldStop?.()) {
      if (options.waitWhilePaused) await options.waitWhilePaused();
      else await wait(50);
    }
    if (options.shouldStop?.()) break;
    const stable = improveOnce(g, state.nodes, state.boundaries);
    if (i <= forceFrameUntil || i % frameEvery === 0 || stable) {
      onFrame(layoutFromSimulation(g, state), i);
      await nextAnimationFrame();
      if (frameDelayMs > 0) await wait(frameDelayMs);
    }
    if (stable) break;
  }
  const finalLayout = layoutFromSimulation(g, state);
  onFrame(finalLayout, maxIterations);
  return finalLayout;
};

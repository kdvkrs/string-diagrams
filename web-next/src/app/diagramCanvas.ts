import { toScreen, type Point, type Rect, type View } from '../diagramSvg';
import type { LayoutGraph, LayoutNode, LayoutPoint } from '../layout/layoutTypes';
import type { CrossingDiagnostic } from './config';

export const viewForLayout = (g: LayoutGraph, panel: Rect, zoomFactor: number): View => {
  const pad = 18;
  const w = Math.max(1, g.width + pad * 2);
  const h = Math.max(1, g.height + pad * 2);
  const scale = Math.max(0.05, Math.min(panel.w / w, panel.h / h)) * zoomFactor;
  return {
    scale,
    tx: panel.x + panel.w * 0.5 - (g.width * 0.5) * scale,
    ty: panel.y + panel.h * 0.5 - (g.height * 0.5) * scale
  };
};

export const inPanel = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

const distSq = (a: LayoutPoint, b: LayoutPoint) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

const sameLayoutPoint = (a: LayoutPoint, b: LayoutPoint) => distSq(a, b) < 1e-4;

const cubicPoint = (p0: LayoutPoint, p1: LayoutPoint, p2: LayoutPoint, p3: LayoutPoint, t: number): LayoutPoint => {
  const mt = 1 - t;
  const a = mt ** 3;
  const b = 3 * mt ** 2 * t;
  const c = 3 * mt * t ** 2;
  const d = t ** 3;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
  };
};

const edgeSamples = (points: LayoutPoint[]) => {
  if (points.length === 4) {
    const out: LayoutPoint[] = [];
    for (let i = 0; i <= 16; i += 1) out.push(cubicPoint(points[0], points[1], points[2], points[3], i / 16));
    return out;
  }
  return points;
};

const segmentIntersection = (a: LayoutPoint, b: LayoutPoint, c: LayoutPoint, d: LayoutPoint): LayoutPoint | null => {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-6) return null;
  const q = { x: c.x - a.x, y: c.y - a.y };
  const t = (q.x * s.y - q.y * s.x) / denom;
  const u = (q.x * r.y - q.y * r.x) / denom;
  if (t <= 0.04 || t >= 0.96 || u <= 0.04 || u >= 0.96) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
};

const edgePairSharesEndpoint = (a: LayoutPoint[], b: LayoutPoint[]) => {
  const a0 = a[0];
  const a1 = a[a.length - 1];
  const b0 = b[0];
  const b1 = b[b.length - 1];
  return Boolean(a0 && a1 && b0 && b1 && (
    sameLayoutPoint(a0, b0) || sameLayoutPoint(a0, b1) || sameLayoutPoint(a1, b0) || sameLayoutPoint(a1, b1)
  ));
};

const crossingIsAtExplicitNode = (g: LayoutGraph, p: LayoutPoint) =>
  g.nodes.some((node) => {
    if (node.boundary || node.shape !== 'cross') return false;
    const center = { x: node.x + node.w * 0.5, y: node.y + node.h * 0.5 };
    return distSq(center, p) < Math.max(16, node.w * 2, node.h * 2) ** 2;
  });

export const crossingDiagnosticsForGraph = (g: LayoutGraph, view: View): CrossingDiagnostic[] => {
  const out: CrossingDiagnostic[] = [];
  const sampled = g.edges.map((edge) => ({ edge, samples: edgeSamples(edge.points) }));
  for (let i = 0; i < sampled.length; i += 1) {
    for (let j = i + 1; j < sampled.length; j += 1) {
      const a = sampled[i];
      const b = sampled[j];
      if (edgePairSharesEndpoint(a.samples, b.samples)) continue;
      let found: LayoutPoint | null = null;
      for (let ai = 0; ai < a.samples.length - 1 && !found; ai += 1) {
        for (let bi = 0; bi < b.samples.length - 1 && !found; bi += 1) {
          found = segmentIntersection(a.samples[ai], a.samples[ai + 1], b.samples[bi], b.samples[bi + 1]);
        }
      }
      if (found && !crossingIsAtExplicitNode(g, found)) {
        out.push({ graphId: g.id, edgeA: a.edge.id, edgeB: b.edge.id, point: toScreen(found, view) });
      }
    }
  }
  return out;
};

export const roundedRectPath = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.arcTo(x + w, y, x + w, y + rr, rr);
  c.lineTo(x + w, y + h - rr);
  c.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  c.lineTo(x + rr, y + h);
  c.arcTo(x, y + h, x, y + h - rr, rr);
  c.lineTo(x, y + rr);
  c.arcTo(x, y, x + rr, y, rr);
  c.closePath();
};

const strokeSmoothPolyline = (c: CanvasRenderingContext2D, points: Point[]) => {
  if (points.length < 2) return;
  c.beginPath();
  c.moveTo(points[0].x, points[0].y);
  if (points.length === 4) {
    c.bezierCurveTo(points[1].x, points[1].y, points[2].x, points[2].y, points[3].x, points[3].y);
  } else if (points.length === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const dy = Math.max(18, Math.abs(p1.y - p0.y) * 0.45);
    c.bezierCurveTo(p0.x, p0.y + dy, p1.x, p1.y - dy, p1.x, p1.y);
  } else {
    for (let i = 1; i < points.length - 1; i += 1) {
      const mid = { x: (points[i].x + points[i + 1].x) * 0.5, y: (points[i].y + points[i + 1].y) * 0.5 };
      c.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
    }
    const last = points[points.length - 1];
    c.lineTo(last.x, last.y);
  }
  c.stroke();
};

export const screenNodeRect = (node: LayoutNode, view: View, preview = false): Rect => {
  const center = toScreen({ x: node.x + node.w * 0.5, y: node.y + node.h * 0.5 }, view);
  const minW = node.boundary ? (preview ? 4 : 8) : (preview ? 5 : 22);
  const minH = node.boundary ? (preview ? 4 : 8) : (preview ? 5 : 18);
  const w = Math.max(minW, node.w * view.scale * (preview ? 0.78 : 1));
  const h = Math.max(minH, node.h * view.scale * (preview ? 0.78 : 1));
  return { x: center.x - w * 0.5, y: center.y - h * 0.5, w, h };
};

const drawNode = ({
  ctx,
  node,
  view,
  selected,
  preview = false,
  cssVar,
  showNodeLabels
}: {
  ctx: CanvasRenderingContext2D;
  node: LayoutNode;
  view: View;
  selected: Set<string>;
  preview?: boolean;
  cssVar: (name: string, fallback: string) => string;
  showNodeLabels: boolean;
}) => {
  const p = screenNodeRect(node, view, preview);
  const { w, h } = p;
  if (node.boundary) {
    ctx.fillStyle = cssVar('--pin', '#9aa8b8');
    ctx.beginPath();
    const r = Math.min(preview ? 2.4 : 3.4, Math.max(preview ? 1.5 : 2.2, Math.min(w, h) * 0.28));
    ctx.arc(p.x + w * 0.5, p.y + h * 0.5, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const isSel = selected.has(node.id);
  ctx.fillStyle = node.color || '#7f8c8d';
  ctx.strokeStyle = isSel ? cssVar('--accent', '#3b73c4') : '#243949';
  ctx.lineWidth = preview ? 0.75 : isSel ? 3.2 : 1.6;
  if (node.shape === 'circle' || node.shape === 'cross') {
    ctx.beginPath();
    ctx.arc(p.x + w * 0.5, p.y + h * 0.5, Math.max(w, h) * 0.5, 0, Math.PI * 2);
  } else if (node.shape === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + w, p.y);
    ctx.lineTo(p.x + w * 0.5, p.y + h);
    ctx.closePath();
  } else {
    roundedRectPath(ctx, p.x, p.y, w, h, preview ? 2 : 6);
  }
  ctx.fill();
  ctx.stroke();
  if (!preview && showNodeLabels) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12px Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelY = node.shape === 'triangle' ? p.y + h * 0.42 : p.y + h * 0.5 + 0.5;
    ctx.fillText(node.label, p.x + w * 0.5, labelY);
  }
};

export const drawQuestionEquals = (c: CanvasRenderingContext2D, x: number, y: number, size = 34) => {
  c.save();
  c.fillStyle = '#47607a';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `650 ${size}px "Avenir Next", sans-serif`;
  c.fillText('=', x, y + size * 0.08);
  c.font = `700 ${Math.max(15, size * 0.56)}px "Avenir Next", sans-serif`;
  c.fillText('?', x, y - size * 0.48);
  c.restore();
};

export const drawPlainEquals = (c: CanvasRenderingContext2D, x: number, y: number, size = 28) => {
  c.save();
  c.fillStyle = '#47607a';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `900 ${size}px "Avenir Next", sans-serif`;
  c.fillText('=', x, y);
  c.restore();
};

export const drawLayoutGraphOn = ({
  ctx,
  graph,
  panel,
  selected,
  view,
  cssVar,
  showNodeLabels
}: {
  ctx: CanvasRenderingContext2D;
  graph: LayoutGraph;
  panel: Rect;
  selected: Set<string>;
  view: View;
  cssVar: (name: string, fallback: string) => string;
  showNodeLabels: boolean;
}) => {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d4deea';
  ctx.lineWidth = 1.2;
  roundedRectPath(ctx, panel.x, panel.y, panel.w, panel.h, 14);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  roundedRectPath(ctx, panel.x, panel.y, panel.w, panel.h, 14);
  ctx.clip();
  graph.edges.forEach((edge) => {
    ctx.strokeStyle = edge.color || '#2f4f67';
    ctx.lineWidth = 2.8;
    strokeSmoothPolyline(ctx, edge.points.map((p) => toScreen(p, view)));
  });
  graph.nodes.forEach((node) => drawNode({ ctx, node, view, selected, cssVar, showNodeLabels }));
  ctx.restore();
};

export const drawPendingGraph = (ctx: CanvasRenderingContext2D, panel: Rect) => {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d4deea';
  ctx.lineWidth = 1.2;
  roundedRectPath(ctx, panel.x, panel.y, panel.w, panel.h, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#6b7f92';
  ctx.font = '600 14px "Avenir Next", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('laying out diagram...', panel.x + panel.w * 0.5, panel.y + panel.h * 0.5);
};

export const drawLasso = ({
  ctx,
  lasso,
  dragging
}: {
  ctx: CanvasRenderingContext2D;
  lasso: Point[];
  dragging: boolean;
}) => {
  if (lasso.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(lasso[0].x, lasso[0].y);
  for (let i = 1; i < lasso.length; i += 1) ctx.lineTo(lasso[i].x, lasso[i].y);
  if (!dragging) ctx.closePath();
  ctx.fillStyle = 'rgba(41, 128, 185, 0.15)';
  ctx.strokeStyle = '#1f6da0';
  ctx.lineWidth = 2.4;
  ctx.fill();
  ctx.stroke();
};

export const pointInPolygon = (p: Point, poly: Point[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    const crosses = (pi.y > p.y) !== (pj.y > p.y);
    if (!crosses) continue;
    const x = ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (p.x < x) inside = !inside;
  }
  return inside;
};

export const nodeHitByLasso = (node: LayoutNode, view: View, poly: Point[]) => {
  if (node.boundary || !node.selectable) return false;
  const x0 = node.x;
  const y0 = node.y;
  const x1 = node.x + node.w;
  const y1 = node.y + node.h;
  const pts = node.shape === 'triangle'
    ? [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: (x0 + x1) * 0.5, y: y1 },
        { x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.55 }
      ]
    : node.shape === 'circle' || node.shape === 'cross'
      ? [{ x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5 }]
      : [
          { x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5 },
          { x: x0, y: y0 },
          { x: x0, y: y1 },
          { x: x1, y: y0 },
          { x: x1, y: y1 }
        ];
  return pts.some((p) => pointInPolygon(toScreen(p, view), poly));
};

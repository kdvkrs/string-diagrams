import type { LayoutGraph, LayoutNode, LayoutPoint } from './layout/layoutTypes';

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type View = { scale: number; tx: number; ty: number };
export type SvgOpts = { pinColor?: string; showLabels?: boolean; transparent?: boolean };

export const viewForLayoutScale = (g: LayoutGraph, panel: Rect, scale: number): View => ({
  scale,
  tx: panel.x + panel.w * 0.5 - (g.width * 0.5) * scale,
  ty: panel.y + panel.h * 0.5 - (g.height * 0.5) * scale
});

export const previewViewForLayout = (g: LayoutGraph, panel: Rect, zoomFactor: number, allowHorizontalOverflow: boolean): View => {
  const pad = 14;
  const w = Math.max(1, g.width + pad * 2);
  const h = Math.max(1, g.height + pad * 2);
  const horizontalAllowance = allowHorizontalOverflow ? 2.2 : 1;
  const scale = Math.max(0.05, Math.min((panel.w * horizontalAllowance) / w, panel.h / h)) * zoomFactor;
  return viewForLayoutScale(g, panel, scale);
};

export const toScreen = (p: LayoutPoint, v: View): Point => ({ x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty });

export const spreadPreviewUnitTriangles = (g: LayoutGraph): LayoutGraph => {
  const unitTriangles = g.nodes.filter((node) => !node.boundary && node.shape === 'triangle' && node.inputs === 0);
  if (unitTriangles.length < 2) return g;

  const shifts = new Map<string, number>();
  const byBand = new Map<number, LayoutNode[]>();
  unitTriangles.forEach((node) => {
    const centerY = node.y + node.h * 0.5;
    const band = Math.round(centerY / 36);
    const bucket = byBand.get(band) ?? [];
    bucket.push(node);
    byBand.set(band, bucket);
  });

  byBand.forEach((bucket) => {
    if (bucket.length < 2) return;
    bucket.sort((a, b) => (a.x + a.w * 0.5) - (b.x + b.w * 0.5) || a.id.localeCompare(b.id));
    const centers = bucket.map((node) => node.x + node.w * 0.5);
    const center = centers.reduce((sum, x) => sum + x, 0) / centers.length;
    const currentGap = bucket.length > 1 ? (centers[centers.length - 1] - centers[0]) / (bucket.length - 1) : 0;
    const gap = Math.max(90, currentGap);
    bucket.forEach((node, idx) => {
      const nextCenter = center + (idx - (bucket.length - 1) * 0.5) * gap;
      shifts.set(node.id, nextCenter - (node.x + node.w * 0.5));
    });
  });

  if (shifts.size === 0) return g;

  const nodes = g.nodes.map((node) => {
    const dx = shifts.get(node.id) ?? 0;
    return dx === 0 ? { ...node } : { ...node, x: node.x + dx };
  });
  const edges = g.edges.map((edge) => {
    const points = edge.points.map((point) => ({ ...point }));
    shifts.forEach((dx, nodeId) => {
      if (edge.id.startsWith(`${nodeId}:`)) {
        points[0].x += dx;
        if (points[1]) points[1].x += dx;
      }
      if (edge.id.includes(`->${nodeId}:`)) {
        points[points.length - 1].x += dx;
        if (points[points.length - 2]) points[points.length - 2].x += dx;
      }
    });
    return { ...edge, points };
  });

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const see = (point: LayoutPoint) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };
  nodes.forEach((node) => {
    see({ x: node.x, y: node.y });
    see({ x: node.x + node.w, y: node.y + node.h });
  });
  edges.forEach((edge) => edge.points.forEach(see));
  const pad = 8;
  const dx = pad - minX;
  const dy = pad - minY;
  return {
    ...g,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
    nodes: nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy })),
    edges: edges.map((edge) => ({ ...edge, points: edge.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) }))
  };
};

const escAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const svgSmoothPath = (points: Point[]) => {
  if (points.length < 2) return '';
  const fmt = (n: number) => Number(n.toFixed(2));
  const start = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  if (points.length === 4) {
    return `${start} C ${fmt(points[1].x)} ${fmt(points[1].y)} ${fmt(points[2].x)} ${fmt(points[2].y)} ${fmt(points[3].x)} ${fmt(points[3].y)}`;
  }
  if (points.length === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const dy = Math.max(18, Math.abs(p1.y - p0.y) * 0.45);
    return `${start} C ${fmt(p0.x)} ${fmt(p0.y + dy)} ${fmt(p1.x)} ${fmt(p1.y - dy)} ${fmt(p1.x)} ${fmt(p1.y)}`;
  }
  const parts = [start];
  for (let i = 1; i < points.length - 1; i += 1) {
    const mid = { x: (points[i].x + points[i + 1].x) * 0.5, y: (points[i].y + points[i + 1].y) * 0.5 };
    parts.push(`Q ${fmt(points[i].x)} ${fmt(points[i].y)} ${fmt(mid.x)} ${fmt(mid.y)}`);
  }
  const last = points[points.length - 1];
  parts.push(`L ${fmt(last.x)} ${fmt(last.y)}`);
  return parts.join(' ');
};

const svgNode = (node: LayoutNode, view: View, opts: SvgOpts = {}) => {
  const { pinColor = '#9aa8b8', showLabels = false } = opts;
  const center = toScreen({ x: node.x + node.w * 0.5, y: node.y + node.h * 0.5 }, view);
  const minW = node.boundary ? 3 : Math.max(5, view.scale * 7);
  const minH = node.boundary ? 3 : Math.max(5, view.scale * 7);
  const w = Math.max(minW, node.w * view.scale * 0.9);
  const h = Math.max(minH, node.h * view.scale * 0.9);
  const x = center.x - w * 0.5;
  const y = center.y - h * 0.5;
  if (node.boundary) {
    const r = Math.min(2.4, Math.max(1.5, Math.min(w, h) * 0.28));
    return `<circle cx="${center.x.toFixed(2)}" cy="${center.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${escAttr(pinColor)}" />`;
  }
  const fill = escAttr(node.color || '#7f8c8d');
  const stroke = '#243949';
  let shape: string;
  if (node.shape === 'circle' || node.shape === 'cross') {
    const r = Math.max(w, h) * 0.5;
    shape = `<circle cx="${center.x.toFixed(2)}" cy="${center.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${fill}" stroke="${stroke}" stroke-width="0.75" />`;
  } else if (node.shape === 'triangle') {
    const pts = `${x.toFixed(2)},${y.toFixed(2)} ${(x + w).toFixed(2)},${y.toFixed(2)} ${(x + w * 0.5).toFixed(2)},${(y + h).toFixed(2)}`;
    shape = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="0.75" />`;
  } else {
    shape = `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="0.75" />`;
  }
  if (!showLabels || !node.label) return shape;
  const fontSize = Math.max(4, h * 0.55);
  const labelY = node.shape === 'triangle' ? y + h * 0.35 : center.y;
  const label = `<text x="${center.x.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="white" font-family="Menlo,Consolas,monospace" font-size="${fontSize.toFixed(1)}" font-weight="700">${escAttr(node.label)}</text>`;
  return shape + label;
};

export const svgGraphPreview = (graph: LayoutGraph, panel: Rect, opts?: SvgOpts) => {
  const g = spreadPreviewUnitTriangles(graph);
  const hasZeroInput = g.nodes.some((node) => !node.boundary && node.shape === 'triangle' && node.inputs === 0);
  const view = previewViewForLayout(g, panel, hasZeroInput ? 1.18 : 0.9, hasZeroInput);
  const clipId = `clip-${Math.random().toString(36).slice(2)}`;
  const edges = g.edges
    .map((edge) => {
      const d = svgSmoothPath(edge.points.map((p) => toScreen(p, view)));
      if (!d) return '';
      return `<path d="${d}" fill="none" stroke="${escAttr(edge.color || '#2f4f67')}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join('');
  const nodes = g.nodes.map((node) => svgNode(node, view, opts)).join('');
  return `
    <clipPath id="${clipId}"><rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" /></clipPath>
    <g clip-path="url(#${clipId})">${edges}${nodes}</g>
  `;
};

export const termPreviewSvg = (graph: LayoutGraph, width: number, height: number, opts?: SvgOpts) => {
  const pad = 8;
  const hasZeroInput = graph.nodes.some((node) => !node.boundary && node.shape === 'triangle' && node.inputs === 0);
  const verticalInset = hasZeroInput ? -7 : 0;
  const panel: Rect = { x: pad, y: pad + verticalInset, w: width - pad * 2, h: height - pad * 2 - verticalInset * 2 };
  const bg = opts?.transparent ? '' : `<rect width="${width}" height="${height}" rx="8" fill="#fbfdff" />`;
  return `<svg class="term-preview-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="diagram preview" xmlns="http://www.w3.org/2000/svg">${bg}${svgGraphPreview(graph, panel, opts)}</svg>`;
};

export const rulePreviewSvg = (rule: { lhs: LayoutGraph; rhs: LayoutGraph }, width: number, height: number, dimmed: boolean, opts?: SvgOpts) => {
  const gutter = 30;
  const pad = 5;
  const hasZeroInput = [...rule.lhs.nodes, ...rule.rhs.nodes].some((node) => !node.boundary && node.shape === 'triangle');
  const verticalInset = hasZeroInput ? -7 : 0;
  const sideW = (width - gutter - pad * 2) * 0.5;
  const left: Rect = { x: pad, y: pad + verticalInset, w: sideW, h: height - pad * 2 - verticalInset * 2 };
  const right: Rect = { x: pad + sideW + gutter, y: pad + verticalInset, w: sideW, h: height - pad * 2 - verticalInset * 2 };
  return `
    <svg class="rule-preview-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="rewrite rule preview" xmlns="http://www.w3.org/2000/svg">
      ${opts?.transparent ? '' : `<rect width="${width}" height="${height}" rx="8" fill="${dimmed ? '#f2f6fb' : '#fbfdff'}" />`}
      ${svgGraphPreview(rule.lhs, left, opts)}
      ${svgGraphPreview(rule.rhs, right, opts)}
      <text x="${width * 0.5}" y="${height * 0.5}" text-anchor="middle" dominant-baseline="central" fill="#47607a" font-family="Avenir Next, sans-serif" font-size="24" font-weight="900">=</text>
    </svg>
  `;
};

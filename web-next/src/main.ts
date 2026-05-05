import './style.css';
import { OcamlAdapter, RULE_ORDER } from './engine/ocamlAdapter';
import { type LayoutGraph, type LayoutNode, type LayoutPoint } from './layout/layoutTypes';
import { layoutSceneGraph } from './layout/physicsLayout';
import type { RuleAvailability, SceneState, SelectionDescriptor } from './model/interop';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type View = { scale: number; tx: number; ty: number };
type PanelMap = { lhs: Rect; rhs: Rect };
type LayoutState = {
  graphs: Map<string, LayoutGraph>;
  rules: Map<string, { lhs: LayoutGraph; rhs: LayoutGraph }>;
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

app.innerHTML = `
  <header class="topbar">
    <div class="left">
      <button class="btn" data-action="reset">Reset</button>
      <button class="btn icon-btn" data-action="undo" aria-label="Undo">↶</button>
      <button class="btn icon-btn" data-action="redo" aria-label="Redo">↷</button>
    </div>
    <div class="hint" id="subtitle">
      <span class="dot"></span>
      <span id="subtitle-text"></span>
    </div>
    <button class="btn help-btn" data-action="help" aria-label="Show help">?</button>
  </header>
  <main class="stages">
    <div class="stage">
      <span class="stage-label">Puzzle</span>
      <canvas id="stage" aria-label="diagram stage"></canvas>
    </div>
    <canvas id="confetti-canvas"></canvas>
    <div id="success-modal" role="dialog" aria-modal="true" aria-labelledby="success-title">
      <div class="modal">
        <div class="modal-check" aria-hidden="true">✓</div>
        <div class="modal-title" id="success-title">You untangled it!</div>
        <div class="modal-body">
          Every move you made followed a rule.<br/>
          A computer just checked your reasoning.
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="play-again">Play again</button>
          <button class="btn btn--primary" data-action="see-proof">See what you did</button>
        </div>
      </div>
    </div>
    <div id="proof-panel" aria-live="polite">
      <div class="proof-card">
        <div class="proof-head">
          <div>
            <div class="proof-kicker">Checked artifact</div>
            <h2>Proof script</h2>
          </div>
          <button class="btn" data-action="close-proof">Close</button>
        </div>
        <pre id="proof"></pre>
      </div>
    </div>
    <div id="help-panel">
      <div class="help-card">
        <div class="proof-head">
          <div>
            <div class="proof-kicker">How to play</div>
            <h2>Make only legal moves</h2>
          </div>
          <button class="btn" data-action="close-help">Close</button>
        </div>
        <p>Lasso a small tangle of boxes and strings. If a move card lights up, tap it to rewrite that part of the diagram.</p>
        <p>The point: each move is checked by the proof engine. When the diagrams match, you made a proof.</p>
      </div>
    </div>
  </main>
  <footer class="dock">
    <div class="dock-label">Moves</div>
    <div class="rules" id="rules">
      <button class="rule" data-action="rule" data-rule-id="R1" disabled>
        <div class="rule-meta"><span class="rule-badge">R1</span><span class="rule-name">untwist</span></div>
        <canvas class="rule-preview" data-rule-preview="R1" width="170" height="58"></canvas>
      </button>
      <button class="rule" data-action="rule" data-rule-id="R2" disabled>
        <div class="rule-meta"><span class="rule-badge">R2</span><span class="rule-name">absorb</span></div>
        <canvas class="rule-preview" data-rule-preview="R2" width="170" height="58"></canvas>
      </button>
      <button class="rule" data-action="rule" data-rule-id="R3" disabled>
        <div class="rule-meta"><span class="rule-badge">R3</span><span class="rule-name">split</span></div>
        <canvas class="rule-preview" data-rule-preview="R3" width="170" height="58"></canvas>
      </button>
      <button class="rule" data-action="rule" data-rule-id="R4" disabled>
        <div class="rule-meta"><span class="rule-badge">R4</span><span class="rule-name">slide</span></div>
        <canvas class="rule-preview" data-rule-preview="R4" width="170" height="58"></canvas>
      </button>
    </div>
    <div class="move-counter" data-move-counter>
      <b id="move-count">0</b> moves<br/>
      <span>so far</span>
    </div>
  </footer>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const subtitle = document.querySelector<HTMLElement>('#subtitle-text');
const proof = document.querySelector<HTMLPreElement>('#proof');
const moveCountEl = document.querySelector<HTMLElement>('#move-count');
const moveCounter = document.querySelector<HTMLElement>('[data-move-counter]');
const successModal = document.querySelector<HTMLElement>('#success-modal');
const proofPanel = document.querySelector<HTMLElement>('#proof-panel');
const helpPanel = document.querySelector<HTMLElement>('#help-panel');
const confettiCanvas = document.querySelector<HTMLCanvasElement>('#confetti-canvas');
const ruleButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-action="rule"]'));
if (!canvas || !subtitle || !proof || !moveCountEl || !moveCounter || !successModal || !proofPanel || !helpPanel || !confettiCanvas || ruleButtons.length !== RULE_ORDER.length) {
  throw new Error('Missing required UI element');
}
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2D context unavailable');

const adapter = new OcamlAdapter('double-fork');
let scene: SceneState = adapter.getScene();
let layouts: LayoutState | null = null;
let layoutEpoch = 0;
let rules: RuleAvailability[] = RULE_ORDER.map((name) => ({ name, enabled: false, reason: 'No selection' }));

const emptySelection = (): SelectionDescriptor => ({
  graphId: 'lhs',
  selectedNodeIds: [],
  polygon: [],
  cuts: [],
  cycleOrder: []
});

let currentSelection: SelectionDescriptor = emptySelection();
let lasso: Point[] = [];
let dragging = false;
let zoom = 1;
let moveCount = 0;
let proofOpen = false;
let successOpen = false;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const cssVar = (name: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const ruleNameForId = (id: string) => RULE_ORDER[Number(id.replace(/^R/, '')) - 1];

const resetShellState = () => {
  moveCount = 0;
  proofOpen = false;
  successOpen = false;
  moveCountEl.textContent = '0';
  moveCounter.removeAttribute('data-shown');
  successModal.removeAttribute('data-open');
  proofPanel.removeAttribute('data-open');
  helpPanel.removeAttribute('data-open');
};

const bumpMoves = () => {
  moveCount += 1;
  moveCountEl.textContent = String(moveCount);
  moveCounter.setAttribute('data-shown', 'true');
};

const fireConfetti = () => {
  const c = confettiCanvas.getContext('2d');
  if (!c) return;
  const rect = confettiCanvas.getBoundingClientRect();
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  confettiCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  confettiCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = [cssVar('--accent', '#3b73c4'), cssVar('--node-x', '#6fa86a'), cssVar('--strand-b', '#6e3a5e'), cssVar('--strand-a', '#2f7a6e')];
  const bits = Array.from({ length: 95 }, () => ({
    x: rect.width * 0.5 + (Math.random() - 0.5) * 90,
    y: rect.height * 0.42 + (Math.random() - 0.5) * 30,
    vx: (Math.random() - 0.5) * 7,
    vy: -Math.random() * 6 - 2,
    g: Math.random() * 0.18 + 0.1,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    size: Math.random() * 5 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    life: Math.random() * 35 + 55
  }));
  const tick = () => {
    c.clearRect(0, 0, rect.width, rect.height);
    let alive = false;
    bits.forEach((bit) => {
      if (bit.life <= 0) return;
      alive = true;
      bit.life -= 1;
      bit.x += bit.vx;
      bit.y += bit.vy;
      bit.vy += bit.g;
      bit.r += bit.vr;
      c.save();
      c.translate(bit.x, bit.y);
      c.rotate(bit.r);
      c.fillStyle = bit.color;
      c.globalAlpha = Math.min(1, bit.life / 18);
      c.fillRect(-bit.size * 0.5, -bit.size * 0.5, bit.size, bit.size * 0.65);
      c.restore();
    });
    if (alive) requestAnimationFrame(tick);
    else c.clearRect(0, 0, rect.width, rect.height);
  };
  tick();
};

const showSuccess = () => {
  if (successOpen) return;
  successOpen = true;
  successModal.setAttribute('data-open', 'true');
  fireConfetti();
};

const showProof = () => {
  proofOpen = true;
  successModal.removeAttribute('data-open');
  proofPanel.setAttribute('data-open', 'true');
  proof.textContent = scene.proofLines.length ? scene.proofLines.join('\n') : 'No proof yet.';
};

(window as unknown as {
  PuzzleUI: {
    bumpMoves: () => void;
    setRuleEnabled: (id: string, enabled: boolean) => void;
    showSuccess: () => void;
    reset: () => void;
  };
}).PuzzleUI = {
  bumpMoves,
  setRuleEnabled: (id, enabled) => {
    const el = document.querySelector<HTMLButtonElement>(`[data-rule-id="${id}"]`);
    if (el) el.disabled = !enabled;
  },
  showSuccess,
  reset: resetShellState
};

const roundedRectPath = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
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

const layoutScene = async (nextScene: SceneState) => {
  const epoch = ++layoutEpoch;
  layouts = null;
  render();
  try {
    const graphEntries = await Promise.all(nextScene.graphs.map(async (graph) => [graph.id, await layoutSceneGraph(graph)] as const));
    const ruleEntries = await Promise.all(
      nextScene.rules.map(async (rule) => [
        rule.name,
        { lhs: await layoutSceneGraph(rule.lhs), rhs: await layoutSceneGraph(rule.rhs) }
      ] as const)
    );
    if (epoch !== layoutEpoch) return;
    layouts = {
      graphs: new Map(graphEntries),
      rules: new Map(ruleEntries)
    };
  } catch (error) {
    if (epoch !== layoutEpoch) return;
    const message = error instanceof Error ? error.message : String(error);
    scene.messages = ['Layout failed.', message];
  }
  render();
};

const setScene = (nextScene: SceneState) => {
  scene = nextScene;
  void layoutScene(scene);
};

const viewForLayout = (g: LayoutGraph, panel: Rect, zoomFactor = zoom): View => {
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

const toScreen = (p: LayoutPoint, v: View): Point => ({ x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty });

const inPanel = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

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

const drawNode = (c: CanvasRenderingContext2D, node: LayoutNode, view: View, selected: Set<string>, preview = false) => {
  const p = toScreen({ x: node.x, y: node.y }, view);
  const w = Math.max(preview ? 5 : 22, node.w * view.scale * (preview ? 0.78 : 1));
  const h = Math.max(preview ? 5 : 18, node.h * view.scale * (preview ? 0.78 : 1));
  if (node.boundary) {
    c.fillStyle = cssVar('--pin', '#9aa8b8');
    c.beginPath();
    c.arc(p.x + w * 0.5, p.y + h * 0.5, Math.max(2, Math.min(w, h) * 0.33), 0, Math.PI * 2);
    c.fill();
    return;
  }
  const isSel = selected.has(node.id);
  c.fillStyle = node.color || '#7f8c8d';
  c.strokeStyle = isSel ? cssVar('--accent', '#3b73c4') : '#243949';
  c.lineWidth = preview ? 0.75 : isSel ? 3.2 : 1.6;
  roundedRectPath(c, p.x, p.y, w, h, preview ? 2 : 6);
  c.fill();
  c.stroke();
  if (!preview) {
    c.fillStyle = '#ffffff';
    c.font = '700 12px Menlo, Consolas, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(node.label, p.x + w * 0.5, p.y + h * 0.5 + 0.5);
  }
};

const drawLayoutGraph = (g: LayoutGraph, panel: Rect, selected: Set<string>) => {
  const view = viewForLayout(g, panel);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d4deea';
  ctx.lineWidth = 1.2;
  roundedRectPath(ctx, panel.x, panel.y, panel.w, panel.h, 14);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  roundedRectPath(ctx, panel.x, panel.y, panel.w, panel.h, 14);
  ctx.clip();
  g.edges.forEach((edge) => {
    ctx.strokeStyle = edge.color || '#2f4f67';
    ctx.lineWidth = 2;
    strokeSmoothPolyline(ctx, edge.points.map((p) => toScreen(p, view)));
  });
  g.nodes.forEach((node) => drawNode(ctx, node, view, selected));
  ctx.restore();
  return view;
};

const drawPendingGraph = (panel: Rect) => {
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

const drawLasso = () => {
  if (lasso.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(lasso[0].x, lasso[0].y);
  for (let i = 1; i < lasso.length; i += 1) ctx.lineTo(lasso[i].x, lasso[i].y);
  if (!dragging) ctx.closePath();
  ctx.fillStyle = 'rgba(41, 128, 185, 0.15)';
  ctx.strokeStyle = '#1f6da0';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
};

const pointInPolygon = (p: Point, poly: Point[]) => {
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

const nodeHitByLasso = (node: LayoutNode, view: View, poly: Point[]) => {
  if (node.boundary || !node.selectable) return false;
  const x0 = node.x;
  const y0 = node.y;
  const x1 = node.x + node.w;
  const y1 = node.y + node.h;
  const pts = [
    { x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5 },
    { x: x0, y: y0 },
    { x: x0, y: y1 },
    { x: x1, y: y0 },
    { x: x1, y: y1 }
  ];
  return pts.some((p) => pointInPolygon(toScreen(p, view), poly));
};

const pickGraphFromLasso = (panels: PanelMap): 'lhs' | 'rhs' | null => {
  const lhsHits = lasso.filter((p) => inPanel(p, panels.lhs)).length;
  const rhsHits = lasso.filter((p) => inPanel(p, panels.rhs)).length;
  if (lhsHits === 0 && rhsHits === 0) return null;
  return lhsHits >= rhsHits ? 'lhs' : 'rhs';
};

const evaluateSelection = (panels: PanelMap) => {
  if (!layouts) {
    scene.messages = ['Layout is still settling. Try the selection again in a moment.'];
    return;
  }
  if (lasso.length < 3) {
    currentSelection = emptySelection();
    rules = RULE_ORDER.map((name) => ({ name, enabled: false, reason: 'Select a sub-diagram' }));
    return;
  }
  const graphId = pickGraphFromLasso(panels);
  if (!graphId) {
    currentSelection = emptySelection();
    rules = RULE_ORDER.map((name) => ({ name, enabled: false, reason: 'Select either side' }));
    return;
  }
  const layout = layouts.graphs.get(graphId);
  if (!layout) return;
  const view = viewForLayout(layout, panels[graphId]);
  const selected = layout.nodes.filter((n) => nodeHitByLasso(n, view, lasso)).map((n) => n.id);
  currentSelection = {
    graphId,
    selectedNodeIds: selected,
    polygon: [],
    cuts: [],
    cycleOrder: []
  };
  rules = adapter.evaluateSelection(currentSelection);
  if (!rules.some((r) => r.enabled)) {
    const why = rules.map((r) => `${r.name}: ${r.reason ?? 'not applicable'}`).join(' | ');
    scene.messages = [`No rule matches this ${graphId} selection (${selected.length} nodes).`, why];
  } else {
    scene.messages = [`Selection on ${graphId}: ${selected.length} node(s). Applicable rules highlighted.`];
  }
};

const drawGraphPreview = (c: CanvasRenderingContext2D, g: LayoutGraph, panel: Rect) => {
  const view = viewForLayout(g, panel, 0.94);
  c.save();
  c.beginPath();
  c.rect(panel.x, panel.y, panel.w, panel.h);
  c.clip();
  g.edges.forEach((edge) => {
    c.strokeStyle = edge.color || '#2f4f67';
    c.lineWidth = 1.05;
    strokeSmoothPolyline(c, edge.points.map((p) => toScreen(p, view)));
  });
  g.nodes.forEach((node) => drawNode(c, node, view, new Set(), true));
  c.restore();
};

const drawRulePreview = (canvasEl: HTMLCanvasElement, name: string, enabled: boolean) => {
  canvasEl.width = Math.max(220, Math.floor(canvasEl.clientWidth || 220));
  canvasEl.height = Math.max(92, Math.floor(canvasEl.clientHeight || 92));
  const c = canvasEl.getContext('2d');
  if (!c) return;
  c.clearRect(0, 0, canvasEl.width, canvasEl.height);
  c.fillStyle = enabled ? '#fbfdff' : '#f2f6fb';
  c.fillRect(0, 0, canvasEl.width, canvasEl.height);
  const rule = layouts?.rules.get(name);
  if (!rule) {
    c.fillStyle = '#8da0b3';
    c.font = '600 11px "Avenir Next", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('layout...', canvasEl.width * 0.5, canvasEl.height * 0.5);
    return;
  }
  const gutter = 28;
  const pad = 8;
  const sideW = (canvasEl.width - gutter - pad * 2) * 0.5;
  const left: Rect = { x: pad, y: pad, w: sideW, h: canvasEl.height - pad * 2 };
  const right: Rect = { x: pad + sideW + gutter, y: pad, w: sideW, h: canvasEl.height - pad * 2 };
  drawGraphPreview(c, rule.lhs, left);
  drawGraphPreview(c, rule.rhs, right);
  c.fillStyle = '#6f859b';
  c.font = '800 16px "Avenir Next", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('=', canvasEl.width * 0.5, canvasEl.height * 0.5);
};

const refreshUi = () => {
  const lastMessage = scene.messages[0] || scene.subtitle || 'Lasso a tangle, then pick a move';
  subtitle.textContent = currentSelection.selectedNodeIds.length > 0
    ? `${currentSelection.selectedNodeIds.length} piece(s) selected. Pick a lit-up move.`
    : lastMessage;
  if (proofOpen) proof.textContent = scene.proofLines.length ? scene.proofLines.join('\n') : 'No proof yet.';
  RULE_ORDER.forEach((name, idx) => {
    const ra = rules.find((r) => r.name === name) ?? { name, enabled: false, reason: 'Unavailable' };
    const btn = ruleButtons[idx];
    btn.disabled = !ra.enabled;
    btn.dataset.ruleName = name;
    const nameEl = btn.querySelector<HTMLElement>('.rule-name');
    if (nameEl) nameEl.textContent = name;
    const pv = btn.querySelector<HTMLCanvasElement>('[data-rule-preview]');
    if (pv) drawRulePreview(pv, name, ra.enabled);
    btn.title = ra.enabled ? `Apply ${name}` : ra.reason ?? 'Not applicable';
  });
};

const panelsForSize = (cssW: number, cssH: number): PanelMap => {
  const margin = 18;
  const gap = 64;
  const paneW = Math.max(80, (cssW - 2 * margin - gap) * 0.5);
  return {
    lhs: { x: margin, y: 18, w: paneW, h: cssH - 36 },
    rhs: { x: margin + paneW + gap, y: 18, w: paneW, h: cssH - 36 }
  };
};

const render = () => {
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  const rect = canvas.getBoundingClientRect();
  const cssW = clamp(Math.floor(rect.width), 320, 2048);
  const cssH = clamp(Math.floor(rect.height), 260, 1536);
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const panels = panelsForSize(cssW, cssH);
  const selectedLhs = new Set(currentSelection.graphId === 'lhs' ? currentSelection.selectedNodeIds : []);
  const selectedRhs = new Set(currentSelection.graphId === 'rhs' ? currentSelection.selectedNodeIds : []);
  const lhs = layouts?.graphs.get('lhs');
  const rhs = layouts?.graphs.get('rhs');
  if (lhs) drawLayoutGraph(lhs, panels.lhs, selectedLhs);
  else drawPendingGraph(panels.lhs);
  if (rhs) drawLayoutGraph(rhs, panels.rhs, selectedRhs);
  else drawPendingGraph(panels.rhs);

  const eqX = panels.lhs.x + panels.lhs.w + (panels.rhs.x - (panels.lhs.x + panels.lhs.w)) * 0.5;
  const eqY = panels.lhs.y + panels.lhs.h * 0.5;
  ctx.fillStyle = '#47607a';
  ctx.font = '700 34px "Avenir Next", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('=', eqX, eqY);
  if (currentSelection.selectedNodeIds.length > 0) {
    const panel = panels[currentSelection.graphId as 'lhs' | 'rhs'];
    ctx.strokeStyle = '#1f6da0';
    ctx.lineWidth = 2;
    roundedRectPath(ctx, panel.x + 2, panel.y + 2, panel.w - 4, panel.h - 4, 12);
    ctx.stroke();
  }
  drawLasso();
  refreshUi();
};

const canvasPoint = (clientX: number, clientY: number): Point => {
  const r = canvas.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
};

const startDrag = (p: Point) => {
  dragging = true;
  lasso = [p];
  render();
};

const moveDrag = (p: Point) => {
  if (!dragging) return;
  const q = lasso[lasso.length - 1];
  if (!q || (p.x - q.x) ** 2 + (p.y - q.y) ** 2 > 16) lasso.push(p);
  render();
};

const finishDrag = (p: Point) => {
  if (!dragging) return;
  dragging = false;
  lasso.push(p);
  const rect = canvas.getBoundingClientRect();
  const panels = panelsForSize(clamp(Math.floor(rect.width), 320, 2048), clamp(Math.floor(rect.height), 260, 1536));
  const inEither = lasso.some((q) => inPanel(q, panels.lhs) || inPanel(q, panels.rhs));
  if (!inEither || lasso.length < 3) {
    lasso = [];
    currentSelection = emptySelection();
    rules = RULE_ORDER.map((name) => ({ name, enabled: false, reason: 'Select a sub-diagram' }));
    render();
    return;
  }
  evaluateSelection(panels);
  render();
};

const cancelDrag = () => {
  dragging = false;
  lasso = [];
  render();
};

const clearSelection = () => {
  lasso = [];
  currentSelection = emptySelection();
  rules = RULE_ORDER.map((name) => ({ name, enabled: false, reason: 'Select a sub-diagram' }));
};

const applyRuleFromButton = (btn: HTMLButtonElement) => {
  const id = btn.dataset.ruleId ?? '';
  const name = ruleNameForId(id);
  if (!name || btn.disabled) return;
  const res = adapter.applyRule(name, currentSelection);
  if (res.ok && res.scene) {
    bumpMoves();
    clearSelection();
    setScene(res.scene);
    if (res.scene.messages.some((m) => m.includes('You just made a proof'))) showSuccess();
  } else {
    scene.messages = [res.error || `Rule ${name} not applicable.`];
    render();
  }
};

if (typeof (window as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent !== 'undefined') {
  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    startDrag(canvasPoint(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointermove', (e: PointerEvent) => moveDrag(canvasPoint(e.clientX, e.clientY)));
  canvas.addEventListener('pointerup', (e: PointerEvent) => finishDrag(canvasPoint(e.clientX, e.clientY)));
  canvas.addEventListener('pointercancel', cancelDrag);
} else {
  canvas.addEventListener('mousedown', (e: MouseEvent) => startDrag(canvasPoint(e.clientX, e.clientY)));
  window.addEventListener('mousemove', (e: MouseEvent) => moveDrag(canvasPoint(e.clientX, e.clientY)));
  window.addEventListener('mouseup', (e: MouseEvent) => finishDrag(canvasPoint(e.clientX, e.clientY)));
  canvas.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (e.touches.length < 1) return;
      const t = e.touches[0];
      startDrag(canvasPoint(t.clientX, t.clientY));
      e.preventDefault();
    },
    { passive: false }
  );
  canvas.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (e.touches.length < 1) return;
      const t = e.touches[0];
      moveDrag(canvasPoint(t.clientX, t.clientY));
      e.preventDefault();
    },
    { passive: false }
  );
  canvas.addEventListener(
    'touchend',
    (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (t) finishDrag(canvasPoint(t.clientX, t.clientY));
      e.preventDefault();
    },
    { passive: false }
  );
  canvas.addEventListener('touchcancel', cancelDrag);
}

document.addEventListener('click', (e) => {
  const actionEl = (e.target as Element | null)?.closest<HTMLElement>('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'reset' || action === 'play-again') {
    resetShellState();
    clearSelection();
    setScene(adapter.reset('double-fork'));
    render();
  } else if (action === 'undo') {
    successModal.removeAttribute('data-open');
    proofPanel.removeAttribute('data-open');
    proofOpen = false;
    successOpen = false;
    clearSelection();
    setScene(adapter.undo());
    render();
  } else if (action === 'redo') {
    clearSelection();
    setScene(adapter.redo());
    render();
  } else if (action === 'rule' && actionEl instanceof HTMLButtonElement) {
    applyRuleFromButton(actionEl);
  } else if (action === 'see-proof') {
    showProof();
  } else if (action === 'close-proof') {
    proofOpen = false;
    proofPanel.removeAttribute('data-open');
  } else if (action === 'help') {
    helpPanel.setAttribute('data-open', 'true');
  } else if (action === 'close-help') {
    helpPanel.removeAttribute('data-open');
  }
});

if (typeof (window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => render());
  ro.observe(canvas);
} else {
  window.addEventListener('resize', () => render());
}

void layoutScene(scene);

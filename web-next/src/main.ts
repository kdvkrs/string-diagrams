import './style.css';
import { OcamlAdapter } from './engine/ocamlAdapter';
import { type LayoutGraph, type LayoutNode, type LayoutPoint } from './layout/layoutTypes';
import { animateSceneGraphLayout, layoutSceneGraph, type LayoutSeed } from './layout/physicsLayout';
import type { PuzzleInfo, RuleAvailability, SceneState, SelectionDescriptor } from './model/interop';
import { perf } from './perf';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type View = { scale: number; tx: number; ty: number };
type PanelMap = { lhs: Rect; rhs: Rect };
type CrossingDiagnostic = { graphId: string; edgeA: string; edgeB: string; point: Point };
type LayoutState = {
  graphs: Map<string, LayoutGraph>;
  rules: Map<string, { lhs: LayoutGraph; rhs: LayoutGraph }>;
};

const DEFAULT_PUZZLE_ID = 'clean-up-two-units';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

const installKioskGestureGuards = () => {
  const prevent = (event: Event) => event.preventDefault();
  const options: AddEventListenerOptions = { passive: false };

  // iOS Safari still exposes non-standard gesture events for pinch zoom.
  document.addEventListener('gesturestart', prevent, options);
  document.addEventListener('gesturechange', prevent, options);
  document.addEventListener('gestureend', prevent, options);

  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 350) event.preventDefault();
      lastTouchEnd = now;
    },
    options
  );
};

installKioskGestureGuards();

app.innerHTML = `
  <header class="topbar">
    <div class="left">
      <label class="level-menu" aria-label="Choose puzzle level">
        <span>Level</span>
        <select id="level-actions"></select>
      </label>
      <button class="btn" data-action="reset">Reset</button>
      <button class="btn icon-btn" data-action="undo" aria-label="Undo">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"/></svg>
      </button>
      <button class="btn icon-btn" data-action="redo" aria-label="Redo">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3"/></svg>
      </button>
    </div>
    <div class="hint" id="subtitle">
      <span class="dot"></span>
      <span id="subtitle-text"></span>
    </div>
    <button class="btn help-btn" data-action="help" aria-label="Show help">?</button>
  </header>
  <main class="stages">
    <div class="stage">
      <canvas id="stage" aria-label="diagram stage"></canvas>
    </div>
    <div id="success-modal" role="dialog" aria-modal="true" aria-labelledby="success-title">
      <canvas id="confetti-canvas"></canvas>
      <div class="modal modal--success">
        <div class="modal-check" aria-hidden="true">✓</div>
        <div class="modal-title" id="success-title">You untangled it!</div>
        <div class="modal-body">
          Every move you made followed a rule.<br/>
          A computer just checked your reasoning.
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="play-again">Play again</button>
          <button class="btn btn--primary" data-action="see-proof">See what you did</button>
          <button class="btn btn--primary" data-action="next-level">Next level</button>
        </div>
      </div>
      <div class="modal modal--end">
        <div class="modal-check" aria-hidden="true">★</div>
        <div class="modal-title">Demo complete</div>
        <div class="modal-body">
          Placeholder finale screen.<br/>
          Same local proof idea, now on the full board.
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="play-again">Replay final level</button>
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
    <div id="tutorial-panel" aria-live="polite">
      <div class="tutorial-card">
        <div class="proof-head">
          <div>
            <div class="proof-kicker">How to play</div>
            <h2>A checked visual move</h2>
          </div>
          <button class="btn" data-action="close-tutorial">Close</button>
        </div>
        <p class="tutorial-copy">This mini-demo uses Level 1 in a sandbox. Your current puzzle is left untouched.</p>
        <div class="tutorial-stage-wrap">
          <canvas id="tutorial-stage" aria-label="tutorial diagram stage"></canvas>
        </div>
        <button class="rule tutorial-rule" id="tutorial-rule-card" type="button">
          <div class="rule-meta"><span class="rule-badge">Move</span><span class="rule-name">checked rule</span></div>
          <div class="tutorial-rule-preview" id="tutorial-rule-preview" aria-hidden="true"></div>
        </button>
      </div>
    </div>
  </main>
  <div class="tut-caption" id="tutorial-caption">Circle a real rewrite</div>
  <div class="tut-finger" id="tutorial-finger" aria-hidden="true">
    <svg viewBox="0 0 56 64">
      <ellipse cx="28" cy="28" rx="16" ry="20" fill="rgba(255,255,255,.88)" stroke="rgba(20,30,45,.55)" stroke-width="1.4"/>
      <ellipse cx="24" cy="22" rx="5" ry="8" fill="rgba(255,255,255,.96)"/>
    </svg>
  </div>
  <div class="tut-ripple" id="tutorial-ripple"></div>
  <div class="perf-panel" id="perf-panel" hidden>
    <div class="perf-head">
      <strong>Perf</strong>
      <button type="button" data-perf-action="crossings">Cross</button>
      <button type="button" data-perf-action="selection">Sel</button>
      <button type="button" data-perf-action="reset">Reset</button>
      <button type="button" data-perf-action="copy">Copy</button>
      <button type="button" data-perf-action="hide">Hide</button>
    </div>
    <pre id="perf-output"></pre>
  </div>
  <footer class="dock">
    <div class="dock-label">Moves</div>
    <div class="rules" id="rules"></div>
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
const tutorialPanel = document.querySelector<HTMLElement>('#tutorial-panel');
const tutorialCanvas = document.querySelector<HTMLCanvasElement>('#tutorial-stage');
const tutorialRuleCard = document.querySelector<HTMLButtonElement>('#tutorial-rule-card');
const tutorialRulePreview = document.querySelector<HTMLElement>('#tutorial-rule-preview');
const confettiCanvas = document.querySelector<HTMLCanvasElement>('#confetti-canvas');
const tutorialCaption = document.querySelector<HTMLElement>('#tutorial-caption');
const tutorialFinger = document.querySelector<HTMLElement>('#tutorial-finger');
const tutorialRipple = document.querySelector<HTMLElement>('#tutorial-ripple');
const perfPanel = document.querySelector<HTMLElement>('#perf-panel');
const perfOutput = document.querySelector<HTMLPreElement>('#perf-output');
const levelActions = document.querySelector<HTMLSelectElement>('#level-actions');
const rulesContainer = document.querySelector<HTMLElement>('#rules');
if (
  !canvas || !subtitle || !proof || !moveCountEl || !moveCounter || !successModal || !proofPanel || !helpPanel || !tutorialPanel || !tutorialCanvas || !tutorialRuleCard || !tutorialRulePreview || !confettiCanvas ||
  !tutorialCaption || !tutorialFinger || !tutorialRipple || !perfPanel || !perfOutput ||
  !levelActions || !rulesContainer
) {
  throw new Error('Missing required UI element');
}
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2D context unavailable');
const tutorialCtx = tutorialCanvas.getContext('2d');
if (!tutorialCtx) throw new Error('Tutorial 2D context unavailable');

const adapter = new OcamlAdapter(DEFAULT_PUZZLE_ID);
const puzzles = adapter.listDemos();
let scene: SceneState = adapter.getScene();
let layouts: LayoutState | null = null;
let layoutEpoch = 0;
let activePuzzleId = scene.puzzleId || DEFAULT_PUZZLE_ID;
const disabledRulesFor = (s: SceneState, reason = 'No selection'): RuleAvailability[] =>
  s.rules.map((rule) => ({ name: rule.name, enabled: false, reason }));
let rules: RuleAvailability[] = disabledRulesFor(scene);

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
let renderedLevelsKey = '';
let renderedRulesKey = '';
let layoutStopRequested = false;
let tutorialRunning = false;
let tutorialAbort: AbortController | null = null;
let renderQueued = false;
let queuedRenderRefresh = false;
let debugCrossings: CrossingDiagnostic[] = [];

// Tutorial lasso tuning: decrease this if the ghost lasso catches nearby nodes,
// increase it if the lasso feels too tight around the highlighted rewrite.
const TUTORIAL_LASSO_PAD = 16;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(t);
      reject(new Error('tutorial aborted'));
    }, { once: true });
  });

const cssVar = (name: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const resetShellState = () => {
  moveCount = 0;
  proofOpen = false;
  successOpen = false;
  moveCountEl.textContent = '0';
  moveCounter.removeAttribute('data-shown');
  successModal.removeAttribute('data-open');
  successModal.removeAttribute('data-final');
  proofPanel.removeAttribute('data-open');
  helpPanel.removeAttribute('data-open');
  tutorialPanel.removeAttribute('data-open');
};

const stopTutorial = () => {
  if (!tutorialRunning) return;
  tutorialRunning = false;
  tutorialAbort?.abort();
  tutorialAbort = null;
  document.body.classList.remove('tut-on');
  tutorialPanel.removeAttribute('data-open');
  tutorialRuleCard.classList.remove('tut-hot', 'tut-pressed');
  document.querySelectorAll('.rule.tut-hot, .rule.tut-pressed').forEach((el) => el.classList.remove('tut-hot', 'tut-pressed'));
  tutorialFinger.style.transform = 'translate(-120px, -120px)';
};

const invalidateRuleDock = () => {
  renderedRulesKey = '';
};

const nextPuzzleId = () => {
  const idx = puzzles.findIndex((p) => p.id === activePuzzleId);
  if (idx < 0 || puzzles.length === 0) return DEFAULT_PUZZLE_ID;
  return puzzles[(idx + 1) % puzzles.length].id;
};

const loadPuzzle = (puzzleId: string) => {
  stopTutorial();
  layoutStopRequested = true;
  releaseLayoutStep();
  activePuzzleId = puzzleId;
  resetShellState();
  clearSelection();
  setScene(adapter.reset(puzzleId));
  render();
};

const releaseLayoutStep = () => {};

const requestRender = (reason: string, refresh = true) => {
  perf.count(`render.request.${reason}`);
  queuedRenderRefresh = queuedRenderRefresh || refresh;
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    const shouldRefresh = queuedRenderRefresh;
    renderQueued = false;
    queuedRenderRefresh = false;
    render(shouldRefresh);
  });
};

const formatPerfRows = () => {
  const rows = perf.snapshot();
  const crossingLine = perf.debugCrossings
    ? `unintended crossings: ${debugCrossings.length}`
    : 'unintended crossings: off';
  const selectionLine = `selection fallback debug: ${perf.debugSelection ? 'on' : 'off'}`;
  if (rows.length === 0) return `No samples yet. Lasso or apply a rewrite.\n${crossingLine}\n${selectionLine}`;
  const head = 'name                         count   total    avg    max';
  const body = rows.slice(0, 14).map((row) => [
    row.name.padEnd(28).slice(0, 28),
    String(row.count).padStart(5),
    `${row.totalMs.toFixed(1)}ms`.padStart(8),
    `${row.avgMs.toFixed(3)}ms`.padStart(8),
    `${row.maxMs.toFixed(1)}ms`.padStart(7)
  ].join(' '));
  const crossingDetails = debugCrossings.slice(0, 6).map((c) => `  ${c.graphId}: ${c.edgeA} × ${c.edgeB}`);
  return [crossingLine, selectionLine, ...crossingDetails, '', head, ...body].join('\n');
};

let perfPanelTimer: number | undefined;

const updatePerfPanel = () => {
  if (!perf.enabled || perfPanel.hidden) return;
  perfOutput.textContent = formatPerfRows();
};

const showPerfPanel = () => {
  if (!perf.enabled) return;
  perfPanel.hidden = false;
  updatePerfPanel();
  window.clearInterval(perfPanelTimer);
  perfPanelTimer = window.setInterval(updatePerfPanel, 1000);
};

const hidePerfPanel = () => {
  perfPanel.hidden = true;
  window.clearInterval(perfPanelTimer);
  perfPanelTimer = undefined;
};

if (perf.enabled) showPerfPanel();

const bumpMoves = () => {
  moveCount += 1;
  moveCountEl.textContent = String(moveCount);
  moveCounter.setAttribute('data-shown', 'true');
};

const fireConfetti = (finale = false) => {
  const c = confettiCanvas.getContext('2d');
  if (!c) return;
  const rect = successModal.getBoundingClientRect();
  const width = Math.max(window.innerWidth, document.documentElement.clientWidth || 0, rect.width, 1);
  const height = Math.max(window.innerHeight, document.documentElement.clientHeight || 0, rect.height, 1);
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  confettiCanvas.width = Math.floor(width * dpr);
  confettiCanvas.height = Math.floor(height * dpr);
  confettiCanvas.style.width = `${width}px`;
  confettiCanvas.style.height = `${height}px`;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = [cssVar('--accent', '#3b73c4'), cssVar('--node-x', '#6fa86a'), cssVar('--strand-b', '#6e3a5e'), cssVar('--strand-a', '#2f7a6e')];
  const duration = finale ? 9000 : 4200;
  const started = Date.now();
  let lastBurst = 0;
  type ConfettiBit = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    g: number;
    r: number;
    vr: number;
    size: number;
    color: string;
    life: number;
    maxLife: number;
  };
  const bits: ConfettiBit[] = [];
  const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;
  const burst = (originX: number, originY: number, count: number) => {
    for (let i = 0; i < count; i += 1) {
      const angle = randomInRange(-Math.PI * 0.9, -Math.PI * 0.1);
      const speed = randomInRange(2.2, 7.8);
      const life = randomInRange(110, 170);
      bits.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed + randomInRange(-0.8, 0.8),
        vy: Math.sin(angle) * speed - randomInRange(0.2, 1.8),
        g: randomInRange(0.08, 0.14),
        r: Math.random() * Math.PI,
        vr: randomInRange(-0.32, 0.32),
        size: randomInRange(3.5, 8),
        color: colors[Math.floor(Math.random() * colors.length)],
        life,
        maxLife: life
      });
    }
  };
  const tick = () => {
    const elapsed = Date.now() - started;
    const timeLeft = Math.max(0, duration - elapsed);
    if (elapsed - lastBurst > 220 && timeLeft > 0) {
      lastBurst = elapsed;
      const particleCount = Math.max(finale ? 8 : 5, Math.floor((finale ? 34 : 24) * (timeLeft / duration)));
      burst(width * randomInRange(0.08, 0.32), height * randomInRange(-0.04, 0.18), particleCount);
      burst(width * randomInRange(0.68, 0.92), height * randomInRange(-0.04, 0.18), particleCount);
      if (finale && elapsed < duration * 0.7) {
        burst(width * randomInRange(0.32, 0.68), height * randomInRange(0.02, 0.28), Math.max(3, Math.floor(particleCount * 0.45)));
      }
    }
    c.clearRect(0, 0, width, height);
    for (let i = bits.length - 1; i >= 0; i -= 1) {
      const bit = bits[i];
      if (bit.life <= 0) {
        bits.splice(i, 1);
        continue;
      }
      bit.life -= 1;
      bit.x += bit.vx;
      bit.y += bit.vy;
      bit.vy += bit.g;
      bit.r += bit.vr;
      if (bit.life <= 0 || bit.y > height + 80) {
        bits.splice(i, 1);
        continue;
      }
      c.save();
      c.translate(bit.x, bit.y);
      c.rotate(bit.r);
      c.fillStyle = bit.color;
      c.globalAlpha = Math.min(1, bit.life / Math.min(22, bit.maxLife * 0.6));
      c.fillRect(-bit.size * 0.5, -bit.size * 0.5, bit.size, bit.size * 0.65);
      c.restore();
    }
    if (timeLeft > 0 || bits.length > 0) requestAnimationFrame(tick);
    else c.clearRect(0, 0, width, height);
  };
  burst(width * 0.5, height * 0.24, finale ? 130 : 76);
  burst(width * 0.25, height * 0.1, finale ? 54 : 28);
  burst(width * 0.75, height * 0.1, finale ? 54 : 28);
  tick();
};

const showSuccess = () => {
  if (successOpen) return;
  successOpen = true;
  const nextButton = successModal.querySelector<HTMLButtonElement>('[data-action="next-level"]');
  const idx = puzzles.findIndex((p) => p.id === activePuzzleId);
  const hasNext = idx >= 0 && idx < puzzles.length - 1;
  successModal.toggleAttribute('data-final', !hasNext);
  if (nextButton) {
    nextButton.hidden = !hasNext;
    nextButton.textContent = hasNext ? `Next: ${puzzles[idx + 1].level}` : 'Next level';
  }
  successModal.setAttribute('data-open', 'true');
  fireConfetti(!hasNext);
};

const showProof = () => {
  proofOpen = true;
  successModal.removeAttribute('data-open');
  proofPanel.setAttribute('data-open', 'true');
  proof.textContent = scene.proofText || adapter.exportProof() || 'No proof yet.';
};

const startTutorial = async () => {
  stopTutorial();
  tutorialRunning = true;
  tutorialAbort = new AbortController();
  const signal = tutorialAbort.signal;
  document.body.classList.add('tut-on');
  tutorialPanel.setAttribute('data-open', 'true');
  tutorialCaption.textContent = 'Loading a tiny proof...';
  tutorialFinger.style.transform = 'translate(-120px, -120px)';
  try {
    const demo = adapter.tutorialDemo(DEFAULT_PUZZLE_ID);
    if (!demo.ok || !demo.initialScene || !demo.selection || !demo.ruleName || !demo.result?.scene) {
      throw new Error(demo.error || 'Tutorial data is incomplete');
    }
    const initialLayouts = new Map(
      await Promise.all(demo.initialScene.graphs.map(async (graph) => [graph.id, await layoutSceneGraph(graph)] as const))
    );
    const resultLayouts = new Map(
      await Promise.all(demo.result.scene.graphs.map(async (graph) => [graph.id, await layoutSceneGraph(graph)] as const))
    );
    const ruleNameEl = tutorialRuleCard.querySelector<HTMLElement>('.rule-name');
    if (ruleNameEl) ruleNameEl.textContent = demo.ruleName;
    const tutorialRule = demo.initialScene.rules.find((rule) => rule.name === demo.ruleName);
    if (tutorialRule) {
      const previewLayouts = {
        lhs: await layoutSceneGraph(tutorialRule.lhs),
        rhs: await layoutSceneGraph(tutorialRule.rhs)
      };
      drawRulePreviewGraphs(tutorialRulePreview, previewLayouts, false);
    }
    const drawTutorial = (graphs: Map<string, LayoutGraph>, selected = new Set<string>(), path: Point[] = []) => {
      const rect = tutorialCanvas.getBoundingClientRect();
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      tutorialCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
      tutorialCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
      tutorialCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tutorialCtx.clearRect(0, 0, rect.width, rect.height);
      const panels = panelsForSize(rect.width, rect.height);
      const lhs = graphs.get('lhs');
      const rhs = graphs.get('rhs');
      if (lhs) drawLayoutGraphOn(tutorialCtx, lhs, panels.lhs, demo.selection?.graphId === 'lhs' ? selected : new Set());
      if (rhs) drawLayoutGraphOn(tutorialCtx, rhs, panels.rhs, demo.selection?.graphId === 'rhs' ? selected : new Set());
      drawPlainEquals(tutorialCtx, rect.width * 0.5, rect.height * 0.5, 26);
      if (path.length > 1) {
        tutorialCtx.beginPath();
        tutorialCtx.moveTo(path[0].x, path[0].y);
        path.slice(1).forEach((p) => tutorialCtx.lineTo(p.x, p.y));
        tutorialCtx.closePath();
        tutorialCtx.fillStyle = 'rgba(41, 128, 185, 0.14)';
        tutorialCtx.strokeStyle = '#1f6da0';
        tutorialCtx.lineWidth = 2.4;
        tutorialCtx.fill();
        tutorialCtx.stroke();
      }
      return panels;
    };
    const panels = drawTutorial(initialLayouts);
    const selectedSet = new Set(demo.selection.selectedNodeIds);
    const tutorialGraphId = demo.selection.graphId === 'rhs' ? 'rhs' : 'lhs';
    const selectedLayout = initialLayouts.get(tutorialGraphId);
    if (!selectedLayout) throw new Error('Tutorial selected graph is missing');
    const path = lassoPathForSelection(demo.selection, panels[tutorialGraphId], selectedLayout);
    tutorialCaption.textContent = 'Circle a tangle';
    await fingerTo(tutorialCanvasPointToPage(path[0]), 500, signal);
    tutorialFinger.style.transition = 'none';
    const start = performance.now();
    while (true) {
      if (signal.aborted) throw new Error('tutorial aborted');
      const t = clamp((performance.now() - start) / 1400, 0, 1);
      const partial = interpolateClosedPath(path, t);
      const head = partial[partial.length - 1] ?? path[0];
      const pageHead = tutorialCanvasPointToPage(head);
      tutorialFinger.style.transform = `translate(${pageHead.x}px, ${pageHead.y}px)`;
      drawTutorial(initialLayouts, selectedSet, partial);
      if (t >= 1) break;
      await frame();
    }
    drawTutorial(initialLayouts, selectedSet, path);
    await sleep(450, signal);
    tutorialCaption.textContent = 'Pick a checked move';
    tutorialRuleCard.classList.add('tut-hot');
    const r = tutorialRuleCard.getBoundingClientRect();
    const p = { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
    await fingerTo(p, 850, signal);
    fireTutorialRipple(p);
    tutorialRuleCard.classList.add('tut-pressed');
    await sleep(180, signal);
    tutorialRuleCard.classList.remove('tut-pressed');
    tutorialCaption.textContent = 'Watch the real rewrite';
    drawTutorial(resultLayouts);
    tutorialCaption.textContent = 'Every move was checked';
    await sleep(1800, signal);
  } catch (error) {
    if (!signal.aborted) {
      const message = error instanceof Error ? error.message : String(error);
      scene.messages = ['Tutorial could not start.', message];
      render();
    }
  } finally {
    stopTutorial();
  }
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
    const el = document.querySelector<HTMLButtonElement>(`[data-rule-key="${id}"], [data-rule-name="${id}"]`);
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
    invalidateRuleDock();
  } catch (error) {
    if (epoch !== layoutEpoch) return;
    const message = error instanceof Error ? error.message : String(error);
    scene.messages = ['Layout failed.', message];
  }
  render();
};

const seedFromCurrentLayout = (selection: SelectionDescriptor): LayoutSeed | undefined => {
  const graph = layouts?.graphs.get(selection.graphId);
  if (!graph) return undefined;
  const nodePositions = new Map<string, LayoutPoint>();
  const selectedCenters: LayoutPoint[] = [];
  graph.nodes.forEach((node) => {
    if (node.boundary || node.modelX === undefined || node.modelY === undefined) return;
    nodePositions.set(node.id, { x: node.modelX, y: node.modelY });
    if (selection.selectedNodeIds.includes(node.id)) selectedCenters.push({ x: node.modelX, y: node.modelY });
  });
  const fallbackCenter = selectedCenters.length === 0
    ? undefined
    : {
        x: selectedCenters.reduce((sum, p) => sum + p.x, 0) / selectedCenters.length,
        y: selectedCenters.reduce((sum, p) => sum + p.y, 0) / selectedCenters.length
      };
  return { nodePositions, fallbackCenter };
};

const layoutCenterFromCurrentSelection = (selection: SelectionDescriptor): LayoutPoint | undefined => {
  const graph = layouts?.graphs.get(selection.graphId);
  if (!graph) return undefined;
  const centers = graph.nodes
    .filter((node) => selection.selectedNodeIds.includes(node.id) && !node.boundary)
    .map((node) => ({ x: node.x + node.w * 0.5, y: node.y + node.h * 0.5 }));
  if (centers.length === 0) return undefined;
  return {
    x: centers.reduce((sum, p) => sum + p.x, 0) / centers.length,
    y: centers.reduce((sum, p) => sum + p.y, 0) / centers.length
  };
};

const pointDistanceSq = (a: LayoutPoint, b: LayoutPoint) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

const lerpPoint = (a: LayoutPoint, b: LayoutPoint, t: number): LayoutPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
});

const replacementBloomGraph = (graph: LayoutGraph, center: LayoutPoint, progress: number, stableNodeIds: Set<string>): LayoutGraph => {
  const stableCenters = new Map(
    graph.nodes
      .filter((node) => node.boundary || stableNodeIds.has(node.id))
      .map((node) => [node.id, { x: node.x + node.w * 0.5, y: node.y + node.h * 0.5 }])
  );
  const nearStableNode = (p: LayoutPoint) => {
    for (const stable of stableCenters.values()) {
      if (pointDistanceSq(p, stable) < 36 ** 2) return true;
    }
    return false;
  };
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.boundary || stableNodeIds.has(node.id)) return { ...node };
      const nodeCenter = { x: node.x + node.w * 0.5, y: node.y + node.h * 0.5 };
      const nextCenter = lerpPoint(center, nodeCenter, progress);
      return { ...node, x: nextCenter.x - node.w * 0.5, y: nextCenter.y - node.h * 0.5 };
    }),
    edges: graph.edges.map((edge) => {
      const first = edge.points[0];
      const last = edge.points[edge.points.length - 1];
      const stableToStable = first && last && nearStableNode(first) && nearStableNode(last);
      return {
        ...edge,
        points: stableToStable
          ? edge.points.map((p) => ({ ...p }))
          : edge.points.map((p) => (nearStableNode(p) ? { ...p } : lerpPoint(center, p, progress)))
      };
    })
  };
};

const collapsedGraphForSelection = (graph: LayoutGraph, selection: SelectionDescriptor, progress: number): LayoutGraph => {
  const selected = new Set(selection.selectedNodeIds);
  const selectedNodes = graph.nodes.filter((node) => selected.has(node.id) && !node.boundary);
  if (selectedNodes.length === 0) return graph;
  const selectedCenters = selectedNodes.map((node) => ({ x: node.x + node.w * 0.5, y: node.y + node.h * 0.5 }));
  const center = {
    x: selectedCenters.reduce((sum, p) => sum + p.x, 0) / selectedCenters.length,
    y: selectedCenters.reduce((sum, p) => sum + p.y, 0) / selectedCenters.length
  };
  const nearbySelectedCenter = (p: LayoutPoint) => {
    let best = selectedCenters[0];
    let bestD = pointDistanceSq(p, best);
    for (let i = 1; i < selectedCenters.length; i += 1) {
      const d = pointDistanceSq(p, selectedCenters[i]);
      if (d < bestD) {
        best = selectedCenters[i];
        bestD = d;
      }
    }
    return bestD < 36 ** 2 ? best : undefined;
  };
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (!selected.has(node.id) || node.boundary) return { ...node };
      const nodeCenter = { x: node.x + node.w * 0.5, y: node.y + node.h * 0.5 };
      const nextCenter = lerpPoint(nodeCenter, center, progress);
      return { ...node, x: nextCenter.x - node.w * 0.5, y: nextCenter.y - node.h * 0.5 };
    }),
    edges: graph.edges.map((edge) => ({
      ...edge,
      points: edge.points.map((p) => (nearbySelectedCenter(p) ? lerpPoint(p, center, progress) : { ...p }))
    }))
  };
};

const animateSelectionCollapse = async (selection: SelectionDescriptor, durationMs = 260) => {
  const sourceLayouts = layouts;
  const graph = sourceLayouts?.graphs.get(selection.graphId);
  if (!sourceLayouts || !graph || selection.selectedNodeIds.length === 0) return;
  const epoch = ++layoutEpoch;
  scene.messages = ['Collapsing the selected rewrite region...'];
  const start = performance.now();
  while (true) {
    if (epoch !== layoutEpoch) return;
    const t = clamp((performance.now() - start) / durationMs, 0, 1);
    layouts = {
      graphs: new Map(sourceLayouts.graphs).set(selection.graphId, collapsedGraphForSelection(graph, selection, easeInOutCubic(t))),
      rules: sourceLayouts.rules
    };
    render();
    if (t >= 1) break;
    await frame();
  }
};

const animateRewriteScene = async (nextScene: SceneState, graphId: string, seed?: LayoutSeed, collapseCenter?: LayoutPoint, selectedNodeIds = new Set<string>()) => {
  const epoch = ++layoutEpoch;
  const finalMessages = [...nextScene.messages];
  scene = nextScene;
  activePuzzleId = scene.puzzleId || activePuzzleId;
  rules = disabledRulesFor(scene);
  invalidateRuleDock();
  layoutStopRequested = false;
  const nextGraphs = new Map<string, LayoutGraph>();
  const stableNodeIds = new Set(seed?.nodePositions?.keys() ?? []);
  selectedNodeIds.forEach((id) => stableNodeIds.delete(id));
  if (collapseCenter) {
    const oldChanged = layouts?.graphs.get(graphId);
    if (oldChanged) nextGraphs.set(graphId, oldChanged);
  }
  layouts = { graphs: nextGraphs, rules: new Map() };
  scene.messages = ['Replaying checked rewrite...'];
  render();
  try {
    const ruleEntries = await Promise.all(
      nextScene.rules.map(async (rule) => [
        rule.name,
        { lhs: await layoutSceneGraph(rule.lhs), rhs: await layoutSceneGraph(rule.rhs) }
      ] as const)
    );
    if (epoch !== layoutEpoch) return;
    layouts.rules = new Map(ruleEntries);
    invalidateRuleDock();
    await Promise.all(
      nextScene.graphs
        .filter((graph) => graph.id !== graphId)
        .map(async (graph) => {
          nextGraphs.set(graph.id, await layoutSceneGraph(graph));
        })
    );
    const changedGraph = nextScene.graphs.find((graph) => graph.id === graphId);
    if (changedGraph) {
      const finalLayout = await animateSceneGraphLayout(
        changedGraph,
        (layout, iteration) => {
          if (epoch !== layoutEpoch) return;
          if (collapseCenter && iteration === 0) {
            nextGraphs.set(graphId, replacementBloomGraph(layout, collapseCenter, 0, stableNodeIds));
          } else if (collapseCenter && iteration <= 30) {
            nextGraphs.set(graphId, replacementBloomGraph(layout, collapseCenter, easeInOutCubic(iteration / 30), stableNodeIds));
          } else {
            nextGraphs.set(graphId, layout);
          }
          scene.messages = [`Replaying ${graphId}: physics iteration ${iteration}`];
          render();
        },
        {
          frameEvery: 3,
          forceFrameUntil: collapseCenter ? 30 : 0,
          maxIterations: 420,
          frameDelayMs: 0,
          seed,
          shouldStop: () => layoutStopRequested || epoch !== layoutEpoch
        }
      );
      if (epoch !== layoutEpoch) return;
      nextGraphs.set(graphId, finalLayout);
    }
    scene.messages = finalMessages.length > 0 ? finalMessages : ['Rewrite replay finished.'];
  } catch (error) {
    if (epoch !== layoutEpoch) return;
    const message = error instanceof Error ? error.message : String(error);
    scene.messages = ['Rewrite animation failed.', message];
    void layoutScene(nextScene);
  } finally {
    if (epoch === layoutEpoch) {
      render();
    }
  }
};

const setScene = (nextScene: SceneState) => {
  scene = nextScene;
  activePuzzleId = scene.puzzleId || activePuzzleId;
  rules = disabledRulesFor(scene);
  invalidateRuleDock();
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

const viewForLayoutScale = (g: LayoutGraph, panel: Rect, scale: number): View => ({
  scale,
  tx: panel.x + panel.w * 0.5 - (g.width * 0.5) * scale,
  ty: panel.y + panel.h * 0.5 - (g.height * 0.5) * scale
});

const sharedViewScale = (graphs: LayoutGraph[], panel: Rect) => {
  const pad = 18;
  const w = Math.max(1, ...graphs.map((g) => g.width + pad * 2));
  const h = Math.max(1, ...graphs.map((g) => g.height + pad * 2));
  return Math.max(0.05, Math.min(panel.w / w, panel.h / h)) * zoom;
};

const previewViewForLayout = (g: LayoutGraph, panel: Rect, zoomFactor: number, allowHorizontalOverflow: boolean): View => {
  const pad = 14;
  const w = Math.max(1, g.width + pad * 2);
  const h = Math.max(1, g.height + pad * 2);
  const horizontalAllowance = allowHorizontalOverflow ? 2.2 : 1;
  const scale = Math.max(0.05, Math.min((panel.w * horizontalAllowance) / w, panel.h / h)) * zoomFactor;
  return viewForLayoutScale(g, panel, scale);
};

const toScreen = (p: LayoutPoint, v: View): Point => ({ x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty });

const inPanel = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

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

const crossingDiagnosticsForGraph = (g: LayoutGraph, view: View): CrossingDiagnostic[] => {
  if (!perf.debugCrossings) return [];
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
  const center = toScreen({ x: node.x + node.w * 0.5, y: node.y + node.h * 0.5 }, view);
  const minW = node.boundary ? (preview ? 4 : 8) : (preview ? 5 : 22);
  const minH = node.boundary ? (preview ? 4 : 8) : (preview ? 5 : 18);
  const w = Math.max(minW, node.w * view.scale * (preview ? 0.78 : 1));
  const h = Math.max(minH, node.h * view.scale * (preview ? 0.78 : 1));
  const p = { x: center.x - w * 0.5, y: center.y - h * 0.5 };
  if (node.boundary) {
    c.fillStyle = cssVar('--pin', '#9aa8b8');
    c.beginPath();
    const r = Math.min(preview ? 2.4 : 3.4, Math.max(preview ? 1.5 : 2.2, Math.min(w, h) * 0.28));
    c.arc(p.x + w * 0.5, p.y + h * 0.5, r, 0, Math.PI * 2);
    c.fill();
    return;
  }
  const isSel = selected.has(node.id);
  c.fillStyle = node.color || '#7f8c8d';
  c.strokeStyle = isSel ? cssVar('--accent', '#3b73c4') : '#243949';
  c.lineWidth = preview ? 0.75 : isSel ? 3.2 : 1.6;
  if (node.shape === 'circle' || node.shape === 'cross') {
    c.beginPath();
    c.arc(p.x + w * 0.5, p.y + h * 0.5, Math.max(w, h) * 0.5, 0, Math.PI * 2);
  } else if (node.shape === 'triangle') {
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.lineTo(p.x + w, p.y);
    c.lineTo(p.x + w * 0.5, p.y + h);
    c.closePath();
  } else {
    roundedRectPath(c, p.x, p.y, w, h, preview ? 2 : 6);
  }
  c.fill();
  c.stroke();
  if (!preview) {
    c.fillStyle = '#ffffff';
    c.font = '700 12px Menlo, Consolas, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const labelY = node.shape === 'triangle' ? p.y + h * 0.42 : p.y + h * 0.5 + 0.5;
    c.fillText(node.label, p.x + w * 0.5, labelY);
  }
};

const drawQuestionEquals = (c: CanvasRenderingContext2D, x: number, y: number, size = 34) => {
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

const drawPlainEquals = (c: CanvasRenderingContext2D, x: number, y: number, size = 28) => {
  c.save();
  c.fillStyle = '#47607a';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `900 ${size}px "Avenir Next", sans-serif`;
  c.fillText('=', x, y);
  c.restore();
};

const drawLayoutGraphOn = (c: CanvasRenderingContext2D, g: LayoutGraph, panel: Rect, selected: Set<string>, view = viewForLayout(g, panel)) => {
  c.fillStyle = '#ffffff';
  c.strokeStyle = '#d4deea';
  c.lineWidth = 1.2;
  roundedRectPath(c, panel.x, panel.y, panel.w, panel.h, 14);
  c.fill();
  c.stroke();

  c.save();
  roundedRectPath(c, panel.x, panel.y, panel.w, panel.h, 14);
  c.clip();
  g.edges.forEach((edge) => {
    c.strokeStyle = edge.color || '#2f4f67';
    c.lineWidth = 2.8;
    strokeSmoothPolyline(c, edge.points.map((p) => toScreen(p, view)));
  });
  g.nodes.forEach((node) => drawNode(c, node, view, selected));
  c.restore();
  return view;
};

const drawLayoutGraph = (g: LayoutGraph, panel: Rect, selected: Set<string>, view?: View) => drawLayoutGraphOn(ctx, g, panel, selected, view);

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
  ctx.lineWidth = 2.4;
  ctx.fill();
  ctx.stroke();
};

const fingerTo = async (p: Point, ms = 700, signal?: AbortSignal) => {
  tutorialFinger.style.transition = `transform ${ms}ms cubic-bezier(.45,.05,.2,1)`;
  tutorialFinger.style.transform = `translate(${p.x}px, ${p.y}px)`;
  await sleep(ms + 40, signal);
};

const tutorialCanvasPointToPage = (p: Point): Point => {
  const rect = tutorialCanvas.getBoundingClientRect();
  return { x: rect.left + p.x, y: rect.top + p.y };
};

const fireTutorialRipple = (p: Point) => {
  tutorialRipple.style.left = `${p.x}px`;
  tutorialRipple.style.top = `${p.y}px`;
  tutorialRipple.classList.remove('tut-firing');
  void tutorialRipple.offsetWidth;
  tutorialRipple.classList.add('tut-firing');
};

const interpolateClosedPath = (points: Point[], t: number) => {
  const segments = points.map((p, idx) => [p, points[(idx + 1) % points.length]] as const);
  const scaled = clamp(t, 0, 1) * segments.length;
  const whole = Math.floor(scaled);
  const frac = scaled - whole;
  const out: Point[] = [points[0]];
  for (let i = 0; i < Math.min(whole, segments.length); i += 1) out.push(segments[i][1]);
  if (whole < segments.length) {
    const [a, b] = segments[whole];
    out.push({ x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac });
  }
  return out;
};

const lassoPathForSelection = (selection: SelectionDescriptor, panel: Rect, layout: LayoutGraph) => {
  const view = viewForLayout(layout, panel);
  const selected = new Set(selection.selectedNodeIds);
  const selectedNodes = layout.nodes.filter((n) => selected.has(n.id));
  const xs: number[] = [];
  const ys: number[] = [];
  selectedNodes.forEach((node) => {
    const a = toScreen({ x: node.x, y: node.y }, view);
    const b = toScreen({ x: node.x + node.w, y: node.y + node.h }, view);
    xs.push(a.x, b.x);
    ys.push(a.y, b.y);
  });
  if (xs.length === 0) return [];
  const pad = TUTORIAL_LASSO_PAD;
  const x0 = Math.max(panel.x + 10, Math.min(...xs) - pad);
  const x1 = Math.min(panel.x + panel.w - 10, Math.max(...xs) + pad);
  const y0 = Math.max(panel.y + 10, Math.min(...ys) - pad);
  const y1 = Math.min(panel.y + panel.h - 10, Math.max(...ys) + pad);
  const cx = (x0 + x1) * 0.5;
  return [
    { x: cx, y: y0 },
    { x: x1, y: y0 + (y1 - y0) * 0.22 },
    { x: x1 - (x1 - x0) * 0.1, y: y1 },
    { x: x0 + (x1 - x0) * 0.08, y: y1 - (y1 - y0) * 0.12 },
    { x: x0, y: y0 + (y1 - y0) * 0.25 }
  ];
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
    rules = disabledRulesFor(scene, 'Select a sub-diagram');
    return;
  }
  const graphId = pickGraphFromLasso(panels);
  if (!graphId) {
    currentSelection = emptySelection();
    rules = disabledRulesFor(scene, 'Select either side');
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
    cycleOrder: [],
    debug: perf.debugSelection
  };
  rules = perf.time('ocaml.evaluateSelection', () => adapter.evaluateSelection(currentSelection));
  if (!rules.some((r) => r.enabled)) {
    const why = rules.map((r) => `${r.name}: ${r.reason ?? 'not applicable'}`).join(' | ');
    scene.messages = [`No rule matches this ${graphId} selection (${selected.length} nodes).`, why];
  } else {
    scene.messages = [`Selection on ${graphId}: ${selected.length} node(s). Applicable rules highlighted.`];
  }
};

const spreadPreviewUnitTriangles = (g: LayoutGraph): LayoutGraph => {
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

const svgNode = (node: LayoutNode, view: View) => {
  const center = toScreen({ x: node.x + node.w * 0.5, y: node.y + node.h * 0.5 }, view);
  const minW = node.boundary ? 4 : 5;
  const minH = node.boundary ? 4 : 5;
  const w = Math.max(minW, node.w * view.scale * 0.78);
  const h = Math.max(minH, node.h * view.scale * 0.78);
  const x = center.x - w * 0.5;
  const y = center.y - h * 0.5;
  if (node.boundary) {
    const r = Math.min(2.4, Math.max(1.5, Math.min(w, h) * 0.28));
    return `<circle cx="${center.x.toFixed(2)}" cy="${center.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${escAttr(cssVar('--pin', '#9aa8b8'))}" />`;
  }
  const fill = escAttr(node.color || '#7f8c8d');
  const stroke = '#243949';
  if (node.shape === 'circle' || node.shape === 'cross') {
    const r = Math.max(w, h) * 0.5;
    return `<circle cx="${center.x.toFixed(2)}" cy="${center.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${fill}" stroke="${stroke}" stroke-width="0.75" />`;
  }
  if (node.shape === 'triangle') {
    const points = `${x.toFixed(2)},${y.toFixed(2)} ${(x + w).toFixed(2)},${y.toFixed(2)} ${(x + w * 0.5).toFixed(2)},${(y + h).toFixed(2)}`;
    return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="0.75" />`;
  }
  return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="0.75" />`;
};

const svgGraphPreview = (graph: LayoutGraph, panel: Rect) => {
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
  const nodes = g.nodes.map((node) => svgNode(node, view)).join('');
  return `
    <clipPath id="${clipId}"><rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" /></clipPath>
    <g clip-path="url(#${clipId})">${edges}${nodes}</g>
  `;
};

const rulePreviewSvg = (rule: { lhs: LayoutGraph; rhs: LayoutGraph }, width: number, height: number, dimmed: boolean) => {
  const gutter = 30;
  const pad = 5;
  const hasZeroInput = [...rule.lhs.nodes, ...rule.rhs.nodes].some((node) => !node.boundary && node.shape === 'triangle');
  const verticalInset = hasZeroInput ? -7 : 0;
  const sideW = (width - gutter - pad * 2) * 0.5;
  const left: Rect = { x: pad, y: pad + verticalInset, w: sideW, h: height - pad * 2 - verticalInset * 2 };
  const right: Rect = { x: pad + sideW + gutter, y: pad + verticalInset, w: sideW, h: height - pad * 2 - verticalInset * 2 };
  return `
    <svg class="rule-preview-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="rewrite rule preview" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" rx="8" fill="${dimmed ? '#f2f6fb' : '#fbfdff'}" />
      ${svgGraphPreview(rule.lhs, left)}
      ${svgGraphPreview(rule.rhs, right)}
      <text x="${width * 0.5}" y="${height * 0.5}" text-anchor="middle" dominant-baseline="central" fill="#47607a" font-family="Avenir Next, sans-serif" font-size="24" font-weight="900">=</text>
    </svg>
  `;
};

const drawRulePreviewGraphs = (container: HTMLElement, rule: { lhs: LayoutGraph; rhs: LayoutGraph }, dimmed: boolean) => {
  const width = Math.max(220, Math.floor(container.clientWidth || 220));
  const height = Math.max(92, Math.floor(container.clientHeight || 92));
  container.innerHTML = rulePreviewSvg(rule, width, height, dimmed);
};

const drawRulePreview = (container: HTMLElement, name: string, dimmed: boolean) => {
  const width = Math.max(220, Math.floor(container.clientWidth || 220));
  const height = Math.max(92, Math.floor(container.clientHeight || 92));
  const rule = layouts?.rules.get(name);
  if (!rule) {
    container.innerHTML = `
      <svg class="rule-preview-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="rewrite rule preview loading" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" rx="8" fill="${dimmed ? '#f2f6fb' : '#fbfdff'}" />
        <text x="${width * 0.5}" y="${height * 0.5}" text-anchor="middle" dominant-baseline="central" fill="#8da0b3" font-family="Avenir Next, sans-serif" font-size="11" font-weight="600">layout...</text>
      </svg>
    `;
    return;
  }
  drawRulePreviewGraphs(container, rule, dimmed);
};

const renderLevelButtons = () => {
  const key = `${activePuzzleId}|${puzzles.map((p) => `${p.id}:${p.level}:${p.title}`).join(',')}`;
  if (key === renderedLevelsKey) return;
  renderedLevelsKey = key;
  const labelFor = (puzzle: PuzzleInfo) => `${puzzle.level}: ${puzzle.title.replace(/^Level\s+\d+:\s*/, '')}`;
  levelActions.replaceChildren(
    ...puzzles.map((puzzle: PuzzleInfo) => {
      const option = document.createElement('option');
      option.value = puzzle.id;
      option.textContent = labelFor(puzzle);
      return option;
    })
  );
  levelActions.value = activePuzzleId;
};

const refreshUi = () => {
  const lastMessage = scene.messages[0] || scene.subtitle || 'Lasso a tangle, then pick a move';
  const hasSelection = currentSelection.selectedNodeIds.length > 0;
  const hasEnabledRule = rules.some((r) => r.enabled);
  subtitle.textContent = hasSelection && hasEnabledRule
    ? `${currentSelection.selectedNodeIds.length} piece(s) selected. Pick a lit-up move.`
    : lastMessage;
  if (proofOpen) proof.textContent = scene.proofText || adapter.exportProof() || 'No proof yet.';
  renderLevelButtons();
  rulesContainer.dataset.selection = String(hasSelection);
  const ruleKey = [
    activePuzzleId,
    layouts ? 'ready' : 'pending',
    scene.rules.map((r) => r.name).join(','),
    rules.map((r) => `${r.name}:${r.enabled ? 1 : 0}:${r.reason ?? ''}`).join(',')
  ].join('|');
  if (ruleKey === renderedRulesKey) return;
  renderedRulesKey = ruleKey;
  rulesContainer.replaceChildren(
    ...scene.rules.map((rule, idx) => {
      const name = rule.name;
      const ra = rules.find((r) => r.name === name) ?? { name, enabled: false, reason: 'Unavailable' };
      const dimmed = hasSelection && !ra.enabled;
      const btn = document.createElement('button');
      btn.className = 'rule';
      btn.dataset.dimmed = String(dimmed);
      btn.type = 'button';
      btn.dataset.action = 'rule';
      btn.dataset.ruleName = name;
      btn.dataset.ruleKey = `R${idx + 1}`;
      btn.disabled = !ra.enabled;
      btn.title = ra.enabled ? `Apply ${name}` : ra.reason ?? 'Not applicable';
      btn.innerHTML = `
        <div class="rule-meta"><span class="rule-badge">R${idx + 1}</span><span class="rule-name"></span></div>
        <div class="rule-preview" aria-hidden="true"></div>
      `;
      const nameEl = btn.querySelector<HTMLElement>('.rule-name');
      if (nameEl) nameEl.textContent = name;
      const pv = btn.querySelector<HTMLElement>('.rule-preview');
      if (pv) drawRulePreview(pv, name, dimmed);
      return btn;
    })
  );
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

const render = (refresh = true) => {
  const endRender = perf.begin('render.total');
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  const pixelW = Math.floor(cssW * dpr);
  const pixelH = Math.floor(cssH * dpr);
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
    perf.count('render.canvasResize');
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const endCanvas = perf.begin('render.canvas');
  ctx.clearRect(0, 0, cssW, cssH);

  const panels = panelsForSize(cssW, cssH);
  const selectedLhs = new Set(currentSelection.graphId === 'lhs' ? currentSelection.selectedNodeIds : []);
  const selectedRhs = new Set(currentSelection.graphId === 'rhs' ? currentSelection.selectedNodeIds : []);
  const lhs = layouts?.graphs.get('lhs');
  const rhs = layouts?.graphs.get('rhs');
  const sharedScale = lhs && rhs ? sharedViewScale([lhs, rhs], panels.lhs) : undefined;
  const lhsView = lhs ? (sharedScale ? viewForLayoutScale(lhs, panels.lhs, sharedScale) : viewForLayout(lhs, panels.lhs)) : undefined;
  const rhsView = rhs ? (sharedScale ? viewForLayoutScale(rhs, panels.rhs, sharedScale) : viewForLayout(rhs, panels.rhs)) : undefined;
  if (lhs && lhsView) drawLayoutGraph(lhs, panels.lhs, selectedLhs, lhsView);
  else drawPendingGraph(panels.lhs);
  if (rhs && rhsView) drawLayoutGraph(rhs, panels.rhs, selectedRhs, rhsView);
  else drawPendingGraph(panels.rhs);
  debugCrossings = perf.debugCrossings
    ? perf.time('debug.crossings', () => [
        ...(lhs && lhsView ? crossingDiagnosticsForGraph(lhs, lhsView) : []),
        ...(rhs && rhsView ? crossingDiagnosticsForGraph(rhs, rhsView) : [])
      ])
    : [];
  if (debugCrossings.length > 0) {
    ctx.save();
    ctx.strokeStyle = '#d33a2c';
    ctx.fillStyle = 'rgba(211, 58, 44, 0.16)';
    ctx.lineWidth = 1.5;
    debugCrossings.forEach(({ point }) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(point.x - 5, point.y - 5);
      ctx.lineTo(point.x + 5, point.y + 5);
      ctx.moveTo(point.x + 5, point.y - 5);
      ctx.lineTo(point.x - 5, point.y + 5);
      ctx.stroke();
    });
    ctx.restore();
  }

  const eqX = panels.lhs.x + panels.lhs.w + (panels.rhs.x - (panels.lhs.x + panels.lhs.w)) * 0.5;
  const eqY = panels.lhs.y + panels.lhs.h * 0.5;
  drawQuestionEquals(ctx, eqX, eqY, 38);
  if (currentSelection.selectedNodeIds.length > 0) {
    const panel = panels[currentSelection.graphId as 'lhs' | 'rhs'];
    ctx.strokeStyle = '#1f6da0';
    ctx.lineWidth = 2;
    roundedRectPath(ctx, panel.x + 2, panel.y + 2, panel.w - 4, panel.h - 4, 12);
    ctx.stroke();
  }
  drawLasso();
  endCanvas();
  if (refresh) {
    const endUi = perf.begin('render.ui');
    refreshUi();
    endUi();
  }
  endRender();
};

const canvasPoint = (clientX: number, clientY: number): Point => {
  const r = canvas.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
};

const startDrag = (p: Point) => {
  dragging = true;
  lasso = [p];
  render(false);
};

const moveDrag = (p: Point) => {
  if (!dragging) return;
  const q = lasso[lasso.length - 1];
  if (!q || (p.x - q.x) ** 2 + (p.y - q.y) ** 2 > 16) lasso.push(p);
  requestRender('lasso', false);
};

const finishDrag = (p: Point) => {
  if (!dragging) return;
  dragging = false;
  lasso.push(p);
  const rect = canvas.getBoundingClientRect();
  const panels = panelsForSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
  const inEither = lasso.some((q) => inPanel(q, panels.lhs) || inPanel(q, panels.rhs));
  if (!inEither || lasso.length < 3) {
    lasso = [];
    currentSelection = emptySelection();
    rules = disabledRulesFor(scene, 'Select a sub-diagram');
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
  rules = disabledRulesFor(scene, 'Select a sub-diagram');
};

const applyRuleFromButton = async (btn: HTMLButtonElement) => {
  const name = btn.dataset.ruleName ?? '';
  if (!name || btn.disabled) return;
  const selection = { ...currentSelection, selectedNodeIds: [...currentSelection.selectedNodeIds] };
  const seed = seedFromCurrentLayout(selection);
  const collapseCenter = layoutCenterFromCurrentSelection(selection);
  const res = perf.time('ocaml.applyRule', () => adapter.applyRule(name, selection));
  if (res.ok && res.scene) {
    bumpMoves();
    const solved = res.scene.messages.some((m) => m.includes('You just made a proof'));
    await animateSelectionCollapse(selection);
    clearSelection();
    await animateRewriteScene(res.scene, selection.graphId, seed, collapseCenter, new Set(selection.selectedNodeIds));
    if (solved) showSuccess();
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
  const perfActionEl = (e.target as Element | null)?.closest<HTMLElement>('[data-perf-action]');
  if (perfActionEl) {
    const action = perfActionEl.dataset.perfAction;
    if (action === 'reset') {
      perf.reset();
      updatePerfPanel();
    } else if (action === 'crossings') {
      perf.setDebugCrossings(!perf.debugCrossings);
      requestRender('debug-crossings');
      updatePerfPanel();
    } else if (action === 'selection') {
      perf.setDebugSelection(!perf.debugSelection);
      updatePerfPanel();
    } else if (action === 'copy') {
      const text = JSON.stringify(perf.snapshot(), null, 2);
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      perfOutput.textContent = `${formatPerfRows()}\n\nCopied JSON if clipboard access is available.`;
    } else if (action === 'hide') {
      hidePerfPanel();
    }
    return;
  }
  const actionEl = (e.target as Element | null)?.closest<HTMLElement>('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'reset' || action === 'play-again') {
    layoutStopRequested = true;
    releaseLayoutStep();
    resetShellState();
    clearSelection();
    setScene(adapter.reset(activePuzzleId));
    render();
  } else if (action === 'puzzle') {
    loadPuzzle(actionEl.dataset.puzzleId || DEFAULT_PUZZLE_ID);
  } else if (action === 'next-level') {
    loadPuzzle(nextPuzzleId());
  } else if (action === 'undo') {
    layoutStopRequested = true;
    releaseLayoutStep();
    successModal.removeAttribute('data-open');
    proofPanel.removeAttribute('data-open');
    proofOpen = false;
    successOpen = false;
    clearSelection();
    setScene(adapter.undo());
    render();
  } else if (action === 'redo') {
    layoutStopRequested = true;
    releaseLayoutStep();
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
    void startTutorial();
  } else if (action === 'close-tutorial') {
    stopTutorial();
  } else if (action === 'close-help') {
    helpPanel.removeAttribute('data-open');
  }
});

document.addEventListener('pointerdown', (e) => {
  if (!tutorialRunning) return;
  const target = e.target as Element | null;
  if (target?.closest('[data-action="help"]')) return;
  stopTutorial();
}, true);

document.addEventListener('keydown', () => {
  if (tutorialRunning) stopTutorial();
}, true);

levelActions.addEventListener('change', () => {
  loadPuzzle(levelActions.value || DEFAULT_PUZZLE_ID);
});

if (typeof (window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => requestRender('resize', false));
  ro.observe(canvas);
} else {
  window.addEventListener('resize', () => requestRender('resize', false));
}

void layoutScene(scene);

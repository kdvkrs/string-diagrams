import './style.css';
import { OcamlAdapter } from './engine/ocamlAdapter';
import { type LayoutGraph, type LayoutNode, type LayoutPoint } from './layout/layoutTypes';
import { animateSceneGraphLayout, layoutSceneGraph, type LayoutSeed } from './layout/physicsLayout';
import type { PortRef, PuzzleInfo, RuleAvailability, RuleCandidate, SceneGraph, SceneRule, SceneState, SelectionDescriptor } from './model/interop';
import { perf } from './perf';
import {
  type Point,
  type Rect,
  type View,
  toScreen,
  rulePreviewSvg as rulePreviewSvgBase,
} from './diagramSvg';
import { getInitialLocale, localizePuzzle, localizePuzzles, storeLocale, supportedLocales, switchLocale, translations, type Locale } from './i18n';
type PanelMap = { lhs: Rect; rhs: Rect };
type CrossingDiagnostic = { graphId: string; edgeA: string; edgeB: string; point: Point };
type AssistPlacement = 'top' | 'right' | 'bottom' | 'left';
type AssistFocusRect = 'lhs' | 'rhs';
type AssistRelativeRect = { x: number; y: number; w: number; h: number };
type AssistStep = {
  selector: string;
  padding: number;
  focusRect?: AssistFocusRect;
  lassoRect?: AssistRelativeRect;
  selectionDemo?: 'level-1-em';
  before?: 'select-level-1' | 'apply-level-1';
  kicker: string;
  title: string;
  body: string;
  placement: AssistPlacement;
  demo?: 'lasso';
};
type LayoutState = {
  graphs: Map<string, LayoutGraph>;
  rules: Map<string, { lhs: LayoutGraph; rhs: LayoutGraph }>;
};
type ActiveRuleMatchSet = {
  key: string;
  label: string;
  ruleNames: string[];
  candidates: RuleCandidate[];
} | null;
type RuleDisplayItem = {
  key: string;
  label: string;
  representativeName: string;
  ruleNames: string[];
  rules: SceneRule[];
};

const DEFAULT_PUZZLE_ID = 'clean-up-two-units';
const ASSIST_STAGE_SELECTOR = '.stage';
const locale: Locale = getInitialLocale();
const t = translations[locale];

storeLocale(locale);
document.documentElement.lang = locale;
document.title = t.appTitle;

const ASSIST_STEPS_LEVEL_1: AssistStep[] = [
  {
    selector: ASSIST_STAGE_SELECTOR,
    padding: 8,
    focusRect: 'lhs',
    // Manual tuning hook: relative to the focused LHS region, not the whole viewport.
    lassoRect: { x: 0.18, y: 0.18, w: 0.42, h: 0.46 },
    kicker: t.assist.level1[0].kicker,
    title: t.assist.level1[0].title,
    body: t.assist.level1[0].body,
    placement: 'right',
    selectionDemo: 'level-1-em',
    demo: 'lasso'
  },
  {
    selector: '#rules',
    padding: 8,
    before: 'select-level-1',
    kicker: t.assist.level1[1].kicker,
    title: t.assist.level1[1].title,
    body: t.assist.level1[1].body,
    placement: 'top'
  },
  {
    selector: ASSIST_STAGE_SELECTOR,
    padding: 8,
    focusRect: 'lhs',
    before: 'apply-level-1',
    kicker: t.assist.level1[2].kicker,
    title: t.assist.level1[2].title,
    body: t.assist.level1[2].body,
    placement: 'right'
  },
  {
    selector: ASSIST_STAGE_SELECTOR,
    padding: 8,
    kicker: t.assist.level1[3].kicker,
    title: t.assist.level1[3].title,
    body: t.assist.level1[3].body,
    placement: 'top'
  }
];

const ASSIST_STEPS_LEVEL_3: AssistStep[] = [
  {
    selector: ASSIST_STAGE_SELECTOR,
    padding: 8,
    focusRect: 'rhs',
    kicker: t.assist.level3[0].kicker,
    title: t.assist.level3[0].title,
    body: t.assist.level3[0].body,
    placement: 'left'
  }
];

const ASSIST_STEPS_LEVEL_5: AssistStep[] = [
  {
    selector: '#rules',
    padding: 8,
    kicker: t.assist.level5[0].kicker,
    title: t.assist.level5[0].title,
    body: t.assist.level5[0].body,
    placement: 'top'
  }
];

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

const expertModeLabel = locale === 'de' ? 'Expertenmodus' : 'Expert mode';
const expertModeDescription = locale === 'de' ? 'Bereich einkreisen statt Regel wählen' : 'Circle a region instead of choosing a rule';
const moreOptionsLabel = locale === 'de' ? 'Mehr Optionen' : 'More options';

app.innerHTML = `
  <header class="topbar">
    <div class="tb-left">
      <div class="tb-status" id="subtitle">
        <span class="dot"></span>
        <span id="subtitle-text"></span>
      </div>
      <div class="seg">
        <button class="btn icon-btn" data-action="reset" aria-label="${t.reset}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.662l3.181 3.181"/></svg>
        </button>
        <button class="btn icon-btn" data-action="undo" aria-label="${t.undo}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"/></svg>
        </button>
        <button class="btn icon-btn" data-action="redo" aria-label="${t.redo}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3"/></svg>
        </button>
      </div>
    </div>
    <div class="tb-right">
      <label class="lang-pick" aria-label="${t.chooseLanguage}">
        <svg class="globe" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.6 2.4 15.4 0 18M12 3c-2.4 2.6-2.4 15.4 0 18"/></svg>
        <select id="locale-actions">
          ${supportedLocales.map((value) => `<option value="${value}"${value === locale ? ' selected' : ''}>${translations[value].languageName}</option>`).join('')}
        </select>
      </label>
      <button class="btn help-btn" data-action="help" aria-label="${t.showHelp}">?</button>
      <details class="more">
        <summary class="more-trigger" aria-label="${moreOptionsLabel}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
        </summary>
        <div class="more-pop">
          <div class="more-section">
            <span class="more-cap">${t.levelLabel}</span>
            <label class="more-select" aria-label="${t.choosePuzzleLevel}">
              <select id="level-actions"></select>
            </label>
          </div>
          <button class="more-toggle expert-toggle" data-action="expert-toggle" type="button" aria-pressed="false" data-active="false">
            <span class="more-toggle-main">
              <span class="more-toggle-title">${expertModeLabel}</span>
              <span class="more-toggle-sub">${expertModeDescription}</span>
            </span>
            <span class="switch" aria-hidden="true"><span class="knob"></span></span>
          </button>
          <div class="more-sep"></div>
          <button class="more-link" data-action="reset-demo" type="button">${t.resetDemo}</button>
        </div>
      </details>
    </div>
  </header>
  <main class="stages">
    <div class="stage">
      <canvas id="stage" aria-label="${t.diagramStage}"></canvas>
    </div>
    <div id="success-modal" role="dialog" aria-modal="true" aria-labelledby="success-title">
      <canvas id="confetti-canvas"></canvas>
      <div class="modal modal--success">
        <div class="modal-check" aria-hidden="true">✓</div>
        <div class="modal-title" id="success-title">${t.successTitle}</div>
        <div class="modal-body">
          ${t.successBodyHtml}
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="play-again">${t.playAgain}</button>
          <button class="btn btn--primary" data-action="see-proof">${t.seeProof}</button>
          <button class="btn btn--primary" data-action="next-level">${t.nextLevel}</button>
        </div>
      </div>
      <div class="modal modal--end">
        <div class="modal-check" aria-hidden="true">★</div>
        <div class="modal-title">${t.congratulations}</div>
        <div class="modal-body">
          ${t.finalSuccessBody}
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="play-again">${t.replayFinalLevel}</button>
          <button class="btn btn--primary" data-action="see-proof">${t.seeProof}</button>
        </div>
      </div>
    </div>
    <div id="proof-panel" aria-live="polite">
      <div class="proof-card">
        <div class="proof-head">
          <div>
            <div class="proof-kicker">${t.proofKicker}</div>
            <h2 id="proof-title">${t.yourProof}</h2>
          </div>
        </div>
        <p class="proof-explainer">${t.proofExplainer}</p>
        <pre id="proof" class="rocq-proof"></pre>
        <div class="proof-share-status" id="proof-share-status" aria-live="polite"></div>
        <div class="proof-actions">
          <button class="btn" id="proof-share-action" data-action="share-proof">${t.shareProof}</button>
          <button class="btn btn--primary" id="proof-primary-action" data-action="next-level">${t.nextLevel}</button>
        </div>
      </div>
    </div>
    <div id="help-panel">
      <div class="help-card">
        <div class="proof-head">
          <div>
            <div class="proof-kicker">${t.howToPlay}</div>
            <h2>${t.makeDiagramsMatch}</h2>
          </div>
          <button class="btn" data-action="close-help">${t.close}</button>
        </div>
        ${t.helpParagraphs.map((paragraph) => `<p>${paragraph}</p>`).join('')}
      </div>
    </div>
    <div id="tutorial-panel" aria-live="polite">
      <div class="tutorial-card">
        <div class="proof-head">
          <div>
            <div class="proof-kicker">${t.howToPlay}</div>
            <h2>${t.makeDiagramsMatch}</h2>
          </div>
          <button class="btn" data-action="close-tutorial">${t.close}</button>
        </div>
        <p class="tutorial-copy">${t.tutorialCopy}</p>
        <div class="tutorial-stage-wrap">
          <canvas id="tutorial-stage" aria-label="${t.tutorialDiagramStage}"></canvas>
        </div>
        <button class="rule tutorial-rule" id="tutorial-rule-card" type="button">
          <div class="rule-meta"><span class="rule-badge">${t.move}</span><span class="rule-name">${t.checkedRule}</span></div>
          <div class="tutorial-rule-preview" id="tutorial-rule-preview" aria-hidden="true"></div>
        </button>
      </div>
    </div>
    <div id="assist-welcome-panel">
      <div class="assist-welcome-card">
        <div class="modal-title">${t.welcomeTitle}</div>
        <div class="modal-body">${t.welcomeBody}</div>
        <img class="assist-welcome-image" src="./sd_upscaled.png" alt="" aria-hidden="true"/>
        <div class="modal-actions">
          <button class="btn btn--primary" data-action="assist-start">${t.startDemo}</button>
        </div>
      </div>
    </div>
    <div id="reset-demo-panel" role="dialog" aria-modal="true" aria-labelledby="reset-demo-title">
      <div class="modal reset-demo-card">
        <div class="modal-title" id="reset-demo-title">${t.resetDemoTitle}</div>
        <div class="modal-body">${t.resetDemoBody}</div>
        <div class="modal-actions">
          <button class="btn" data-action="cancel-reset-demo">${t.cancel}</button>
          <button class="btn btn--primary" data-action="confirm-reset-demo">${t.startOver}</button>
        </div>
      </div>
    </div>
  </main>
  <div class="tut-root" id="tutorial-root" aria-hidden="true" hidden>
    <svg class="tut-veil" id="tutorial-veil" preserveAspectRatio="none">
      <defs>
        <mask id="tutorial-mask" maskUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill="white"/>
          <rect id="tutorial-mask-cutout" rx="12" ry="12" fill="black"/>
        </mask>
      </defs>
      <rect class="veil-fill" width="100%" height="100%" mask="url(#tutorial-mask)"/>
      <rect class="veil-ring" id="tutorial-ring" rx="12" ry="12"/>
    </svg>
    <svg class="tut-demo" id="tutorial-demo" preserveAspectRatio="none">
      <path class="tut-demo-lasso" id="tutorial-demo-lasso"/>
    </svg>
    <div class="tut-card" id="tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <div class="tut-tail"></div>
      <div class="tut-card-kicker" id="tutorial-kicker">${t.assist.level1[0].kicker}</div>
      <h2 class="tut-card-title" id="tutorial-title">${t.assist.level1[0].title}</h2>
      <p class="tut-card-body" id="tutorial-body">${t.assist.level1[0].body}</p>
      <div class="tut-card-foot">
        <div class="tut-dots" id="tutorial-dots"></div>
        <div class="tut-actions">
          <button class="tut-btn tut-btn--ghost" data-action="assist-skip">${t.skip}</button>
          <button class="tut-btn tut-btn--primary" data-action="assist-next" id="tutorial-next">${t.next}</button>
        </div>
      </div>
    </div>
  </div>
  <div class="tut-caption" id="tutorial-caption" aria-hidden="true">${t.circleRealRewrite}</div>
  <div class="selection-feedback" id="selection-feedback" aria-live="polite"></div>
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
      <button type="button" data-perf-action="reset">${t.reset}</button>
      <button type="button" data-perf-action="copy">Copy</button>
      <button type="button" data-perf-action="hide">Hide</button>
    </div>
    <pre id="perf-output"></pre>
  </div>
  <footer class="dock">
    <div class="dock-label">${t.moves}</div>
    <div class="rules-shell" id="rules-shell">
      <div class="rules" id="rules"></div>
      <div class="rules-scroll-cue" aria-hidden="true">${t.slideForMoreMoves}</div>
    </div>
  </footer>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const subtitle = document.querySelector<HTMLElement>('#subtitle-text');
const proof = document.querySelector<HTMLPreElement>('#proof');
const proofTitle = document.querySelector<HTMLElement>('#proof-title');
const proofShareStatus = document.querySelector<HTMLElement>('#proof-share-status');
const proofShareAction = document.querySelector<HTMLButtonElement>('#proof-share-action');
const proofPrimaryAction = document.querySelector<HTMLButtonElement>('#proof-primary-action');
const moveCountEl = document.querySelector<HTMLElement>('#move-count');
const moveCounter = document.querySelector<HTMLElement>('[data-move-counter]');
const successModal = document.querySelector<HTMLElement>('#success-modal');
const proofPanel = document.querySelector<HTMLElement>('#proof-panel');
const helpPanel = document.querySelector<HTMLElement>('#help-panel');
const tutorialPanel = document.querySelector<HTMLElement>('#tutorial-panel');
const assistWelcomePanel = document.querySelector<HTMLElement>('#assist-welcome-panel');
const resetDemoPanel = document.querySelector<HTMLElement>('#reset-demo-panel');
const tutorialCanvas = document.querySelector<HTMLCanvasElement>('#tutorial-stage');
const tutorialRuleCard = document.querySelector<HTMLButtonElement>('#tutorial-rule-card');
const tutorialRulePreview = document.querySelector<HTMLElement>('#tutorial-rule-preview');
const tutorialRoot = document.querySelector<HTMLElement>('#tutorial-root');
const tutorialVeil = document.querySelector<SVGSVGElement>('#tutorial-veil');
const tutorialMaskCutout = document.querySelector<SVGRectElement>('#tutorial-mask-cutout');
const tutorialRing = document.querySelector<SVGRectElement>('#tutorial-ring');
const tutorialDemoLasso = document.querySelector<SVGPathElement>('#tutorial-demo-lasso');
const tutorialCard = document.querySelector<HTMLElement>('#tutorial-card');
const tutorialKicker = document.querySelector<HTMLElement>('#tutorial-kicker');
const tutorialTitle = document.querySelector<HTMLElement>('#tutorial-title');
const tutorialBody = document.querySelector<HTMLElement>('#tutorial-body');
const tutorialDots = document.querySelector<HTMLElement>('#tutorial-dots');
const tutorialNext = document.querySelector<HTMLButtonElement>('#tutorial-next');
const confettiCanvas = document.querySelector<HTMLCanvasElement>('#confetti-canvas');
const tutorialCaption = document.querySelector<HTMLElement>('#tutorial-caption');
const selectionFeedback = document.querySelector<HTMLElement>('#selection-feedback');
const tutorialFinger = document.querySelector<HTMLElement>('#tutorial-finger');
const tutorialRipple = document.querySelector<HTMLElement>('#tutorial-ripple');
const perfPanel = document.querySelector<HTMLElement>('#perf-panel');
const perfOutput = document.querySelector<HTMLPreElement>('#perf-output');
const levelActions = document.querySelector<HTMLSelectElement>('#level-actions');
const localeActions = document.querySelector<HTMLSelectElement>('#locale-actions');
const rulesShell = document.querySelector<HTMLElement>('#rules-shell');
const rulesContainer = document.querySelector<HTMLElement>('#rules');
const expertToggle = document.querySelector<HTMLButtonElement>('[data-action="expert-toggle"]');
if (
  !canvas || !subtitle || !proof || !proofTitle || !proofShareStatus || !proofShareAction || !proofPrimaryAction || !successModal || !proofPanel || !helpPanel ||
  !tutorialPanel || !assistWelcomePanel || !resetDemoPanel || !tutorialCanvas || !tutorialRuleCard || !tutorialRulePreview || !tutorialRoot ||
  !tutorialVeil || !tutorialMaskCutout || !tutorialRing || !tutorialDemoLasso || !tutorialCard || !tutorialKicker || !tutorialTitle ||
  !tutorialBody || !tutorialDots || !tutorialNext || !confettiCanvas || !tutorialCaption || !selectionFeedback || !tutorialFinger || !tutorialRipple ||
  !perfPanel || !perfOutput ||
  !levelActions || !localeActions || !rulesShell || !rulesContainer || !expertToggle
) {
  throw new Error('Missing required UI element');
}
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2D context unavailable');
const tutorialCtx = tutorialCanvas.getContext('2d');
if (!tutorialCtx) throw new Error('Tutorial 2D context unavailable');

const adapter = new OcamlAdapter(DEFAULT_PUZZLE_ID);
const puzzles = localizePuzzles(adapter.listDemos(), t);
const localizeScene = (nextScene: SceneState): SceneState => {
  const puzzle = localizePuzzle(
    {
      id: nextScene.puzzleId,
      level: nextScene.level,
      title: nextScene.title,
      subtitle: nextScene.subtitle
    },
    t
  );
  return {
    ...nextScene,
    level: puzzle.level,
    title: puzzle.title,
    subtitle: puzzle.subtitle,
    messages: nextScene.messages.map(t.sceneMessage)
  };
};
let scene: SceneState = localizeScene(adapter.getScene());
let layouts: LayoutState | null = null;
let layoutEpoch = 0;
let activePuzzleId = scene.puzzleId || DEFAULT_PUZZLE_ID;
const disabledRulesFor = (s: SceneState, reason = t.reason('No selection')): RuleAvailability[] =>
  s.rules.map((rule) => ({ name: rule.name, enabled: false, reason }));
let rules: RuleAvailability[] = disabledRulesFor(scene);

const DEBUG_LEVEL_TRACE = true;
const DEBUG_LEVEL_PREFIX = '[DEBUG-sd-levels]';

const debugGraphSnapshot = (graph: SceneGraph) => ({
  id: graph.id,
  sources: graph.sources,
  targets: graph.targets,
  nodeCount: graph.nodes.length,
  edgeCount: graph.edges.length,
  nodes: graph.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    kind: node.kind,
    shape: node.visual.shape ?? '',
    nsources: node.nsources,
    ntargets: node.ntargets
  }))
});

const debugLayoutSnapshot = (graph: LayoutGraph | undefined) => {
  if (!graph) return null;
  const nodes = graph.nodes.filter((node) => !node.boundary);
  const xs = nodes.flatMap((node) => [node.x, node.x + node.w]);
  const ys = nodes.flatMap((node) => [node.y, node.y + node.h]);
  return {
    id: graph.id,
    width: graph.width,
    height: graph.height,
    nodeCount: nodes.length,
    bounds: xs.length === 0 ? null : {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    },
    nodes: nodes.map((node) => ({
      id: node.id,
      label: node.label,
      x: Math.round(node.x * 10) / 10,
      y: Math.round(node.y * 10) / 10,
      modelX: node.modelX === undefined ? undefined : Math.round(node.modelX * 10) / 10,
      modelY: node.modelY === undefined ? undefined : Math.round(node.modelY * 10) / 10
    }))
  };
};

const debugSceneSnapshot = (s: SceneState) => ({
  puzzleId: s.puzzleId,
  level: s.level,
  title: s.title,
  rules: s.rules.map((rule) => rule.name),
  messages: s.messages,
  graphs: s.graphs.map(debugGraphSnapshot)
});

const debugSelectionSnapshot = (selection: SelectionDescriptor) => ({
  graphId: selection.graphId,
  selectedNodeIds: [...selection.selectedNodeIds],
  polygonPoints: selection.polygon.length,
  cuts: selection.cuts.length
});

const debugRuleCandidateSnapshot = (ruleNames: string[]) => {
  const names = [...new Set(ruleNames)];
  return names.map((ruleName) => {
    try {
      return {
        ruleName,
        candidates: adapter.ruleCandidates(ruleName).map((candidate) => ({
          graphId: candidate.graphId,
          direction: candidate.direction,
          selectedNodeIds: candidate.selectedNodeIds
        }))
      };
    } catch (error) {
      return {
        ruleName,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
};

const debugTrace = (event: string, payload: Record<string, unknown>) => {
  if (!DEBUG_LEVEL_TRACE) return;
  console.log(DEBUG_LEVEL_PREFIX, event, payload);
};

const emptySelection = (): SelectionDescriptor => ({
  graphId: 'lhs',
  selectedNodeIds: [],
  polygon: [],
  cuts: [],
  cycleOrder: []
});

let currentSelection: SelectionDescriptor = emptySelection();
let expertMode = false;
let activeRuleMatches: ActiveRuleMatchSet = null;
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
let assistRunning = false;
let assistSteps: AssistStep[] = [];
let assistIndex = 0;
let assistResizeObserver: ResizeObserver | null = null;
let assistFingerFrame = 0;
let assistFingerStartedAt = 0;
let selectionFeedbackTimer = 0;
let levelOneAssistSelection: SelectionDescriptor | null = null;
let levelOneAssistRuleName = 'eM';
let levelOneAssistApplied = false;
let renderQueued = false;
let queuedRenderRefresh = false;
let debugCrossings: CrossingDiagnostic[] = [];

// Tutorial lasso tuning: decrease this if the ghost lasso catches nearby nodes,
// increase it if the lasso feels too tight around the highlighted rewrite.
const TUTORIAL_LASSO_PAD = 16;
const ASSIST_LASSO_DURATION_MS = 4800;
const SHOW_NODE_LABELS = false;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new Error(t.tutorialAborted));
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
  if (moveCountEl) moveCountEl.textContent = '0';
  moveCounter?.removeAttribute('data-shown');
  successModal.removeAttribute('data-open');
  successModal.removeAttribute('data-final');
  proofPanel.removeAttribute('data-open');
  helpPanel.removeAttribute('data-open');
  tutorialPanel.removeAttribute('data-open');
  assistWelcomePanel.removeAttribute('data-open');
  resetDemoPanel.removeAttribute('data-open');
  stopTutorial();
  stopAssist();
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

const hideSelectionFeedback = () => {
  if (selectionFeedbackTimer) window.clearTimeout(selectionFeedbackTimer);
  selectionFeedbackTimer = 0;
  selectionFeedback.removeAttribute('data-show');
};

const showSelectionFeedback = (message: string) => {
  if (tutorialRunning || assistRunning) return;
  if (selectionFeedbackTimer) window.clearTimeout(selectionFeedbackTimer);
  selectionFeedback.textContent = message;
  selectionFeedback.setAttribute('data-show', 'true');
  selectionFeedbackTimer = window.setTimeout(hideSelectionFeedback, 2600);
};

const stopAssistFinger = () => {
  if (assistFingerFrame) cancelAnimationFrame(assistFingerFrame);
  assistFingerFrame = 0;
  assistFingerStartedAt = 0;
  tutorialFinger.classList.remove('assist-finger');
  tutorialFinger.style.opacity = '';
  tutorialFinger.style.transform = 'translate(-120px, -120px)';
};

const stopAssist = () => {
  if (!assistRunning) return;
  assistRunning = false;
  document.body.classList.remove('assist-on');
  tutorialRoot.setAttribute('aria-hidden', 'true');
  tutorialRoot.removeAttribute('data-active');
  tutorialRoot.hidden = true;
  tutorialDemoLasso.classList.remove('tut-on');
  tutorialDemoLasso.removeAttribute('d');
  stopAssistFinger();
  document
    .querySelectorAll('.rule.assist-rule-pulse, .rule.tut-hot')
    .forEach((el) => el.classList.remove('assist-rule-pulse', 'tut-hot'));
  assistResizeObserver?.disconnect();
  assistResizeObserver = null;
};

const invalidateRuleDock = () => {
  renderedRulesKey = '';
};

const clearActiveRuleMatches = () => {
  activeRuleMatches = null;
  invalidateRuleDock();
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
  levelOneAssistSelection = null;
  levelOneAssistApplied = false;
  resetShellState();
  clearSelection();
  setScene(adapter.reset(puzzleId));
  render();
  maybeStartAssist();
};

const resetDemo = () => {
  resetDemoPanel.removeAttribute('data-open');
  loadPuzzle(DEFAULT_PUZZLE_ID);
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
  if (moveCountEl) moveCountEl.textContent = String(moveCount);
  moveCounter?.setAttribute('data-shown', 'true');
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
  const colors = [
    cssVar('--accent', '#3b73c4'),
    cssVar('--strand-a', '#0072b2'),
    cssVar('--strand-b', '#d55e00'),
    cssVar('--node-o', '#f0e442'),
    cssVar('--node-x', '#009e73')
  ];
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

const displayPuzzleTitle = (puzzle: PuzzleInfo) => puzzle.title.replace(new RegExp(`^${puzzle.level}:\\s*`), '');

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const highlightRocqLine = (line: string) => {
  if (/^\s*\(\*/.test(line)) return `<span class="rocq-comment">${escapeHtml(line)}</span>`;
  let out = escapeHtml(line);
  out = out.replace(/\b(Goal|Proof|Qed|transitivity|rewrite|reflexivity|mcat)\b/g, '<span class="rocq-keyword">$1</span>');
  out = out.replace(/\b(R\d+)\b/g, '<span class="rocq-rule">$1</span>');
  return out;
};

const highlightRocq = (script: string) => script.split('\n').map(highlightRocqLine).join('\n');

const currentProofText = () => scene.proofText || adapter.exportProof() || t.noProofYet;

const proofFileName = () => {
  const puzzle = puzzles.find((p) => p.id === activePuzzleId);
  const label = puzzle ? `${puzzle.level} ${displayPuzzleTitle(puzzle)}` : scene.title || 'string diagram proof';
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'string-diagram-proof';
  return `${slug}.v`;
};

const setProofShareStatus = (message: string) => {
  proofShareStatus.textContent = message;
  proofShareStatus.toggleAttribute('data-show', message.length > 0);
};

const shareProof = async () => {
  const proofText = currentProofText();
  const title = proofTitle.textContent || t.proofKicker;
  const file = new File([proofText], proofFileName(), { type: 'text/plain' });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
  };

  try {
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ title, text: t.proofShareText, files: [file] });
      setProofShareStatus(t.shareSheetOpened);
      return;
    }
    if (nav.share) {
      await nav.share({ title, text: proofText });
      setProofShareStatus(t.shareSheetOpened);
      return;
    }
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'AbortError') {
      setProofShareStatus('');
      return;
    }
  }

  try {
    await navigator.clipboard.writeText(proofText);
    setProofShareStatus(t.proofCopied);
  } catch {
    setProofShareStatus(t.shareUnavailable);
  }
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
    nextButton.textContent = hasNext ? t.nextLabel(puzzles[idx + 1].level) : t.nextLevel;
  }
  successModal.setAttribute('data-open', 'true');
  fireConfetti(!hasNext);
};

const showProof = () => {
  proofOpen = true;
  successModal.removeAttribute('data-open');
  proofPanel.setAttribute('data-open', 'true');
  const puzzle = puzzles.find((p) => p.id === activePuzzleId);
  const idx = puzzles.findIndex((p) => p.id === activePuzzleId);
  const hasNext = idx >= 0 && idx < puzzles.length - 1;
  proofTitle.textContent = t.proofFor(puzzle ? displayPuzzleTitle(puzzle) : scene.title);
  proofPrimaryAction.textContent = hasNext ? t.nextLevel : t.close;
  proofPrimaryAction.dataset.action = hasNext ? 'next-level' : 'close-proof';
  proof.innerHTML = highlightRocq(currentProofText());
  setProofShareStatus('');
};

const startTutorial = async () => {
  stopAssist();
  stopTutorial();
  tutorialRunning = true;
  tutorialAbort = new AbortController();
  const signal = tutorialAbort.signal;
  document.body.classList.add('tut-on');
  tutorialPanel.setAttribute('data-open', 'true');
  tutorialCaption.textContent = t.loadingTinyProof;
  tutorialFinger.style.transform = 'translate(-120px, -120px)';
  try {
    const demo = adapter.tutorialDemo(DEFAULT_PUZZLE_ID);
    if (!demo.ok || !demo.initialScene || !demo.selection || !demo.ruleName || !demo.result?.scene) {
      throw new Error(demo.error || t.tutorialDataIncomplete);
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
    if (!selectedLayout) throw new Error(t.tutorialSelectedGraphMissing);
    const path = lassoPathForSelection(demo.selection, panels[tutorialGraphId], selectedLayout);
    tutorialCaption.textContent = t.circleTangle;
    await fingerTo(tutorialCanvasPointToPage(path[0]), 500, signal);
    tutorialFinger.style.transition = 'none';
    const start = performance.now();
    while (true) {
      if (signal.aborted) throw new Error(t.tutorialAborted);
      const progress = clamp((performance.now() - start) / 1400, 0, 1);
      const partial = interpolateClosedPath(path, progress);
      const head = partial[partial.length - 1] ?? path[0];
      const pageHead = tutorialCanvasPointToPage(head);
      tutorialFinger.style.transform = `translate(${pageHead.x}px, ${pageHead.y}px)`;
      drawTutorial(initialLayouts, selectedSet, partial);
      if (progress >= 1) break;
      await frame();
    }
    drawTutorial(initialLayouts, selectedSet, path);
    await sleep(450, signal);
    tutorialCaption.textContent = t.pickCheckedMove;
    tutorialRuleCard.classList.add('tut-hot');
    const r = tutorialRuleCard.getBoundingClientRect();
    const p = { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
    await fingerTo(p, 850, signal);
    fireTutorialRipple(p);
    tutorialRuleCard.classList.add('tut-pressed');
    await sleep(180, signal);
    tutorialRuleCard.classList.remove('tut-pressed');
    tutorialCaption.textContent = t.watchRewrite;
    drawTutorial(resultLayouts);
    tutorialCaption.textContent = t.everyMoveChecked;
    await sleep(1800, signal);
  } catch (error) {
    if (!signal.aborted) {
      const message = error instanceof Error ? error.message : String(error);
      scene.messages = [t.tutorialCouldNotStart, message];
      render();
    }
  } finally {
    stopTutorial();
  }
};

const ensureLevelOneAssistSelection = () => {
  if (activePuzzleId !== 'clean-up-two-units') return;
  if (!levelOneAssistSelection) {
    const demo = adapter.tutorialDemo(DEFAULT_PUZZLE_ID);
    if (demo.ok && demo.selection && demo.ruleName) {
      levelOneAssistSelection = {
        ...demo.selection,
        selectedNodeIds: [...demo.selection.selectedNodeIds],
        polygon: [],
        cuts: [],
        cycleOrder: []
      };
      levelOneAssistRuleName = demo.ruleName;
    }
  }
};

const selectLevelOneAssistTangle = () => {
  ensureLevelOneAssistSelection();
  if (!levelOneAssistSelection) return;
  currentSelection = {
    ...levelOneAssistSelection,
    selectedNodeIds: [...levelOneAssistSelection.selectedNodeIds]
  };
  rules = adapter.evaluateSelection(currentSelection);
  scene.messages = [t.selectedFirstTangle(levelOneAssistRuleName)];
  invalidateRuleDock();
  render();
};

const getLevelOneAssistSelection = () => {
  if (activePuzzleId !== 'clean-up-two-units') return null;
  ensureLevelOneAssistSelection();
  return levelOneAssistSelection;
};

const applyLevelOneAssistRule = async () => {
  if (activePuzzleId !== 'clean-up-two-units' || levelOneAssistApplied) return;
  selectLevelOneAssistTangle();
  if (!levelOneAssistSelection) return;
  const selection = {
    ...levelOneAssistSelection,
    selectedNodeIds: [...levelOneAssistSelection.selectedNodeIds]
  };
  currentSelection = selection;
  const seed = seedFromCurrentLayout(selection);
  const collapseCenter = layoutCenterFromCurrentSelection(selection);
  const res = perf.time('ocaml.applyRule', () => adapter.applyRule(levelOneAssistRuleName, selection));
  if (res.ok && res.scene) {
    levelOneAssistApplied = true;
    bumpMoves();
    await animateSelectionCollapse(selection);
    clearSelection();
    await animateRewriteScene(res.scene, selection.graphId, seed, collapseCenter, new Set(selection.selectedNodeIds));
  } else {
    scene.messages = [res.error ? t.reason(res.error) : t.ruleNotApplicable(levelOneAssistRuleName)];
    render();
  }
};

const currentAssistSteps = () => {
  if (activePuzzleId === 'clean-up-two-units') return ASSIST_STEPS_LEVEL_1;
  if (activePuzzleId === 'both-sides-meet') return ASSIST_STEPS_LEVEL_3;
  if (activePuzzleId === 'three-monad-composition') return ASSIST_STEPS_LEVEL_5;
  return [];
};

const relativeRect = (rect: Rect, relative: AssistRelativeRect): Rect => ({
  x: rect.x + rect.w * relative.x,
  y: rect.y + rect.h * relative.y,
  w: rect.w * relative.w,
  h: rect.h * relative.h
});

const assistBaseRectFor = (step: AssistStep): Rect => {
  const el = document.querySelector<HTMLElement>(step.selector);
  if (!el) return { x: 0, y: 0, w: 0, h: 0 };
  const r = el.getBoundingClientRect();
  let rect = { x: r.left, y: r.top, w: r.width, h: r.height };
  if (step.focusRect === 'rhs') rect = { ...rect, x: rect.x + rect.w * 0.55, w: rect.w * 0.45 };
  if (step.focusRect === 'lhs') rect = { ...rect, w: rect.w * 0.45 };
  return rect;
};

const assistSpotlightRectFor = (step: AssistStep): Rect => {
  const rect = assistBaseRectFor(step);
  const pad = step.padding;
  return { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
};

const applyAssistMask = (rect: Rect) => {
  const attrs = {
    x: String(rect.x),
    y: String(rect.y),
    width: String(rect.w),
    height: String(rect.h)
  };
  Object.entries(attrs).forEach(([name, value]) => {
    tutorialMaskCutout.setAttribute(name, value);
    tutorialRing.setAttribute(name, value);
  });
};

const placeAssistCard = (rect: Rect, requested: AssistPlacement) => {
  const margin = 14;
  const cardW = tutorialCard.offsetWidth || 320;
  const cardH = tutorialCard.offsetHeight || 170;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const order: AssistPlacement[] = [requested, 'right', 'left', 'bottom', 'top'];
  const seen = new Set<AssistPlacement>();
  let placement = requested;
  let x = 8;
  let y = 8;
  let fits = false;

  for (const p of order) {
    if (seen.has(p)) continue;
    seen.add(p);
    let tx = 0;
    let ty = 0;
    if (p === 'right') {
      tx = rect.x + rect.w + margin;
      ty = rect.y + rect.h * 0.5 - cardH * 0.5;
    } else if (p === 'left') {
      tx = rect.x - cardW - margin;
      ty = rect.y + rect.h * 0.5 - cardH * 0.5;
    } else if (p === 'top') {
      tx = rect.x + rect.w * 0.5 - cardW * 0.5;
      ty = rect.y - cardH - margin;
    } else {
      tx = rect.x + rect.w * 0.5 - cardW * 0.5;
      ty = rect.y + rect.h + margin;
    }
    if (tx >= 8 && ty >= 8 && tx + cardW <= vw - 8 && ty + cardH <= vh - 8) {
      placement = p;
      x = tx;
      y = ty;
      fits = true;
      break;
    }
  }

  if (!fits) {
    placement = requested;
    if (placement === 'right' || placement === 'left') {
      x = placement === 'right' ? rect.x + rect.w + margin : rect.x - cardW - margin;
      y = rect.y + rect.h * 0.5 - cardH * 0.5;
    } else {
      x = rect.x + rect.w * 0.5 - cardW * 0.5;
      y = placement === 'bottom' ? rect.y + rect.h + margin : rect.y - cardH - margin;
    }
    x = clamp(x, 8, Math.max(8, vw - cardW - 8));
    y = clamp(y, 8, Math.max(8, vh - cardH - 8));
  }

  tutorialCard.dataset.placement = placement;
  tutorialCard.style.left = `${x}px`;
  tutorialCard.style.top = `${y}px`;
};

const graphPanelForPageRect = (graphId: 'lhs' | 'rhs') => {
  const canvasRect = canvas.getBoundingClientRect();
  const panels = panelsForSize(canvasRect.width, canvasRect.height);
  const panel = panels[graphId];
  return {
    canvasRect,
    panel,
    pagePanel: { x: canvasRect.left + panel.x, y: canvasRect.top + panel.y, w: panel.w, h: panel.h }
  };
};

const assistEllipseForSelection = (selection: SelectionDescriptor): Rect | null => {
  const graphId = selection.graphId === 'rhs' ? 'rhs' : 'lhs';
  const graph = layouts?.graphs.get(graphId);
  if (!graph) return null;
  const selected = new Set(selection.selectedNodeIds);
  const nodes = graph.nodes.filter((node) => selected.has(node.id) && !node.boundary);
  if (nodes.length === 0) return null;
  const { canvasRect, panel } = graphPanelForPageRect(graphId);
  const view = viewForLayout(graph, panel);
  // Match the canvas renderer: convert the selected node bounds from layout
  // space through the current graph view, then into page coordinates.
  const xs: number[] = [];
  const ys: number[] = [];
  nodes.forEach((node) => {
    const a = toScreen({ x: node.x, y: node.y }, view);
    const b = toScreen({ x: node.x + node.w, y: node.y + node.h }, view);
    xs.push(canvasRect.left + a.x, canvasRect.left + b.x);
    ys.push(canvasRect.top + a.y, canvasRect.top + b.y);
  });
  const pad = TUTORIAL_LASSO_PAD + 6;
  const x0 = Math.min(...xs) - pad;
  const x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad;
  const y1 = Math.max(...ys) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

const assistDemoRectFor = (step: AssistStep) => {
  if (step.selectionDemo === 'level-1-em') {
    const selection = getLevelOneAssistSelection();
    const rect = selection ? assistEllipseForSelection(selection) : null;
    if (rect) return rect;
  }
  const base = assistBaseRectFor(step);
  return step.lassoRect ? relativeRect(base, step.lassoRect) : base;
};

const startAssistFingerOnLasso = () => {
  stopAssistFinger();
  const total = tutorialDemoLasso.getTotalLength();
  if (!Number.isFinite(total) || total <= 0) return;
  tutorialFinger.classList.add('assist-finger');
  assistFingerStartedAt = performance.now();

  const drawStart = 0.12;
  const drawEnd = 0.46;
  const holdEnd = 0.68;
  const tick = (now: number) => {
    if (!assistRunning || !tutorialDemoLasso.classList.contains('tut-on')) return;
    const phase = ((now - assistFingerStartedAt) % ASSIST_LASSO_DURATION_MS) / ASSIST_LASSO_DURATION_MS;
    let progress = 0;
    let opacity = 0;
    if (phase >= drawStart && phase <= drawEnd) {
      progress = (phase - drawStart) / (drawEnd - drawStart);
      opacity = 1;
    } else if (phase > drawEnd && phase <= holdEnd) {
      progress = 1;
      opacity = 1;
    } else if (phase > holdEnd) {
      progress = 1;
      opacity = Math.max(0, 1 - (phase - holdEnd) / (1 - holdEnd));
    }
    const point = tutorialDemoLasso.getPointAtLength(total * clamp(progress, 0, 1));
    tutorialFinger.style.opacity = String(opacity);
    tutorialFinger.style.transform = `translate(${point.x}px, ${point.y}px)`;
    assistFingerFrame = requestAnimationFrame(tick);
  };
  assistFingerFrame = requestAnimationFrame(tick);
};

const setAssistDemo = (step: AssistStep) => {
  if (step.demo !== 'lasso') {
    tutorialDemoLasso.classList.remove('tut-on');
    tutorialDemoLasso.removeAttribute('d');
    stopAssistFinger();
    return;
  }
  const rect = assistDemoRectFor(step);
  const cx = rect.x + rect.w * 0.5;
  const cy = rect.y + rect.h * 0.5;
  const rx = rect.w * 0.5;
  const ry = rect.h * 0.5;
  const d = [
    `M ${cx - rx} ${cy}`,
    `C ${cx - rx} ${cy - ry * 0.55}, ${cx - rx * 0.52} ${cy - ry}, ${cx + rx * 0.05} ${cy - ry}`,
    `C ${cx + rx * 0.72} ${cy - ry}, ${cx + rx} ${cy - ry * 0.55}, ${cx + rx} ${cy - ry * 0.03}`,
    `C ${cx + rx} ${cy + ry * 0.67}, ${cx + rx * 0.5} ${cy + ry}, ${cx - rx * 0.08} ${cy + ry}`,
    `C ${cx - rx * 0.78} ${cy + ry}, ${cx - rx} ${cy + ry * 0.55}, ${cx - rx} ${cy} Z`
  ].join(' ');
  tutorialDemoLasso.classList.remove('tut-on');
  tutorialDemoLasso.setAttribute('d', d);
  tutorialDemoLasso.setAttribute('pathLength', '1');
  void tutorialDemoLasso.getBoundingClientRect();
  tutorialDemoLasso.classList.add('tut-on');
  startAssistFingerOnLasso();
};

const updateAssistRuleHighlight = (step: AssistStep) => {
  document
    .querySelectorAll('.rule.assist-rule-pulse, .rule.tut-hot')
    .forEach((el) => el.classList.remove('assist-rule-pulse', 'tut-hot'));
  if (step.before !== 'select-level-1') return;
  const rule = rulesContainer.querySelector<HTMLElement>(`.rule[data-rule-name="${levelOneAssistRuleName}"]`);
  if (!rule) return;
  rule.classList.add('tut-hot', 'assist-rule-pulse');
};

const paintAssistDots = () => {
  tutorialDots.replaceChildren(
    ...assistSteps.map((_, idx) => {
      const dot = document.createElement('div');
      dot.className = 'tut-dot';
      dot.toggleAttribute('data-current', idx === assistIndex);
      return dot;
    })
  );
};

const renderAssistStep = () => {
  const step = assistSteps[assistIndex];
  if (!step) {
    stopAssist();
    return;
  }
  const rect = assistSpotlightRectFor(step);
  applyAssistMask(rect);
  placeAssistCard(rect, step.placement);
  setAssistDemo(step);
  tutorialKicker.textContent = step.kicker;
  tutorialTitle.textContent = step.title;
  tutorialBody.textContent = step.body;
  tutorialNext.textContent = assistIndex === assistSteps.length - 1 ? 'Got it' : 'Next';
  paintAssistDots();
  updateAssistRuleHighlight(step);
};

const runAssistStepBefore = async (step: AssistStep) => {
  if (step.before === 'select-level-1') selectLevelOneAssistTangle();
  if (step.before === 'apply-level-1') await applyLevelOneAssistRule();
};

const nextAssistStep = async () => {
  if (!assistRunning) return;
  if (assistIndex >= assistSteps.length - 1) {
    stopAssist();
    return;
  }
  assistIndex += 1;
  await runAssistStepBefore(assistSteps[assistIndex]);
  renderAssistStep();
};

const startAssist = () => {
  stopAssist();
  assistSteps = currentAssistSteps();
  if (assistSteps.length === 0) return;
  if (tutorialRunning || proofOpen || successOpen) return;
  assistIndex = 0;
  assistRunning = true;
  document.body.classList.add('assist-on');
  tutorialRoot.hidden = false;
  tutorialRoot.setAttribute('data-active', 'true');
  tutorialRoot.setAttribute('aria-hidden', 'false');
  renderAssistStep();
  if (typeof ResizeObserver !== 'undefined') {
    assistResizeObserver = new ResizeObserver(renderAssistStep);
    assistResizeObserver.observe(document.body);
  }
};

const startAssistFromWelcome = async () => {
  assistWelcomePanel.removeAttribute('data-open');
  startAssist();
  if (assistRunning) await runAssistStepBefore(assistSteps[assistIndex]);
  renderAssistStep();
};

const maybeStartAssist = () => {
  const steps = currentAssistSteps();
  if (steps.length === 0) return;
  window.setTimeout(() => {
    if (activePuzzleId === 'clean-up-two-units' && !tutorialRunning && !proofOpen && !successOpen) {
      assistWelcomePanel.setAttribute('data-open', 'true');
    } else {
      startAssist();
    }
  }, 450);
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
    scene.messages = [t.layoutFailed, message];
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
  scene.messages = [t.collapsingRegion];
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
  const localizedNextScene = localizeScene(nextScene);
  const finalMessages = [...localizedNextScene.messages];
  debugTrace('animateRewriteScene:start', {
    graphId,
    selectedNodeIds: [...selectedNodeIds],
    collapseCenter,
    stableSeedNodeIds: [...(seed?.nodePositions?.keys() ?? [])],
    incomingScene: debugSceneSnapshot(localizedNextScene),
    layoutBefore: debugLayoutSnapshot(layouts?.graphs.get(graphId))
  });
  scene = localizedNextScene;
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
  scene.messages = [t.replayingRewrite];
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
          scene.messages = [t.replayingIteration(t.graphSide(graphId), iteration)];
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
      debugTrace('animateRewriteScene:final-layout', {
        graphId,
        finalLayout: debugLayoutSnapshot(finalLayout)
      });
    }
    scene.messages = finalMessages.length > 0 ? finalMessages : [t.rewriteReplayFinished];
  } catch (error) {
    if (epoch !== layoutEpoch) return;
    const message = error instanceof Error ? error.message : String(error);
    scene.messages = [t.rewriteAnimationFailed, message];
    void layoutScene(localizedNextScene);
  } finally {
    if (epoch === layoutEpoch) {
      debugTrace('animateRewriteScene:finish', {
        graphId,
        messages: scene.messages,
        layouts: scene.graphs.map((graph) => debugLayoutSnapshot(layouts?.graphs.get(graph.id))),
        candidates: debugRuleCandidateSnapshot(scene.rules.map((rule) => rule.name))
      });
      render();
    }
  }
};

const setScene = (nextScene: SceneState) => {
  scene = localizeScene(nextScene);
  activePuzzleId = scene.puzzleId || activePuzzleId;
  rules = disabledRulesFor(scene);
  activeRuleMatches = null;
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

const screenNodeRect = (node: LayoutNode, view: View, preview = false): Rect => {
  const center = toScreen({ x: node.x + node.w * 0.5, y: node.y + node.h * 0.5 }, view);
  const minW = node.boundary ? (preview ? 4 : 8) : (preview ? 5 : 22);
  const minH = node.boundary ? (preview ? 4 : 8) : (preview ? 5 : 18);
  const w = Math.max(minW, node.w * view.scale * (preview ? 0.78 : 1));
  const h = Math.max(minH, node.h * view.scale * (preview ? 0.78 : 1));
  return { x: center.x - w * 0.5, y: center.y - h * 0.5, w, h };
};

const drawNode = (c: CanvasRenderingContext2D, node: LayoutNode, view: View, selected: Set<string>, preview = false) => {
  const p = screenNodeRect(node, view, preview);
  const { w, h } = p;
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
  if (!preview && SHOW_NODE_LABELS) {
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
    const r = screenNodeRect(node, view);
    xs.push(r.x, r.x + r.w);
    ys.push(r.y, r.y + r.h);
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

const candidateRect = (candidate: RuleCandidate, panels: PanelMap): Rect | null => {
  const layout = layouts?.graphs.get(candidate.graphId);
  if (!layout) return null;
  const view = viewForLayout(layout, panels[candidate.graphId]);
  const selected = new Set(candidate.selectedNodeIds);
  const nodes = layout.nodes.filter((node) => selected.has(node.id) && !node.boundary);
  if (nodes.length === 0) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  nodes.forEach((node) => {
    const r = screenNodeRect(node, view);
    xs.push(r.x, r.x + r.w);
    ys.push(r.y, r.y + r.h);
  });
  const pad = 18;
  const panel = panels[candidate.graphId];
  const x0 = Math.max(panel.x + 8, Math.min(...xs) - pad);
  const x1 = Math.min(panel.x + panel.w - 8, Math.max(...xs) + pad);
  const y0 = Math.max(panel.y + 8, Math.min(...ys) - pad);
  const y1 = Math.min(panel.y + panel.h - 8, Math.max(...ys) + pad);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
};

const pickCandidateAt = (p: Point, panels: PanelMap): RuleCandidate | null => {
  if (!activeRuleMatches) return null;
  return activeRuleMatches.candidates
    .map((candidate) => ({ candidate, rect: candidateRect(candidate, panels) }))
    .filter((entry): entry is { candidate: RuleCandidate; rect: Rect } => Boolean(entry.rect && inPanel(p, entry.rect)))
    .sort((a, b) => (a.rect.w * a.rect.h) - (b.rect.w * b.rect.h))[0]?.candidate ?? null;
};

const drawCandidateHighlights = (panels: PanelMap) => {
  if (!activeRuleMatches) return;
  ctx.save();
  activeRuleMatches.candidates.forEach((candidate) => {
    const rect = candidateRect(candidate, panels);
    if (!rect) return;
    ctx.fillStyle = candidate.direction === 'forward' ? 'rgba(59, 115, 196, 0.14)' : 'rgba(111, 168, 106, 0.16)';
    ctx.strokeStyle = candidate.direction === 'forward' ? '#3b73c4' : '#5b9a55';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([7, 5]);
    roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 12);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
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
  clearActiveRuleMatches();
  if (!layouts) {
    scene.messages = [t.layoutSettling];
    return;
  }
  if (lasso.length < 3) {
    currentSelection = emptySelection();
    rules = disabledRulesFor(scene, t.selectSubDiagram);
    return;
  }
  const graphId = pickGraphFromLasso(panels);
  if (!graphId) {
    currentSelection = emptySelection();
    rules = disabledRulesFor(scene, t.selectEitherSide);
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
  debugTrace('evaluateSelection', {
    selection: debugSelectionSnapshot(currentSelection),
    selectedLabels: layout.nodes
      .filter((node) => selected.includes(node.id))
      .map((node) => ({ id: node.id, label: node.label, x: node.x, y: node.y })),
    availability: rules,
    scene: debugSceneSnapshot(scene),
    layout: debugLayoutSnapshot(layout)
  });
  if (!rules.some((r) => r.enabled)) {
    const why = rules.map((r) => `${r.name}: ${r.reason ? t.reason(r.reason) : t.notApplicable}`).join(' | ');
    scene.messages = [t.noRuleMatches(t.graphSide(graphId), selected.length), why];
    showSelectionFeedback(t.noRulesMatchFeedback);
  } else {
    scene.messages = [t.selectionSummary(t.graphSide(graphId), selected.length)];
    hideSelectionFeedback();
  }
};

const rulePreviewSvg = (rule: { lhs: LayoutGraph; rhs: LayoutGraph }, width: number, height: number, dimmed: boolean) =>
  rulePreviewSvgBase(rule, width, height, dimmed, { pinColor: cssVar('--pin', '#9aa8b8') });

const drawRulePreviewGraphs = (container: HTMLElement, rule: { lhs: LayoutGraph; rhs: LayoutGraph }, dimmed: boolean) => {
  const width = Math.max(60, Math.floor(container.clientWidth || 220));
  const height = Math.max(40, Math.floor(container.clientHeight || 92));
  container.innerHTML = rulePreviewSvg(rule, width, height, dimmed);
};

const drawRulePreview = (container: HTMLElement, name: string, dimmed: boolean) => {
  const width = Math.max(60, Math.floor(container.clientWidth || 220));
  const height = Math.max(40, Math.floor(container.clientHeight || 92));
  const rule = layouts?.rules.get(name);
  if (!rule) {
    container.innerHTML = `
      <svg class="rule-preview-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t.rulePreviewLoading}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" rx="8" fill="${dimmed ? '#f2f6fb' : '#fbfdff'}" />
        <text x="${width * 0.5}" y="${height * 0.5}" text-anchor="middle" dominant-baseline="central" fill="#8da0b3" font-family="Avenir Next, sans-serif" font-size="11" font-weight="600">${t.layoutLoading}</text>
      </svg>
    `;
    return;
  }
  drawRulePreviewGraphs(container, rule, dimmed);
};

const nodeTypeSignature = (node: SceneRule['lhs']['nodes'][number]) => [
  node.kind,
  node.nsources,
  node.ntargets,
  node.visual.shape ?? '',
  node.sourceTypes.length,
  node.targetTypes.length
].join(':');

const endpointTypeKey = (port: PortRef, nodesById: Map<string, SceneRule['lhs']['nodes'][number]>) => {
  if (port.kind === 'source' || port.kind === 'target') return port.kind;
  if (
    (port.kind === 'nodeSource' || port.kind === 'nodeTarget') &&
    typeof port.nodeId === 'string'
  ) {
    const node = nodesById.get(port.nodeId);
    return `${port.kind}:${node ? nodeTypeSignature(node) : '?'}`;
  }
  return JSON.stringify(port);
};

const ruleTypeGraphKey = (graph: SceneGraph) => {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodeParts = graph.nodes.map(nodeTypeSignature).sort();
  const edgeParts = graph.edges
    .map((edge) => `${endpointTypeKey(edge.from, nodesById)}>${endpointTypeKey(edge.to, nodesById)}`)
    .sort();
  return [
    `s=${graph.sources}`,
    `t=${graph.targets}`,
    `nodes=${nodeParts.join('|')}`,
    `edges=${edgeParts.join('|')}`
  ].join(';');
};

const canonicalRuleKey = (rule: SceneRule) => {
  const forward = `${ruleTypeGraphKey(rule.lhs)} == ${ruleTypeGraphKey(rule.rhs)}`;
  const backward = `${ruleTypeGraphKey(rule.rhs)} == ${ruleTypeGraphKey(rule.lhs)}`;
  return forward < backward ? forward : backward;
};

const ruleFamilyLabel = (ruleNames: string[]) => {
  if (ruleNames.length > 0 && ruleNames.every((name) => ['mA', 'nA', 'mm', 'nn', 'oo'].includes(name))) {
    return 'Fork reassociation';
  }
  if (
    ruleNames.length > 0 &&
    ruleNames.every((name) => ['mx', 'nx', 'ny', 'oy', 'mz', 'oz'].includes(name))
  ) {
    return 'Push fork through crossing';
  }
  return null;
};

const simpleRuleLabel = (ruleNames: string[]) => {
  const familyLabel = ruleFamilyLabel(ruleNames);
  if (familyLabel) return familyLabel;
  if (ruleNames.length <= 2) return ruleNames.join('/');
  return `${ruleNames[0]} +${ruleNames.length - 1}`;
};

const ruleDisplayItems = (): RuleDisplayItem[] => {
  if (expertMode) {
    return scene.rules.map((rule) => ({
      key: `rule:${rule.name}`,
      label: rule.name,
      representativeName: rule.name,
      ruleNames: [rule.name],
      rules: [rule]
    }));
  }
  const groups = new Map<string, SceneRule[]>();
  scene.rules.forEach((rule) => {
    const key = canonicalRuleKey(rule);
    const bucket = groups.get(key) ?? [];
    bucket.push(rule);
    groups.set(key, bucket);
  });
  return Array.from(groups.entries()).map(([key, group]) => {
    const ruleNames = group.map((rule) => rule.name);
    return {
      key: `group:${key}`,
      label: simpleRuleLabel(ruleNames),
      representativeName: ruleNames[0],
      ruleNames,
      rules: group
    };
  });
};

const renderLevelButtons = () => {
  const key = `${activePuzzleId}|${puzzles.map((p) => `${p.id}:${p.level}:${p.title}`).join(',')}`;
  if (key === renderedLevelsKey) return;
  renderedLevelsKey = key;
  const labelFor = (puzzle: PuzzleInfo) => `${puzzle.level}: ${displayPuzzleTitle(puzzle)}`;
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

const updateRuleScrollState = () => {
  const overflow = rulesContainer.scrollWidth > rulesContainer.clientWidth + 2;
  const maxScroll = Math.max(0, rulesContainer.scrollWidth - rulesContainer.clientWidth);
  const atStart = rulesContainer.scrollLeft <= 2;
  const atEnd = rulesContainer.scrollLeft >= maxScroll - 2;
  rulesShell.dataset.overflow = String(overflow);
  rulesShell.dataset.atStart = String(!overflow || atStart);
  rulesShell.dataset.atEnd = String(!overflow || atEnd);
  if (!overflow) rulesShell.removeAttribute('data-scrolled');
};

const refreshUi = () => {
  const lastMessage = scene.messages[0] || scene.subtitle || t.lassoPrompt;
  const hasSelection = currentSelection.selectedNodeIds.length > 0;
  const hasManualSelection = expertMode && hasSelection;
  const hasEnabledRule = rules.some((r) => r.enabled);
  const displayItems = ruleDisplayItems();
  subtitle.textContent = activeRuleMatches
    ? `${activeRuleMatches.candidates.length} matching region${activeRuleMatches.candidates.length === 1 ? '' : 's'} for ${activeRuleMatches.label}.`
    : hasManualSelection && hasEnabledRule
    ? t.selectedPiecesPrompt(currentSelection.selectedNodeIds.length)
    : lastMessage;
  if (proofOpen) proof.innerHTML = highlightRocq(currentProofText());
  renderLevelButtons();
  expertToggle.setAttribute('aria-pressed', String(expertMode));
  expertToggle.dataset.active = String(expertMode);
  rulesContainer.dataset.selection = String(hasManualSelection);
  const ruleKey = [
    activePuzzleId,
    layouts ? 'ready' : 'pending',
    expertMode ? 'expert' : 'rule-first',
    activeRuleMatches ? `${activeRuleMatches.key}:${activeRuleMatches.candidates.length}` : 'no-active-rule',
    scene.rules.map((r) => r.name).join(','),
    displayItems.map((item) => `${item.key}:${item.label}:${item.ruleNames.join('+')}`).join(','),
    rules.map((r) => `${r.name}:${r.enabled ? 1 : 0}:${r.reason ?? ''}`).join(',')
  ].join('|');
  if (ruleKey === renderedRulesKey) {
    requestAnimationFrame(updateRuleScrollState);
    return;
  }
  renderedRulesKey = ruleKey;
  if (!hasSelection) rulesShell.removeAttribute('data-scrolled');
  rulesContainer.replaceChildren(
    ...displayItems.map((item, idx) => {
      const availabilities = item.ruleNames.map((name) => rules.find((r) => r.name === name) ?? { name, enabled: false, reason: t.unavailable });
      const manuallyApplicable = hasManualSelection && availabilities.some((ra) => ra.enabled);
      const dimmed = hasManualSelection && !manuallyApplicable;
      const disabled = !layouts || (hasManualSelection && !manuallyApplicable);
      const active = activeRuleMatches?.key === item.key;
      const btn = document.createElement('button');
      btn.className = 'rule';
      btn.dataset.dimmed = String(dimmed);
      btn.dataset.active = String(active);
      btn.type = 'button';
      btn.dataset.action = 'rule';
      btn.dataset.ruleName = item.representativeName;
      btn.dataset.ruleNames = item.ruleNames.join('\n');
      btn.dataset.ruleGroupKey = item.key;
      btn.dataset.ruleLabel = item.label;
      btn.dataset.ruleKey = `R${idx + 1}`;
      btn.disabled = disabled;
      btn.title = manuallyApplicable
        ? t.applyRule(item.label)
        : active
          ? `${activeRuleMatches?.candidates.length ?? 0} matching regions`
          : layouts
            ? `Find matching regions for ${item.label}`
            : t.layoutLoading;
      btn.innerHTML = `
        <div class="rule-meta"><span class="rule-badge">R${idx + 1}</span><span class="rule-name"></span></div>
        <div class="rule-preview" aria-hidden="true"></div>
      `;
      const nameEl = btn.querySelector<HTMLElement>('.rule-name');
      if (nameEl) nameEl.textContent = item.label;
      const pv = btn.querySelector<HTMLElement>('.rule-preview');
      if (pv) drawRulePreview(pv, item.representativeName, dimmed);
      return btn;
    })
  );
  setTimeout(() => {
    rulesContainer.querySelectorAll<HTMLElement>('.rule-preview').forEach((pv) => {
      if (pv.clientHeight > 0) {
        const btn = pv.closest<HTMLElement>('button.rule');
        const name = btn?.dataset.ruleName;
        const dimmed = btn?.dataset.dimmed === 'true';
        if (name) drawRulePreview(pv, name, dimmed);
      }
    });
    updateRuleScrollState();
  }, 0);
  requestAnimationFrame(updateRuleScrollState);
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
  const lhsView = lhs ? viewForLayout(lhs, panels.lhs) : undefined;
  const rhsView = rhs ? viewForLayout(rhs, panels.rhs) : undefined;
  if (lhs && lhsView) drawLayoutGraph(lhs, panels.lhs, selectedLhs, lhsView);
  else drawPendingGraph(panels.lhs);
  if (rhs && rhsView) drawLayoutGraph(rhs, panels.rhs, selectedRhs, rhsView);
  else drawPendingGraph(panels.rhs);
  drawCandidateHighlights(panels);
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
  hideSelectionFeedback();
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
    rules = disabledRulesFor(scene, t.selectSubDiagram);
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
  rules = disabledRulesFor(scene, t.selectSubDiagram);
  clearActiveRuleMatches();
  hideSelectionFeedback();
};

const clearManualSelection = () => {
  lasso = [];
  currentSelection = emptySelection();
  rules = disabledRulesFor(scene, t.selectSubDiagram);
};

const selectionFromCandidate = (candidate: RuleCandidate): SelectionDescriptor => ({
  graphId: candidate.graphId,
  selectedNodeIds: [...candidate.selectedNodeIds],
  polygon: [],
  cuts: [],
  cycleOrder: []
});

const applyRuleToSelection = async (name: string, selection: SelectionDescriptor) => {
  const seed = seedFromCurrentLayout(selection);
  const collapseCenter = layoutCenterFromCurrentSelection(selection);
  debugTrace('applyRuleToSelection:start', {
    ruleName: name,
    selection: debugSelectionSnapshot(selection),
    sceneBefore: debugSceneSnapshot(scene),
    candidatesBefore: debugRuleCandidateSnapshot(scene.rules.map((rule) => rule.name)),
    layoutBefore: debugLayoutSnapshot(layouts?.graphs.get(selection.graphId)),
    seedNodeIds: [...(seed?.nodePositions?.keys() ?? [])],
    collapseCenter
  });
  const res = perf.time('ocaml.applyRule', () => adapter.applyRule(name, selection));
  debugTrace('applyRuleToSelection:result', {
    ruleName: name,
    ok: res.ok,
    error: res.error,
    proofDelta: res.proofDelta,
    sceneAfter: res.scene ? debugSceneSnapshot(res.scene) : null,
    candidatesAfter: res.scene ? debugRuleCandidateSnapshot(res.scene.rules.map((rule) => rule.name)) : []
  });
  if (res.ok && res.scene) {
    bumpMoves();
    const solved = res.scene.messages.some((m) => m.includes('You just made a proof'));
    await animateSelectionCollapse(selection);
    clearSelection();
    await animateRewriteScene(res.scene, selection.graphId, seed, collapseCenter, new Set(selection.selectedNodeIds));
    debugTrace('applyRuleToSelection:after-animation', {
      ruleName: name,
      selection: debugSelectionSnapshot(selection),
      sceneAfterAnimation: debugSceneSnapshot(scene),
      candidatesAfterAnimation: debugRuleCandidateSnapshot(scene.rules.map((rule) => rule.name)),
      layoutAfter: debugLayoutSnapshot(layouts?.graphs.get(selection.graphId))
    });
    if (solved) showSuccess();
  } else {
    scene.messages = [res.error ? t.reason(res.error) : t.ruleNotApplicable(name)];
    render();
  }
};

const activateRuleCandidates = (item: { key: string; label: string; ruleNames: string[] }) => {
  if (!layouts) {
    scene.messages = [t.layoutSettling];
    render();
    return;
  }
  clearManualSelection();
  debugTrace('activateRuleCandidates:start', {
    item,
    scene: debugSceneSnapshot(scene),
    rawCandidates: debugRuleCandidateSnapshot(item.ruleNames),
    layouts: scene.graphs.map((graph) => debugLayoutSnapshot(layouts?.graphs.get(graph.id)))
  });
  const candidates = perf.time('ocaml.ruleCandidates', () => {
    const seen = new Set<string>();
    return item.ruleNames.flatMap((ruleName) =>
      adapter.ruleCandidates(ruleName).filter((candidate) => {
        const key = candidateKey(candidate);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    );
  });
  debugTrace('activateRuleCandidates:deduped', {
    item,
    candidates: candidates.map((candidate) => ({
      ruleName: candidate.ruleName,
      graphId: candidate.graphId,
      direction: candidate.direction,
      selectedNodeIds: candidate.selectedNodeIds
    }))
  });
  if (candidates.length === 0) {
    activeRuleMatches = null;
    scene.messages = [`${item.label} is not applicable here.`];
    showSelectionFeedback(t.noRulesMatchFeedback);
  } else {
    activeRuleMatches = { key: item.key, label: item.label, ruleNames: item.ruleNames, candidates };
    scene.messages = [`${candidates.length} matching region${candidates.length === 1 ? '' : 's'} for ${item.label}.`];
    hideSelectionFeedback();
  }
  invalidateRuleDock();
  render();
};

const applyCandidate = async (candidate: RuleCandidate) => {
  if (!activeRuleMatches) return;
  await applyRuleToSelection(candidate.ruleName, selectionFromCandidate(candidate));
};

const candidateKey = (candidate: RuleCandidate) =>
  `${candidate.ruleName}|${candidate.graphId}|${candidate.direction}|${[...candidate.selectedNodeIds].sort().join(',')}`;

const ruleNamesFromButton = (btn: HTMLButtonElement) =>
  (btn.dataset.ruleNames ?? btn.dataset.ruleName ?? '')
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);

const applyRuleFromButton = async (btn: HTMLButtonElement) => {
  const ruleNames = ruleNamesFromButton(btn);
  const name = ruleNames[0] ?? '';
  if (!name || btn.disabled) return;
  if (expertMode && currentSelection.selectedNodeIds.length > 0) {
    const selection = { ...currentSelection, selectedNodeIds: [...currentSelection.selectedNodeIds] };
    await applyRuleToSelection(name, selection);
    return;
  }
  activateRuleCandidates({
    key: btn.dataset.ruleGroupKey ?? `rule:${name}`,
    label: btn.dataset.ruleLabel ?? name,
    ruleNames
  });
};

if (typeof (window as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent !== 'undefined') {
  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPoint(e.clientX, e.clientY);
    if (!expertMode) {
      const rect = canvas.getBoundingClientRect();
      const panels = panelsForSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
      const candidate = pickCandidateAt(p, panels);
      if (candidate) void applyCandidate(candidate);
      return;
    }
    startDrag(p);
  });
  canvas.addEventListener('pointermove', (e: PointerEvent) => moveDrag(canvasPoint(e.clientX, e.clientY)));
  canvas.addEventListener('pointerup', (e: PointerEvent) => finishDrag(canvasPoint(e.clientX, e.clientY)));
  canvas.addEventListener('pointercancel', cancelDrag);
} else {
  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    const p = canvasPoint(e.clientX, e.clientY);
    if (!expertMode) {
      const rect = canvas.getBoundingClientRect();
      const panels = panelsForSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
      const candidate = pickCandidateAt(p, panels);
      if (candidate) void applyCandidate(candidate);
      return;
    }
    startDrag(p);
  });
  window.addEventListener('mousemove', (e: MouseEvent) => moveDrag(canvasPoint(e.clientX, e.clientY)));
  window.addEventListener('mouseup', (e: MouseEvent) => finishDrag(canvasPoint(e.clientX, e.clientY)));
  canvas.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (e.touches.length < 1) return;
      const t = e.touches[0];
      const p = canvasPoint(t.clientX, t.clientY);
      if (!expertMode) {
        const rect = canvas.getBoundingClientRect();
        const panels = panelsForSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
        const candidate = pickCandidateAt(p, panels);
        if (candidate) void applyCandidate(candidate);
        e.preventDefault();
        return;
      }
      startDrag(p);
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
      perfOutput.textContent = `${formatPerfRows()}\n\n${t.copiedJson}`;
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
  } else if (action === 'expert-toggle') {
    expertMode = !expertMode;
    if (!expertMode) clearManualSelection();
    else clearActiveRuleMatches();
    hideSelectionFeedback();
    render();
  } else if (action === 'rule' && actionEl instanceof HTMLButtonElement) {
    applyRuleFromButton(actionEl);
  } else if (action === 'see-proof') {
    showProof();
  } else if (action === 'share-proof') {
    void shareProof();
  } else if (action === 'close-proof') {
    proofOpen = false;
    proofPanel.removeAttribute('data-open');
  } else if (action === 'help') {
    void startTutorial();
  } else if (action === 'close-tutorial') {
    stopTutorial();
  } else if (action === 'assist-next') {
    void nextAssistStep();
  } else if (action === 'assist-skip') {
    stopAssist();
  } else if (action === 'assist-start') {
    void startAssistFromWelcome();
  } else if (action === 'reset-demo') {
    resetDemoPanel.setAttribute('data-open', 'true');
  } else if (action === 'cancel-reset-demo') {
    resetDemoPanel.removeAttribute('data-open');
  } else if (action === 'confirm-reset-demo') {
    resetDemo();
  } else if (action === 'close-help') {
    helpPanel.removeAttribute('data-open');
  }
});

document.addEventListener('pointerdown', (e) => {
  if (!assistRunning) return;
  const target = e.target as Element | null;
  if (target?.closest('.tut-card')) return;
  if (target?.closest('[data-action="help"]')) return;
  void nextAssistStep();
}, true);

document.addEventListener('keydown', (e) => {
  if (tutorialRunning && e.key === 'Escape') stopTutorial();
  if (!assistRunning) return;
  if (e.key === 'Escape') stopAssist();
  if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    void nextAssistStep();
  }
}, true);

levelActions.addEventListener('change', () => {
  loadPuzzle(levelActions.value || DEFAULT_PUZZLE_ID);
});

localeActions.addEventListener('change', () => {
  const nextLocale = localeActions.value;
  if (nextLocale === 'en' || nextLocale === 'de') switchLocale(nextLocale);
});

rulesContainer.addEventListener(
  'scroll',
  () => {
    if (rulesContainer.scrollLeft > 8) rulesShell.dataset.scrolled = 'true';
    updateRuleScrollState();
  },
  { passive: true }
);

window.addEventListener('resize', () => requestAnimationFrame(updateRuleScrollState));

if (typeof (window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => requestRender('resize', false));
  ro.observe(canvas);
} else {
  window.addEventListener('resize', () => requestRender('resize', false));
}

void layoutScene(scene);
maybeStartAssist();

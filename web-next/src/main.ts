import './style.css';
import { OcamlAdapter } from './engine/ocamlAdapter';
import { type LayoutGraph, type LayoutNode, type LayoutPoint } from './layout/layoutTypes';
import { animateSceneGraphLayout, layoutSceneGraph, type LayoutSeed } from './layout/physicsLayout';
import type { PuzzleInfo, RuleAvailability, RuleCandidate, SceneState, SelectionDescriptor } from './model/interop';
import { perf } from './perf';
import {
  type Point,
  type Rect,
  type View,
  toScreen,
} from './diagramSvg';
import { getInitialLocale, localizePuzzle, localizePuzzles, storeLocale, supportedLocales, switchLocale, translations, type Locale } from './i18n';
import {
  BONUS_PUZZLE_ID,
  DEFAULT_PUZZLE_ID,
  GUIDED_REWRITE_PUZZLE_IDS,
  createAssistStepSets,
  createEasyRuleSlots,
  type ActiveRuleMatchSet,
  type AssistPlacement,
  type AssistRelativeRect,
  type AssistStep,
  type CrossingDiagnostic,
  type EasyRuleSlot,
  type InteractionMode,
  type LayoutState,
  type PanelMap,
  type RuleDisplayItem
} from './app/config';
import { createPerfPanel } from './app/perfPanel';
import {
  displayPuzzleTitle,
  highlightRocq,
  proofFileName as makeProofFileName,
  renderProofPanel,
  setProofShareStatus as updateProofShareStatus,
  shareProofText
} from './app/proof';
import {
  hasMainNextPuzzle as hasMainNextPuzzleFor,
  isBonusPuzzle as isBonusPuzzleId,
  isOfficialFinalPuzzle as isOfficialFinalPuzzleId,
  nextPuzzleId as nextPuzzleIdFor,
  puzzleIntroduced as puzzleIntroducedFor
} from './app/puzzles';
import { fireConfetti } from './app/confetti';
import {
  candidateHitsAt as easyCandidateHitsAt,
  candidateRect as easyCandidateRect,
  ruleDisplayItems as easyRuleDisplayItems,
  selectionFromCandidate,
  uniqueRuleCandidates
} from './app/easyMatching';
import { queryAppDom } from './app/dom';
import {
  initialInteractionMode,
  storeInteractionMode as persistInteractionMode,
  syncModeControls as syncInteractionModeControls
} from './app/interactionMode';
import { renderSuccessModal } from './app/successModal';
import { createSelectionFeedback } from './app/selectionFeedback';
import { createMoveCounter } from './app/moveCounter';
import { createRuleDock } from './app/ruleDock';
const locale: Locale = getInitialLocale();
const t = translations[locale];
const EASY_RULE_SLOTS: EasyRuleSlot[] = createEasyRuleSlots(t);
const ASSIST_STEPS = createAssistStepSets(t);

storeLocale(locale);
document.documentElement.lang = locale;
document.title = t.appTitle;

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
const easyModeLabel = locale === 'de' ? 'Einfach' : 'Easy';
const easyModeDescription = locale === 'de' ? 'Regel wählen, dann markierte Stelle antippen' : 'Pick a rule, then tap a highlighted region';

app.innerHTML = `
  <header class="topbar">
    <div class="tb-left">
      <div class="tb-status" id="subtitle">
        <span class="dot"></span>
        <span id="subtitle-text"></span>
      </div>
      <div class="seg">
        <button class="btn icon-btn" data-action="reset" aria-label="${t.reset}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
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
          <button class="more-link" data-action="credits" type="button">${t.credits}</button>
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
        <div class="modal-body" id="success-final-body">
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
        <div class="welcome-controls" aria-label="${t.chooseMode}">
          <div class="welcome-control">
            <div class="welcome-label">${t.modeLabel}</div>
            <div class="mode-choice" role="group" aria-label="${t.chooseMode}">
              <button class="mode-choice-btn" data-action="welcome-mode" data-mode="easy" type="button">
                <span>${easyModeLabel}</span>
                <small>${easyModeDescription}</small>
              </button>
              <button class="mode-choice-btn" data-action="welcome-mode" data-mode="expert" type="button">
                <span>${expertModeLabel}</span>
                <small>${expertModeDescription}</small>
              </button>
            </div>
          </div>
          <label class="welcome-control welcome-language">
            <span class="welcome-label">${t.languageLabel}</span>
            <span class="welcome-select">
              <select id="welcome-locale-actions" aria-label="${t.chooseLanguage}">
                ${supportedLocales.map((value) => `<option value="${value}"${value === locale ? ' selected' : ''}>${translations[value].languageName}</option>`).join('')}
              </select>
            </span>
          </label>
        </div>
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
    <div id="credits-panel" role="dialog" aria-modal="true" aria-labelledby="credits-title">
      <div class="modal reset-demo-card">
        <div class="modal-title" id="credits-title">${t.creditsTitle}</div>
        <div class="modal-body">${t.creditsBodyHtml}</div>
        <div class="modal-actions">
          <button class="btn btn--primary" data-action="close-credits">${t.close}</button>
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

const {
  canvas,
  subtitle,
  proof,
  proofTitle,
  proofShareStatus,
  proofPrimaryAction,
  moveCountEl,
  moveCounter,
  successModal,
  successFinalBody,
  proofPanel,
  helpPanel,
  tutorialPanel,
  assistWelcomePanel,
  resetDemoPanel,
  creditsPanel,
  tutorialCanvas,
  tutorialRuleCard,
  tutorialRulePreview,
  tutorialRoot,
  tutorialMaskCutout,
  tutorialRing,
  tutorialDemoLasso,
  tutorialCard,
  tutorialKicker,
  tutorialTitle,
  tutorialBody,
  tutorialDots,
  tutorialNext,
  confettiCanvas,
  tutorialCaption,
  selectionFeedback,
  tutorialFinger,
  tutorialRipple,
  perfPanel,
  perfOutput,
  levelActions,
  localeActions,
  welcomeLocaleActions,
  rulesShell,
  rulesContainer,
  expertToggle,
  moreMenu,
  ctx,
  tutorialCtx
} = queryAppDom();

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
let sceneRevision = 0;
let activePuzzleId = scene.puzzleId || DEFAULT_PUZZLE_ID;
const disabledRulesFor = (s: SceneState, reason = t.reason('No selection')): RuleAvailability[] =>
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
let expertMode = initialInteractionMode() === 'expert';
let activeRuleMatches: ActiveRuleMatchSet = null;
let ambiguousRuleMatches: ActiveRuleMatchSet = null;
let lasso: Point[] = [];
let dragging = false;
let zoom = 1;
let proofOpen = false;
let successOpen = false;
let renderedLevelsKey = '';
let layoutStopRequested = false;
let tutorialRunning = false;
let tutorialAbort: AbortController | null = null;
let assistRunning = false;
let assistSteps: AssistStep[] = [];
let assistIndex = 0;
let assistResizeObserver: ResizeObserver | null = null;
let assistFingerFrame = 0;
let assistFingerStartedAt = 0;
let levelOneAssistSelection: SelectionDescriptor | null = null;
let levelOneAssistRuleName = 'mA';
let levelOneAssistApplied = false;
let renderQueued = false;
let queuedRenderRefresh = false;
let debugCrossings: CrossingDiagnostic[] = [];

// Tutorial lasso tuning: decrease this if the ghost lasso catches nearby nodes,
// increase it if the lasso feels too tight around the highlighted rewrite.
const TUTORIAL_LASSO_PAD = 16;
const ASSIST_LASSO_DURATION_MS = 4800;
const SHOW_NODE_LABELS = false;

const interactionMode = (): InteractionMode => (expertMode ? 'expert' : 'easy');

const storeInteractionMode = () => {
  persistInteractionMode(interactionMode());
};

const syncModeControls = () => {
  syncInteractionModeControls({ expertToggle, mode: interactionMode() });
};

const setExpertMode = (nextExpertMode: boolean) => {
  expertMode = nextExpertMode;
  storeInteractionMode();
  if (!expertMode) clearManualSelection();
  clearActiveRuleMatches();
  invalidateRuleDock();
  syncModeControls();
  render();
};

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

const moveCounterController = createMoveCounter({ count: moveCountEl, counter: moveCounter });
const bumpMoves = moveCounterController.bump;
const ruleDock = createRuleDock({
  container: rulesContainer,
  shell: rulesShell,
  cssVar,
  renderRule: (formula) => adapter.renderRule(formula),
  ruleCandidates: (ruleName) => adapter.ruleCandidates(ruleName),
  t
});

const resetShellState = () => {
  proofOpen = false;
  successOpen = false;
  moveCounterController.reset();
  successModal.removeAttribute('data-open');
  successModal.removeAttribute('data-final');
  proofPanel.removeAttribute('data-open');
  helpPanel.removeAttribute('data-open');
  tutorialPanel.removeAttribute('data-open');
  assistWelcomePanel.removeAttribute('data-open');
  resetDemoPanel.removeAttribute('data-open');
  creditsPanel.removeAttribute('data-open');
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

const selectionFeedbackController = createSelectionFeedback({
  element: selectionFeedback,
  isSuppressed: () => tutorialRunning || assistRunning
});

const hideSelectionFeedback = selectionFeedbackController.hide;
const showSelectionFeedback = selectionFeedbackController.show;

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
  ruleDock.invalidate();
};

const invalidateEasyCandidateCounts = () => {
  ruleDock.invalidateCandidateCounts();
};

const clearActiveRuleMatches = () => {
  activeRuleMatches = null;
  ambiguousRuleMatches = null;
  invalidateRuleDock();
};

const nextPuzzleId = () => nextPuzzleIdFor(puzzles, activePuzzleId);

const puzzleIntroduced = (puzzleId: string) => puzzleIntroducedFor(puzzles, activePuzzleId, puzzleId);

const hasMainNextPuzzle = () => hasMainNextPuzzleFor(puzzles, activePuzzleId);

const isOfficialFinalPuzzle = () => isOfficialFinalPuzzleId(activePuzzleId);

const isBonusPuzzle = () => isBonusPuzzleId(activePuzzleId);

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

const perfPanelController = createPerfPanel({
  panel: perfPanel,
  output: perfOutput,
  getCrossings: () => debugCrossings,
  t
});

if (perf.enabled) perfPanelController.show();

const currentProofText = () => scene.proofText || adapter.exportProof() || t.noProofYet;

const proofFileName = () => {
  const puzzle = puzzles.find((p) => p.id === activePuzzleId);
  return makeProofFileName(puzzle, scene.title);
};

const setProofShareStatus = (message: string) => {
  updateProofShareStatus(proofShareStatus, message);
};

const shareProof = async () => {
  const proofText = currentProofText();
  const title = proofTitle.textContent || t.proofKicker;
  setProofShareStatus(await shareProofText({ proofText, title, fileName: proofFileName(), t }));
};

const showSuccess = () => {
  if (successOpen) return;
  successOpen = true;
  const idx = puzzles.findIndex((p) => p.id === activePuzzleId);
  const hasNext = hasMainNextPuzzle();
  renderSuccessModal({
    successModal,
    successFinalBody,
    hasNext,
    nextLabel: hasNext ? t.nextLabel(puzzles[idx + 1].level) : t.nextLevel,
    finalBodyHtml: t.finalSuccessBody,
    bonusBodyHtml: t.bonusSuccessBody,
    isBonus: isBonusPuzzle()
  });
  fireConfetti({ canvas: confettiCanvas, host: successModal, finale: !hasNext || isBonusPuzzle(), cssVar });
};

const showProof = () => {
  proofOpen = true;
  const puzzle = puzzles.find((p) => p.id === activePuzzleId);
  const hasNext = hasMainNextPuzzle();
  renderProofPanel({
    proofPanel,
    successModal,
    proofTitle,
    proofPrimaryAction,
    proof,
    proofShareStatus,
    title: t.proofFor(puzzle ? displayPuzzleTitle(puzzle) : scene.title),
    primaryLabel: isOfficialFinalPuzzle() ? t.bonusLevel : hasNext ? t.nextLevel : t.close,
    primaryAction: isOfficialFinalPuzzle() ? 'bonus-level' : hasNext ? 'next-level' : 'close-proof',
    proofText: currentProofText()
  });
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
      ruleDock.drawPreviewGraphs(tutorialRulePreview, previewLayouts, false, expertMode);
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
  if (!GUIDED_REWRITE_PUZZLE_IDS.has(activePuzzleId)) return;
  if (!levelOneAssistSelection) {
    const demo = adapter.tutorialDemo(activePuzzleId);
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
  if (!GUIDED_REWRITE_PUZZLE_IDS.has(activePuzzleId)) return null;
  ensureLevelOneAssistSelection();
  return levelOneAssistSelection;
};

const applyLevelOneAssistRule = async () => {
  if (!GUIDED_REWRITE_PUZZLE_IDS.has(activePuzzleId) || levelOneAssistApplied) return;
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

const levelOneRuleItem = () =>
  ruleDisplayItems().find((item) => item.ruleNames.includes(levelOneAssistRuleName));

const activateLevelOneAssistRule = () => {
  const item = levelOneRuleItem();
  if (!item) return;
  activateRuleCandidates(item);
};

const levelOneEasyCandidate = () => {
  activateLevelOneAssistRule();
  return activeRuleMatches?.candidates.find((candidate) =>
    candidate.graphId === 'lhs' && candidate.direction === 'forward'
  ) ?? activeRuleMatches?.candidates[0] ?? null;
};

const applyLevelOneEasyCandidate = async () => {
  if (!GUIDED_REWRITE_PUZZLE_IDS.has(activePuzzleId) || levelOneAssistApplied) return;
  const candidate = levelOneEasyCandidate();
  if (!candidate) return;
  levelOneAssistApplied = true;
  await applyRuleToSelection(candidate.ruleName, selectionFromCandidate(candidate));
};

const currentAssistSteps = () => {
  if (GUIDED_REWRITE_PUZZLE_IDS.has(activePuzzleId)) {
    return expertMode ? ASSIST_STEPS.level1Expert : ASSIST_STEPS.level1Easy;
  }
  if (activePuzzleId === 'clean-up-two-units' && !expertMode) return ASSIST_STEPS.level2Easy;
  if (activePuzzleId === 'both-sides-meet') return expertMode ? ASSIST_STEPS.level3Expert : ASSIST_STEPS.level3Easy;
  if (activePuzzleId === 'three-monad-composition') return expertMode ? ASSIST_STEPS.level5Expert : ASSIST_STEPS.level5Easy;
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
  if (step.before !== 'select-level-1' && step.pulse !== 'level-1-rule' && !step.pulseRuleName) return;
  if (step.before === 'select-level-1' || step.pulse === 'level-1-rule') ensureLevelOneAssistSelection();
  const ruleName = step.pulseRuleName ?? levelOneAssistRuleName;
  const rule = rulesContainer.querySelector<HTMLElement>(
    `.rule[data-rule-name="${ruleName}"], .rule[data-rule-names~="${ruleName}"]`
  );
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
  tutorialNext.textContent = assistIndex === assistSteps.length - 1 ? t.gotIt : t.next;
  paintAssistDots();
  updateAssistRuleHighlight(step);
};

const runAssistStepBefore = async (step: AssistStep) => {
  if (step.before === 'select-level-1') selectLevelOneAssistTangle();
  if (step.before === 'apply-level-1') await applyLevelOneAssistRule();
  if (step.before === 'activate-level-1-rule') activateLevelOneAssistRule();
  if (step.before === 'apply-level-1-candidate') await applyLevelOneEasyCandidate();
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
    if (activePuzzleId === DEFAULT_PUZZLE_ID && !tutorialRunning && !proofOpen && !successOpen) {
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
  scene = localizedNextScene;
  sceneRevision += 1;
  activePuzzleId = scene.puzzleId || activePuzzleId;
  rules = disabledRulesFor(scene);
  invalidateEasyCandidateCounts();
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
    }
    scene.messages = finalMessages.length > 0 ? finalMessages : [t.rewriteReplayFinished];
  } catch (error) {
    if (epoch !== layoutEpoch) return;
    const message = error instanceof Error ? error.message : String(error);
    scene.messages = [t.rewriteAnimationFailed, message];
    void layoutScene(localizedNextScene);
  } finally {
    if (epoch === layoutEpoch) {
      render();
    }
  }
};

const setScene = (nextScene: SceneState) => {
  scene = localizeScene(nextScene);
  sceneRevision += 1;
  activePuzzleId = scene.puzzleId || activePuzzleId;
  rules = disabledRulesFor(scene);
  activeRuleMatches = null;
  ambiguousRuleMatches = null;
  invalidateEasyCandidateCounts();
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

const candidateRect = (candidate: RuleCandidate, panels: PanelMap): Rect | null =>
  layouts
    ? easyCandidateRect({
        candidate,
        panels,
        layouts: layouts.graphs,
        viewForLayout,
        screenNodeRect
      })
    : null;

const candidateHitsAt = (p: Point, panels: PanelMap, candidates: RuleCandidate[]) =>
  layouts
    ? easyCandidateHitsAt({
        point: p,
        panels,
        candidates,
        layouts: layouts.graphs,
        viewForLayout,
        screenNodeRect,
        inPanel
      })
    : [];

const setAmbiguousRuleMatches = (candidates: RuleCandidate[]) => {
  if (!activeRuleMatches) return;
  ambiguousRuleMatches = {
    ...activeRuleMatches,
    candidates
  };
  scene.messages = [t.ambiguousRuleCandidates];
  showSelectionFeedback(t.ambiguousRuleCandidatesFeedback);
};

const clearAmbiguousRuleMatches = () => {
  if (!ambiguousRuleMatches) return;
  ambiguousRuleMatches = null;
  if (activeRuleMatches) scene.messages = [t.matchingRegionsForRule(activeRuleMatches.candidates.length, activeRuleMatches.label)];
  hideSelectionFeedback();
};

const rectIntersection = (a: Rect, b: Rect): Rect | null => {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
};

const subtractRect = (base: Rect, cut: Rect): Rect[] => {
  const overlap = rectIntersection(base, cut);
  if (!overlap) return [base];
  const pieces: Rect[] = [];
  const baseRight = base.x + base.w;
  const baseBottom = base.y + base.h;
  const overlapRight = overlap.x + overlap.w;
  const overlapBottom = overlap.y + overlap.h;
  if (overlap.y > base.y) pieces.push({ x: base.x, y: base.y, w: base.w, h: overlap.y - base.y });
  if (overlapBottom < baseBottom) pieces.push({ x: base.x, y: overlapBottom, w: base.w, h: baseBottom - overlapBottom });
  if (overlap.x > base.x) pieces.push({ x: base.x, y: overlap.y, w: overlap.x - base.x, h: overlap.h });
  if (overlapRight < baseRight) pieces.push({ x: overlapRight, y: overlap.y, w: baseRight - overlapRight, h: overlap.h });
  return pieces.filter((piece) => piece.w > 0 && piece.h > 0);
};

const subtractRects = (base: Rect, cuts: Rect[]) =>
  cuts.reduce((pieces, cut) => pieces.flatMap((piece) => subtractRect(piece, cut)), [base]);

const drawCandidateHighlights = (panels: PanelMap) => {
  if (!activeRuleMatches) return;
  const displayMatches = ambiguousRuleMatches ?? activeRuleMatches;
  const ambiguous = Boolean(ambiguousRuleMatches);
  ctx.save();
  const entries = displayMatches.candidates.flatMap((candidate) => {
    const rect = candidateRect(candidate, panels);
    return rect ? [{ candidate, rect }] : [];
  });
  entries.forEach(({ candidate, rect }) => {
    const overlaps = ambiguous
      ? entries.map((entry) => entry.rect).filter((other) => other !== rect).flatMap((other) => rectIntersection(rect, other) ?? [])
      : [];
    ctx.fillStyle = candidate.direction === 'forward' ? 'rgba(59, 115, 196, 0.14)' : 'rgba(111, 168, 106, 0.16)';
    ctx.strokeStyle = candidate.direction === 'forward' ? '#3b73c4' : '#5b9a55';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([7, 5]);
    if (overlaps.length === 0) {
      roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 12);
      ctx.fill();
    } else {
      ctx.save();
      roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 12);
      ctx.clip();
      subtractRects(rect, overlaps).forEach((piece) => ctx.fillRect(piece.x, piece.y, piece.w, piece.h));
      ctx.restore();
    }
    roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 12);
    ctx.stroke();
  });
  if (ambiguous) {
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(20, 30, 45, 0.18)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const overlap = rectIntersection(entries[i].rect, entries[j].rect);
        if (!overlap) continue;
        roundedRectPath(ctx, overlap.x, overlap.y, overlap.w, overlap.h, 8);
        ctx.stroke();
      }
    }
  }
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
  if (!rules.some((r) => r.enabled)) {
    const why = rules.map((r) => `${r.name}: ${r.reason ? t.reason(r.reason) : t.notApplicable}`).join(' | ');
    scene.messages = [t.noRuleMatches(t.graphSide(graphId), selected.length), why];
    showSelectionFeedback(t.noRulesMatchFeedback);
  } else {
    scene.messages = [t.selectionSummary(t.graphSide(graphId), selected.length)];
    hideSelectionFeedback();
  }
};

const ruleDisplayItems = (): RuleDisplayItem[] => {
  return easyRuleDisplayItems({
    expertMode,
    sceneRules: scene.rules,
    easyRuleSlots: EASY_RULE_SLOTS,
    puzzleIntroduced,
    labels: {
      forkReassociation: t.forkReassociation,
      pushForkThroughCrossing: t.pushForkThroughCrossing
    }
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

const refreshUi = () => {
  const modePrompt = expertMode ? t.expertPrompt : t.easyPrompt;
  const lastMessage = scene.messages[0] || scene.subtitle || modePrompt;
  const hasSelection = currentSelection.selectedNodeIds.length > 0;
  const hasManualSelection = expertMode && hasSelection;
  const hasEnabledRule = rules.some((r) => r.enabled);
  const displayItems = ruleDisplayItems();
  subtitle.textContent = ambiguousRuleMatches
    ? t.ambiguousRuleCandidates
    : activeRuleMatches
    ? t.matchingRegionsForRule(activeRuleMatches.candidates.length, activeRuleMatches.label)
    : hasManualSelection && hasEnabledRule
    ? t.selectedPiecesPrompt(currentSelection.selectedNodeIds.length)
    : lastMessage;
  if (proofOpen) proof.innerHTML = highlightRocq(currentProofText());
  renderLevelButtons();
  syncModeControls();
  ruleDock.render({
    activePuzzleId,
    activeRuleMatches,
    ambiguousRuleMatches,
    displayItems,
    expertMode,
    hasSelection,
    layouts,
    rules,
    sceneRevision,
    sceneRules: scene.rules
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
  ambiguousRuleMatches = null;
};

const applyRuleToSelection = async (name: string, selection: SelectionDescriptor) => {
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
  const candidates = perf.time('ocaml.ruleCandidates', () => {
    return uniqueRuleCandidates(item.ruleNames, (ruleName) => adapter.ruleCandidates(ruleName));
  });
  if (candidates.length === 0) {
    activeRuleMatches = null;
    ambiguousRuleMatches = null;
    scene.messages = [t.noRuleCandidates(item.label)];
    showSelectionFeedback(t.noRuleCandidatesFeedback);
  } else {
    activeRuleMatches = { key: item.key, label: item.label, ruleNames: item.ruleNames, candidates };
    ambiguousRuleMatches = null;
    scene.messages = [t.matchingRegionsForRule(candidates.length, item.label)];
    hideSelectionFeedback();
  }
  invalidateRuleDock();
  render();
};

const applyCandidate = async (candidate: RuleCandidate) => {
  if (!activeRuleMatches) return;
  await applyRuleToSelection(candidate.ruleName, selectionFromCandidate(candidate));
};

const handleRuleCandidateTap = async (p: Point, panels: PanelMap) => {
  if (!activeRuleMatches) return;
  if (ambiguousRuleMatches) {
    const hits = candidateHitsAt(p, panels, ambiguousRuleMatches.candidates);
    if (hits.length === 0) {
      clearAmbiguousRuleMatches();
      render();
      return;
    }
    if (hits.length === 1) {
      ambiguousRuleMatches = null;
      await applyCandidate(hits[0].candidate);
      return;
    }
    setAmbiguousRuleMatches(hits.map((hit) => hit.candidate));
    render();
    return;
  }

  const hits = candidateHitsAt(p, panels, activeRuleMatches.candidates);
  if (hits.length === 0) return;
  if (hits.length === 1) {
    await applyCandidate(hits[0].candidate);
    return;
  }
  setAmbiguousRuleMatches(hits.map((hit) => hit.candidate));
  render();
};

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

const closeMoreMenu = () => {
  moreMenu.open = false;
};

if (typeof (window as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent !== 'undefined') {
  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPoint(e.clientX, e.clientY);
    if (!expertMode) {
      const rect = canvas.getBoundingClientRect();
      const panels = panelsForSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
      void handleRuleCandidateTap(p, panels);
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
      void handleRuleCandidateTap(p, panels);
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
        void handleRuleCandidateTap(p, panels);
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
      perfPanelController.update();
    } else if (action === 'crossings') {
      perf.setDebugCrossings(!perf.debugCrossings);
      requestRender('debug-crossings');
      perfPanelController.update();
    } else if (action === 'selection') {
      perf.setDebugSelection(!perf.debugSelection);
      perfPanelController.update();
    } else if (action === 'copy') {
      perfPanelController.copyReport();
    } else if (action === 'hide') {
      perfPanelController.hide();
    }
    return;
  }
  const actionEl = (e.target as Element | null)?.closest<HTMLElement>('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (actionEl.closest('.more-pop')) closeMoreMenu();
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
  } else if (action === 'bonus-level') {
    loadPuzzle(BONUS_PUZZLE_ID);
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
    setExpertMode(!expertMode);
    hideSelectionFeedback();
  } else if (action === 'welcome-mode') {
    const mode = actionEl.dataset.mode;
    setExpertMode(mode === 'expert');
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
    if (expertMode) void startTutorial();
    else startAssist();
  } else if (action === 'close-tutorial') {
    stopTutorial();
  } else if (action === 'assist-next') {
    void nextAssistStep();
  } else if (action === 'assist-skip') {
    stopAssist();
  } else if (action === 'assist-start') {
    void startAssistFromWelcome();
  } else if (action === 'credits') {
    creditsPanel.setAttribute('data-open', 'true');
  } else if (action === 'close-credits') {
    creditsPanel.removeAttribute('data-open');
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
  closeMoreMenu();
  loadPuzzle(levelActions.value || DEFAULT_PUZZLE_ID);
});

localeActions.addEventListener('change', () => {
  const nextLocale = localeActions.value;
  if (nextLocale === 'en' || nextLocale === 'de') switchLocale(nextLocale);
});

welcomeLocaleActions.addEventListener('change', () => {
  const nextLocale = welcomeLocaleActions.value;
  if (nextLocale === 'en' || nextLocale === 'de') switchLocale(nextLocale);
});

rulesContainer.addEventListener(
  'scroll',
  () => {
    if (rulesContainer.scrollLeft > 8) rulesShell.dataset.scrolled = 'true';
    ruleDock.updateScrollState();
  },
  { passive: true }
);

window.addEventListener('resize', () => requestAnimationFrame(ruleDock.updateScrollState));

if (typeof (window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => requestRender('resize', false));
  ro.observe(canvas);
} else {
  window.addEventListener('resize', () => requestRender('resize', false));
}

syncModeControls();
void layoutScene(scene);
maybeStartAssist();

export type AppDom = {
  canvas: HTMLCanvasElement;
  subtitle: HTMLElement;
  proof: HTMLPreElement;
  proofTitle: HTMLElement;
  proofShareStatus: HTMLElement;
  proofShareAction: HTMLButtonElement;
  proofPrimaryAction: HTMLButtonElement;
  moveCountEl: HTMLElement | null;
  moveCounter: HTMLElement | null;
  successModal: HTMLElement;
  successFinalBody: HTMLElement;
  proofPanel: HTMLElement;
  helpPanel: HTMLElement;
  tutorialPanel: HTMLElement;
  assistWelcomePanel: HTMLElement;
  resetDemoPanel: HTMLElement;
  creditsPanel: HTMLElement;
  tutorialCanvas: HTMLCanvasElement;
  tutorialRuleCard: HTMLButtonElement;
  tutorialRulePreview: HTMLElement;
  tutorialRoot: HTMLElement;
  tutorialVeil: SVGSVGElement;
  tutorialMaskCutout: SVGRectElement;
  tutorialRing: SVGRectElement;
  tutorialDemoLasso: SVGPathElement;
  tutorialCard: HTMLElement;
  tutorialKicker: HTMLElement;
  tutorialTitle: HTMLElement;
  tutorialBody: HTMLElement;
  tutorialDots: HTMLElement;
  tutorialNext: HTMLButtonElement;
  confettiCanvas: HTMLCanvasElement;
  tutorialCaption: HTMLElement;
  selectionFeedback: HTMLElement;
  tutorialFinger: HTMLElement;
  tutorialRipple: HTMLElement;
  perfPanel: HTMLElement;
  perfOutput: HTMLPreElement;
  levelActions: HTMLSelectElement;
  localeActions: HTMLSelectElement;
  welcomeLocaleActions: HTMLSelectElement;
  rulesShell: HTMLElement;
  rulesContainer: HTMLElement;
  expertToggle: HTMLButtonElement;
  moreMenu: HTMLDetailsElement;
  ctx: CanvasRenderingContext2D;
  tutorialCtx: CanvasRenderingContext2D;
};

const requireElement = <T extends Element>(selector: string, typeName: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required UI element: ${selector} (${typeName})`);
  return element;
};

export const queryAppDom = (): AppDom => {
  const canvas = requireElement<HTMLCanvasElement>('#stage', 'canvas');
  const tutorialCanvas = requireElement<HTMLCanvasElement>('#tutorial-stage', 'tutorial canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  const tutorialCtx = tutorialCanvas.getContext('2d');
  if (!tutorialCtx) throw new Error('Tutorial 2D context unavailable');

  return {
    canvas,
    subtitle: requireElement<HTMLElement>('#subtitle-text', 'subtitle'),
    proof: requireElement<HTMLPreElement>('#proof', 'proof'),
    proofTitle: requireElement<HTMLElement>('#proof-title', 'proof title'),
    proofShareStatus: requireElement<HTMLElement>('#proof-share-status', 'proof share status'),
    proofShareAction: requireElement<HTMLButtonElement>('#proof-share-action', 'proof share action'),
    proofPrimaryAction: requireElement<HTMLButtonElement>('#proof-primary-action', 'proof primary action'),
    moveCountEl: document.querySelector<HTMLElement>('#move-count'),
    moveCounter: document.querySelector<HTMLElement>('[data-move-counter]'),
    successModal: requireElement<HTMLElement>('#success-modal', 'success modal'),
    successFinalBody: requireElement<HTMLElement>('#success-final-body', 'success final body'),
    proofPanel: requireElement<HTMLElement>('#proof-panel', 'proof panel'),
    helpPanel: requireElement<HTMLElement>('#help-panel', 'help panel'),
    tutorialPanel: requireElement<HTMLElement>('#tutorial-panel', 'tutorial panel'),
    assistWelcomePanel: requireElement<HTMLElement>('#assist-welcome-panel', 'assist welcome panel'),
    resetDemoPanel: requireElement<HTMLElement>('#reset-demo-panel', 'reset demo panel'),
    creditsPanel: requireElement<HTMLElement>('#credits-panel', 'credits panel'),
    tutorialCanvas,
    tutorialRuleCard: requireElement<HTMLButtonElement>('#tutorial-rule-card', 'tutorial rule card'),
    tutorialRulePreview: requireElement<HTMLElement>('#tutorial-rule-preview', 'tutorial rule preview'),
    tutorialRoot: requireElement<HTMLElement>('#tutorial-root', 'tutorial root'),
    tutorialVeil: requireElement<SVGSVGElement>('#tutorial-veil', 'tutorial veil'),
    tutorialMaskCutout: requireElement<SVGRectElement>('#tutorial-mask-cutout', 'tutorial mask cutout'),
    tutorialRing: requireElement<SVGRectElement>('#tutorial-ring', 'tutorial ring'),
    tutorialDemoLasso: requireElement<SVGPathElement>('#tutorial-demo-lasso', 'tutorial demo lasso'),
    tutorialCard: requireElement<HTMLElement>('#tutorial-card', 'tutorial card'),
    tutorialKicker: requireElement<HTMLElement>('#tutorial-kicker', 'tutorial kicker'),
    tutorialTitle: requireElement<HTMLElement>('#tutorial-title', 'tutorial title'),
    tutorialBody: requireElement<HTMLElement>('#tutorial-body', 'tutorial body'),
    tutorialDots: requireElement<HTMLElement>('#tutorial-dots', 'tutorial dots'),
    tutorialNext: requireElement<HTMLButtonElement>('#tutorial-next', 'tutorial next'),
    confettiCanvas: requireElement<HTMLCanvasElement>('#confetti-canvas', 'confetti canvas'),
    tutorialCaption: requireElement<HTMLElement>('#tutorial-caption', 'tutorial caption'),
    selectionFeedback: requireElement<HTMLElement>('#selection-feedback', 'selection feedback'),
    tutorialFinger: requireElement<HTMLElement>('#tutorial-finger', 'tutorial finger'),
    tutorialRipple: requireElement<HTMLElement>('#tutorial-ripple', 'tutorial ripple'),
    perfPanel: requireElement<HTMLElement>('#perf-panel', 'perf panel'),
    perfOutput: requireElement<HTMLPreElement>('#perf-output', 'perf output'),
    levelActions: requireElement<HTMLSelectElement>('#level-actions', 'level selector'),
    localeActions: requireElement<HTMLSelectElement>('#locale-actions', 'locale selector'),
    welcomeLocaleActions: requireElement<HTMLSelectElement>('#welcome-locale-actions', 'welcome locale selector'),
    rulesShell: requireElement<HTMLElement>('#rules-shell', 'rules shell'),
    rulesContainer: requireElement<HTMLElement>('#rules', 'rules container'),
    expertToggle: requireElement<HTMLButtonElement>('[data-action="expert-toggle"]', 'expert toggle'),
    moreMenu: requireElement<HTMLDetailsElement>('.more', 'more menu'),
    ctx,
    tutorialCtx
  };
};

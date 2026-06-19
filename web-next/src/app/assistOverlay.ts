import type { Rect } from '../diagramSvg';
import type { AssistPlacement, AssistRelativeRect, AssistStep } from './config';

export type AssistOverlayController = {
  renderStep: (state: AssistOverlayStepState) => void;
  start: (onResize: () => void) => void;
  stop: () => void;
};

export type AssistOverlayStepState = {
  index: number;
  nextLabel: string;
  pulseRuleName: string | null;
  resolveSelectionDemoRect: (step: AssistStep) => Rect | null;
  step: AssistStep;
  total: number;
};

const ASSIST_LASSO_DURATION_MS = 4800;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const relativeRect = (rect: Rect, relative: AssistRelativeRect): Rect => ({
  x: rect.x + rect.w * relative.x,
  y: rect.y + rect.h * relative.y,
  w: rect.w * relative.w,
  h: rect.h * relative.h
});

export const createAssistOverlay = ({
  root,
  maskCutout,
  ring,
  demoLasso,
  card,
  kicker,
  title,
  body,
  dots,
  next,
  finger,
  rulesContainer
}: {
  root: HTMLElement;
  maskCutout: SVGRectElement;
  ring: SVGRectElement;
  demoLasso: SVGPathElement;
  card: HTMLElement;
  kicker: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  dots: HTMLElement;
  next: HTMLButtonElement;
  finger: HTMLElement;
  rulesContainer: HTMLElement;
}): AssistOverlayController => {
  let fingerFrame = 0;
  let fingerStartedAt = 0;
  let resizeObserver: ResizeObserver | null = null;
  let active = false;

  const stopFinger = () => {
    if (fingerFrame) cancelAnimationFrame(fingerFrame);
    fingerFrame = 0;
    fingerStartedAt = 0;
    finger.classList.remove('assist-finger');
    finger.style.opacity = '';
    finger.style.transform = 'translate(-120px, -120px)';
  };

  const clearRuleHighlights = () => {
    document
      .querySelectorAll('.rule.assist-rule-pulse, .rule.tut-hot')
      .forEach((el) => el.classList.remove('assist-rule-pulse', 'tut-hot'));
  };

  const stop = () => {
    active = false;
    document.body.classList.remove('assist-on');
    root.setAttribute('aria-hidden', 'true');
    root.removeAttribute('data-active');
    root.hidden = true;
    demoLasso.classList.remove('tut-on');
    demoLasso.removeAttribute('d');
    stopFinger();
    clearRuleHighlights();
    resizeObserver?.disconnect();
    resizeObserver = null;
  };

  const start = (onResize: () => void) => {
    stop();
    active = true;
    document.body.classList.add('assist-on');
    root.hidden = false;
    root.setAttribute('data-active', 'true');
    root.setAttribute('aria-hidden', 'false');
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(document.body);
    }
  };

  const baseRectFor = (step: AssistStep): Rect => {
    const el = document.querySelector<HTMLElement>(step.selector);
    if (!el) return { x: 0, y: 0, w: 0, h: 0 };
    const r = el.getBoundingClientRect();
    let rect = { x: r.left, y: r.top, w: r.width, h: r.height };
    if (step.focusRect === 'rhs') rect = { ...rect, x: rect.x + rect.w * 0.55, w: rect.w * 0.45 };
    if (step.focusRect === 'lhs') rect = { ...rect, w: rect.w * 0.45 };
    return rect;
  };

  const spotlightRectFor = (step: AssistStep): Rect => {
    const rect = baseRectFor(step);
    const pad = step.padding;
    return { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
  };

  const applyMask = (rect: Rect) => {
    const attrs = {
      x: String(rect.x),
      y: String(rect.y),
      width: String(rect.w),
      height: String(rect.h)
    };
    Object.entries(attrs).forEach(([name, value]) => {
      maskCutout.setAttribute(name, value);
      ring.setAttribute(name, value);
    });
  };

  const placeCard = (rect: Rect, requested: AssistPlacement) => {
    const margin = 14;
    const cardW = card.offsetWidth || 320;
    const cardH = card.offsetHeight || 170;
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

    card.dataset.placement = placement;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  };

  const demoRectFor = (step: AssistStep, resolveSelectionDemoRect: (step: AssistStep) => Rect | null) => {
    if (step.selectionDemo) {
      const rect = resolveSelectionDemoRect(step);
      if (rect) return rect;
    }
    const base = baseRectFor(step);
    return step.lassoRect ? relativeRect(base, step.lassoRect) : base;
  };

  const startFingerOnLasso = () => {
    stopFinger();
    const total = demoLasso.getTotalLength();
    if (!Number.isFinite(total) || total <= 0) return;
    finger.classList.add('assist-finger');
    fingerStartedAt = performance.now();

    const drawStart = 0.12;
    const drawEnd = 0.46;
    const holdEnd = 0.68;
    const tick = (now: number) => {
      if (!active || !demoLasso.classList.contains('tut-on')) return;
      const phase = ((now - fingerStartedAt) % ASSIST_LASSO_DURATION_MS) / ASSIST_LASSO_DURATION_MS;
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
      const point = demoLasso.getPointAtLength(total * clamp(progress, 0, 1));
      finger.style.opacity = String(opacity);
      finger.style.transform = `translate(${point.x}px, ${point.y}px)`;
      fingerFrame = requestAnimationFrame(tick);
    };
    fingerFrame = requestAnimationFrame(tick);
  };

  const setDemo = (step: AssistStep, resolveSelectionDemoRect: (step: AssistStep) => Rect | null) => {
    if (step.demo !== 'lasso') {
      demoLasso.classList.remove('tut-on');
      demoLasso.removeAttribute('d');
      stopFinger();
      return;
    }
    const rect = demoRectFor(step, resolveSelectionDemoRect);
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
    demoLasso.classList.remove('tut-on');
    demoLasso.setAttribute('d', d);
    demoLasso.setAttribute('pathLength', '1');
    void demoLasso.getBoundingClientRect();
    demoLasso.classList.add('tut-on');
    startFingerOnLasso();
  };

  const updateRuleHighlight = (ruleName: string | null) => {
    clearRuleHighlights();
    if (!ruleName) return;
    const rule = rulesContainer.querySelector<HTMLElement>(
      `.rule[data-rule-name="${ruleName}"], .rule[data-rule-names~="${ruleName}"]`
    );
    rule?.classList.add('tut-hot', 'assist-rule-pulse');
  };

  const paintDots = (index: number, total: number) => {
    dots.replaceChildren(
      ...Array.from({ length: total }, (_, idx) => {
        const dot = document.createElement('div');
        dot.className = 'tut-dot';
        dot.toggleAttribute('data-current', idx === index);
        return dot;
      })
    );
  };

  const renderStep = ({ step, index, total, nextLabel, pulseRuleName, resolveSelectionDemoRect }: AssistOverlayStepState) => {
    const rect = spotlightRectFor(step);
    applyMask(rect);
    placeCard(rect, step.placement);
    setDemo(step, resolveSelectionDemoRect);
    kicker.textContent = step.kicker;
    title.textContent = step.title;
    body.textContent = step.body;
    next.textContent = nextLabel;
    paintDots(index, total);
    updateRuleHighlight(pulseRuleName);
  };

  return { renderStep, start, stop };
};

import { rulePreviewSvg as rulePreviewSvgBase, type SvgOpts } from '../diagramSvg';
import { layoutSceneGraph } from '../layout/physicsLayout';
import type { LayoutGraph } from '../layout/layoutTypes';
import type { RuleAvailability, RuleCandidate, SceneGraph, SceneRule } from '../model/interop';
import type { Translations } from '../i18n';
import { perf } from '../perf';
import {
  RULE_PREVIEW_HEIGHT,
  RULE_PREVIEW_WIDTH,
  type ActiveRuleMatchSet,
  type LayoutState,
  type RuleDisplayItem
} from './config';
import { candidateKey } from './easyMatching';

type RuleDockController = {
  drawPreviewGraphs: (container: HTMLElement, rule: { lhs: LayoutGraph; rhs: LayoutGraph }, dimmed: boolean, expertMode: boolean) => void;
  invalidate: () => void;
  invalidateCandidateCounts: () => void;
  render: (state: RuleDockRenderState) => void;
  updateScrollState: () => void;
};

type RuleDockRenderState = {
  activePuzzleId: string;
  activeRuleMatches: ActiveRuleMatchSet;
  ambiguousRuleMatches: ActiveRuleMatchSet;
  displayItems: RuleDisplayItem[];
  expertMode: boolean;
  hasSelection: boolean;
  layouts: LayoutState | null;
  rules: RuleAvailability[];
  sceneRevision: number;
  sceneRules: SceneRule[];
};

const sharedRulePreviewOpts = (): SvgOpts => ({
  edgeStrokeWidth: 2.8,
  nodeScale: 1.18,
  triangleScale: 1.34,
  previewZoom: 1.18
});

const rulePreviewSvg = ({
  rule,
  width,
  height,
  dimmed,
  expertMode,
  cssVar
}: {
  rule: { lhs: LayoutGraph; rhs: LayoutGraph };
  width: number;
  height: number;
  dimmed: boolean;
  expertMode: boolean;
  cssVar: (name: string, fallback: string) => string;
}) =>
  rulePreviewSvgBase(rule, width, height, dimmed, expertMode
    ? { ...sharedRulePreviewOpts(), pinColor: cssVar('--pin', '#9aa8b8') }
    : {
        ...sharedRulePreviewOpts(),
        pinColor: '#9aa3ad',
        crossingFill: '#ffffff',
        crossingStroke: '#111111',
        nodeStroke: '#111111',
        colorMap: {
          '0,114,178': '#000000',
          '0,115,179': '#000000',
          '213,94,0': '#6a6a6a',
          '214,94,0': '#6a6a6a',
          '255,102,0': '#6a6a6a',
          '0,102,102': '#767676',
          '0,158,114': '#969696',
          '0,158,115': '#969696',
          '0,159,115': '#969696',
          '239,226,66': '#bdbdbd',
          '240,228,66': '#bdbdbd',
          '204,25,25': '#252525',
          '128,128,128': '#d0d0d0'
        }
      });

export const createRuleDock = ({
  container,
  shell,
  cssVar,
  renderRule,
  ruleCandidates,
  t
}: {
  container: HTMLElement;
  shell: HTMLElement;
  cssVar: (name: string, fallback: string) => string;
  renderRule: (formula: string) => { lhs: SceneGraph; rhs: SceneGraph };
  ruleCandidates: (ruleName: string) => RuleCandidate[];
  t: Translations;
}): RuleDockController => {
  let renderedKey = '';
  let easyCandidateCountCacheKey = '';
  let easyCandidateCountCache = new Map<string, number>();
  const fallbackRulePreviewCache = new Map<string, { lhs: LayoutGraph; rhs: LayoutGraph }>();
  const fallbackRulePreviewLoading = new Set<string>();

  const drawPreviewGraphs = (
    target: HTMLElement,
    rule: { lhs: LayoutGraph; rhs: LayoutGraph },
    dimmed: boolean,
    expertMode: boolean
  ) => {
    target.innerHTML = rulePreviewSvg({
      rule,
      width: RULE_PREVIEW_WIDTH,
      height: RULE_PREVIEW_HEIGHT,
      dimmed,
      expertMode,
      cssVar
    });
  };

  const drawPreviewLoading = (target: HTMLElement, dimmed: boolean) => {
    target.innerHTML = `
      <svg class="rule-preview-svg" viewBox="0 0 ${RULE_PREVIEW_WIDTH} ${RULE_PREVIEW_HEIGHT}" role="img" aria-label="${t.rulePreviewLoading}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${RULE_PREVIEW_WIDTH}" height="${RULE_PREVIEW_HEIGHT}" rx="8" fill="${dimmed ? '#f2f6fb' : '#fbfdff'}" />
        <text x="${RULE_PREVIEW_WIDTH * 0.5}" y="${RULE_PREVIEW_HEIGHT * 0.5}" text-anchor="middle" dominant-baseline="central" fill="#8da0b3" font-family="Avenir Next, sans-serif" font-size="11" font-weight="600">${t.layoutLoading}</text>
      </svg>
    `;
  };

  const drawPreview = (target: HTMLElement, item: RuleDisplayItem, dimmed: boolean, expertMode: boolean, layouts: LayoutState | null) => {
    const rule = layouts?.rules.get(item.representativeName);
    if (!rule) {
      if (!item.previewFormula) {
        drawPreviewLoading(target, dimmed);
        return;
      }
      const cached = fallbackRulePreviewCache.get(item.previewFormula);
      if (cached) {
        drawPreviewGraphs(target, cached, dimmed, expertMode);
        return;
      }
      drawPreviewLoading(target, dimmed);
      if (fallbackRulePreviewLoading.has(item.previewFormula)) return;
      fallbackRulePreviewLoading.add(item.previewFormula);
      void (async () => {
        const formula = item.previewFormula ?? '';
        try {
          const fallbackRule = renderRule(formula);
          const preview = {
            lhs: await layoutSceneGraph(fallbackRule.lhs),
            rhs: await layoutSceneGraph(fallbackRule.rhs)
          };
          fallbackRulePreviewCache.set(formula, preview);
          if (document.body.contains(target)) drawPreviewGraphs(target, preview, dimmed, expertMode);
        } catch {
          drawPreviewLoading(target, dimmed);
        } finally {
          fallbackRulePreviewLoading.delete(formula);
        }
      })();
      return;
    }
    drawPreviewGraphs(target, rule, dimmed, expertMode);
  };

  const updateScrollState = () => {
    const overflow = container.scrollWidth > container.clientWidth + 2;
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const atStart = container.scrollLeft <= 2;
    const atEnd = container.scrollLeft >= maxScroll - 2;
    shell.dataset.overflow = String(overflow);
    shell.dataset.atStart = String(!overflow || atStart);
    shell.dataset.atEnd = String(!overflow || atEnd);
    if (!overflow) shell.removeAttribute('data-scrolled');
  };

  const easyCandidateCounts = ({ activePuzzleId, displayItems, expertMode, hasSelection, layouts, sceneRevision }: RuleDockRenderState) => {
    if (expertMode || !layouts || hasSelection) return new Map<string, number>();
    const key = [
      sceneRevision,
      activePuzzleId,
      displayItems.map((item) => `${item.key}:${item.ruleNames.join('+')}`).join(',')
    ].join('|');
    if (key === easyCandidateCountCacheKey) return easyCandidateCountCache;
    const counts = perf.time('easy.ruleCandidateCounts', () => {
      const nextCounts = new Map<string, number>();
      displayItems.forEach((item) => {
        const count = item.ruleNames.reduce((sum, ruleName) => sum + ruleCandidates(ruleName).length, 0);
        nextCounts.set(item.key, count);
      });
      return nextCounts;
    });
    easyCandidateCountCacheKey = key;
    easyCandidateCountCache = counts;
    return counts;
  };

  const render = (state: RuleDockRenderState) => {
    const easyCounts = easyCandidateCounts(state);
    const hasManualSelection = state.expertMode && state.hasSelection;
    container.dataset.selection = String(hasManualSelection);
    container.dataset.mode = state.expertMode ? 'expert' : 'easy';
    const ruleKey = [
      state.activePuzzleId,
      state.layouts ? 'ready' : 'pending',
      state.expertMode ? 'expert' : 'rule-first',
      state.activeRuleMatches ? `${state.activeRuleMatches.key}:${state.activeRuleMatches.candidates.length}` : 'no-active-rule',
      state.ambiguousRuleMatches ? `${state.ambiguousRuleMatches.key}:${state.ambiguousRuleMatches.candidates.map(candidateKey).join('+')}` : 'no-ambiguous-rule',
      [...easyCounts.entries()].map(([key, count]) => `${key}:${count}`).join(','),
      state.sceneRules.map((r) => r.name).join(','),
      state.displayItems.map((item) => `${item.key}:${item.label}:${item.ruleNames.join('+')}`).join(','),
      state.rules.map((r) => `${r.name}:${r.enabled ? 1 : 0}:${r.reason ?? ''}`).join(',')
    ].join('|');
    if (ruleKey === renderedKey) {
      requestAnimationFrame(updateScrollState);
      return;
    }
    renderedKey = ruleKey;
    if (!state.hasSelection) shell.removeAttribute('data-scrolled');
    container.replaceChildren(
      ...state.displayItems.map((item, idx) => {
        const availabilities = item.ruleNames.map((name) => state.rules.find((r) => r.name === name) ?? { name, enabled: false, reason: t.unavailable });
        const manuallyApplicable = hasManualSelection && availabilities.some((ra) => ra.enabled);
        const easyApplicable = state.expertMode || hasManualSelection || (easyCounts.get(item.key) ?? 0) > 0;
        const dimmed = hasManualSelection ? !manuallyApplicable : !easyApplicable;
        const disabled = !state.layouts || item.ruleNames.length === 0 || (hasManualSelection && !manuallyApplicable) || (!hasManualSelection && !easyApplicable);
        const active = state.activeRuleMatches?.key === item.key;
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
        btn.title = disabled && state.layouts
          ? t.unavailable
          : manuallyApplicable
          ? t.applyRule(item.label)
          : active
            ? t.matchingRegionsForRule(state.activeRuleMatches?.candidates.length ?? 0, item.label)
            : state.layouts
              ? t.findMatchingRegions(item.label)
              : t.layoutLoading;
        btn.innerHTML = `
          <div class="rule-meta" aria-hidden="${state.expertMode ? 'false' : 'true'}"><span class="rule-badge">R${idx + 1}</span><span class="rule-name"></span></div>
          <div class="rule-preview" aria-hidden="true"></div>
        `;
        const nameEl = btn.querySelector<HTMLElement>('.rule-name');
        if (nameEl) nameEl.textContent = item.label;
        const pv = btn.querySelector<HTMLElement>('.rule-preview');
        if (pv) drawPreview(pv, item, dimmed, state.expertMode, state.layouts);
        return btn;
      })
    );
    setTimeout(() => {
      container.querySelectorAll<HTMLElement>('.rule-preview').forEach((pv) => {
        if (pv.clientHeight > 0) {
          const btn = pv.closest<HTMLElement>('button.rule');
          const dimmed = btn?.dataset.dimmed === 'true';
          const item = btn ? state.displayItems.find((entry) => entry.key === btn.dataset.ruleGroupKey) : undefined;
          if (item) drawPreview(pv, item, dimmed, state.expertMode, state.layouts);
        }
      });
      updateScrollState();
    }, 0);
    requestAnimationFrame(updateScrollState);
  };

  const invalidate = () => {
    renderedKey = '';
  };

  const invalidateCandidateCounts = () => {
    easyCandidateCountCacheKey = '';
    easyCandidateCountCache = new Map();
  };

  return { drawPreviewGraphs, invalidate, invalidateCandidateCounts, render, updateScrollState };
};

import type { LayoutGraph } from '../layout/layoutTypes';
import type { RuleCandidate, SceneRule } from '../model/interop';
import type { Point, Rect } from '../diagramSvg';
import type { Translations } from '../i18n';

export type PanelMap = { lhs: Rect; rhs: Rect };
export type CrossingDiagnostic = { graphId: string; edgeA: string; edgeB: string; point: Point };
export type AssistPlacement = 'top' | 'right' | 'bottom' | 'left';
export type AssistFocusRect = 'lhs' | 'rhs';
export type AssistRelativeRect = { x: number; y: number; w: number; h: number };
export type AssistStep = {
  selector: string;
  padding: number;
  focusRect?: AssistFocusRect;
  lassoRect?: AssistRelativeRect;
  selectionDemo?: 'level-1-em';
  before?: 'select-level-1' | 'apply-level-1' | 'activate-level-1-rule' | 'apply-level-1-candidate';
  pulse?: 'level-1-rule';
  pulseRuleName?: string;
  kicker: string;
  title: string;
  body: string;
  placement: AssistPlacement;
  demo?: 'lasso';
};
export type LayoutState = {
  graphs: Map<string, LayoutGraph>;
  rules: Map<string, { lhs: LayoutGraph; rhs: LayoutGraph }>;
};
export type ActiveRuleMatchSet = {
  key: string;
  label: string;
  ruleNames: string[];
  candidates: RuleCandidate[];
} | null;
export type RuleDisplayItem = {
  key: string;
  label: string;
  representativeName: string;
  ruleNames: string[];
  rules: SceneRule[];
  previewFormula?: string;
};
export type EasyRuleSlot = {
  key: string;
  label: () => string;
  representativeName: string;
  ruleNames: string[];
  introducedAt: string;
  previewFormula: string;
};
export type InteractionMode = 'easy' | 'expert';
export type AssistStepSets = {
  level1Expert: AssistStep[];
  level1Easy: AssistStep[];
  level2Easy: AssistStep[];
  level3Expert: AssistStep[];
  level3Easy: AssistStep[];
  level5Expert: AssistStep[];
  level5Easy: AssistStep[];
};

export const DEFAULT_PUZZLE_ID = 'composite-monad-left-unit';
export const OFFICIAL_FINAL_PUZZLE_ID = 'composite-monad-associativity';
export const BONUS_PUZZLE_ID = 'three-monad-composition';
export const ASSIST_STAGE_SELECTOR = '.stage';
export const RULE_PREVIEW_WIDTH = 220;
export const RULE_PREVIEW_HEIGHT = 112;
export const GUIDED_REWRITE_PUZZLE_IDS = new Set(['composite-monad-left-unit']);
export const MODE_STORAGE_KEY = 'string-diagrams.interactionMode';

export const createEasyRuleSlots = (t: Translations): EasyRuleSlot[] => [
  {
    key: 'push-through-crossing',
    label: () => t.pushForkThroughCrossing,
    representativeName: 'mx',
    ruleNames: ['mx', 'nx', 'ny', 'oy', 'mz', 'oz'],
    introducedAt: DEFAULT_PUZZLE_ID,
    previewFormula: 'm: M⊗M -> M\nx: N⊗M -> M⊗N\nN·m ; x = x·M ; M·x ; m·N'
  },
  {
    key: 'fork-reassociation',
    label: () => t.forkReassociation,
    representativeName: 'mA',
    ruleNames: ['mA', 'nA', 'mm', 'nn', 'oo'],
    introducedAt: 'clean-up-two-units',
    previewFormula: 'm: M⊗M -> M\nm·M ; m = M·m ; m'
  }
];

export const createAssistStepSets = (t: Translations): AssistStepSets => ({
  level1Expert: [
    {
      selector: ASSIST_STAGE_SELECTOR,
      padding: 8,
      focusRect: 'lhs',
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
  ],
  level1Easy: [
    {
      selector: '#rules',
      padding: 8,
      pulse: 'level-1-rule',
      kicker: t.assist.level1Easy[0].kicker,
      title: t.assist.level1Easy[0].title,
      body: t.assist.level1Easy[0].body,
      placement: 'top'
    },
    {
      selector: ASSIST_STAGE_SELECTOR,
      padding: 8,
      focusRect: 'lhs',
      before: 'activate-level-1-rule',
      kicker: t.assist.level1Easy[1].kicker,
      title: t.assist.level1Easy[1].title,
      body: t.assist.level1Easy[1].body,
      placement: 'right'
    },
    {
      selector: ASSIST_STAGE_SELECTOR,
      padding: 8,
      focusRect: 'lhs',
      before: 'apply-level-1-candidate',
      kicker: t.assist.level1Easy[2].kicker,
      title: t.assist.level1Easy[2].title,
      body: t.assist.level1Easy[2].body,
      placement: 'right'
    },
    {
      selector: '#rules',
      padding: 8,
      pulse: 'level-1-rule',
      kicker: t.assist.level1Easy[3].kicker,
      title: t.assist.level1Easy[3].title,
      body: t.assist.level1Easy[3].body,
      placement: 'top'
    }
  ],
  level2Easy: [
    {
      selector: '.rule[data-rule-name="mA"]',
      padding: 8,
      pulseRuleName: 'mA',
      kicker: t.assist.level2Easy[0].kicker,
      title: t.assist.level2Easy[0].title,
      body: t.assist.level2Easy[0].body,
      placement: 'top'
    }
  ],
  level3Expert: [
    {
      selector: ASSIST_STAGE_SELECTOR,
      padding: 8,
      focusRect: 'rhs',
      kicker: t.assist.level3Expert[0].kicker,
      title: t.assist.level3Expert[0].title,
      body: t.assist.level3Expert[0].body,
      placement: 'left'
    }
  ],
  level3Easy: [
    {
      selector: '#rules',
      padding: 8,
      kicker: t.assist.level3Easy[0].kicker,
      title: t.assist.level3Easy[0].title,
      body: t.assist.level3Easy[0].body,
      placement: 'top'
    }
  ],
  level5Expert: [
    {
      selector: '#rules',
      padding: 8,
      kicker: t.assist.level5Expert[0].kicker,
      title: t.assist.level5Expert[0].title,
      body: t.assist.level5Expert[0].body,
      placement: 'top'
    }
  ],
  level5Easy: [
    {
      selector: '.rule[data-rule-name="xyz"]',
      padding: 8,
      pulseRuleName: 'xyz',
      kicker: t.assist.level5Easy[0].kicker,
      title: t.assist.level5Easy[0].title,
      body: t.assist.level5Easy[0].body,
      placement: 'top'
    }
  ]
});

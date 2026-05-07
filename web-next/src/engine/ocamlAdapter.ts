import type {
  ApplyResult,
  PuzzleInfo,
  RuleAvailability,
  SceneGraph,
  SceneState,
  SelectionDescriptor,
  TutorialDemo
} from '../model/interop';

type BridgeApi = {
  init_demo: (name: string) => unknown;
  list_demos?: () => unknown;
  tutorial_demo?: (name: string) => unknown;
  get_scene: () => unknown;
  evaluate_selection: (selection: unknown) => unknown;
  apply_rule: (ruleName: string, selection: unknown) => unknown;
  undo: () => unknown;
  redo: () => unknown;
  export_proof: () => string;
  get_messages: () => unknown;
};

declare global {
  interface Window {
    StringDiagramsBridge?: BridgeApi;
  }
}

const DEFAULT_DEMO = 'composite-monad-left-unit';

const fallbackPuzzles: PuzzleInfo[] = [
  {
    id: 'composite-monad-left-unit',
    level: 'Level 1',
    title: 'Level 1: Left Unit',
    subtitle: 'Shrink the left unit fork until only the clean composite string remains.'
  },
  {
    id: 'composite-monad-right-unit',
    level: 'Level 2',
    title: 'Level 2: Right Unit',
    subtitle: 'Shrink the right unit fork. Same proof idea, mirrored.'
  },
  {
    id: 'composite-monad-associativity',
    level: 'Level 3',
    title: 'Level 3: Double Fork',
    subtitle: 'Lasso-select a region on either side, then tap a visual rule.'
  },
  {
    id: 'three-monad-composition',
    level: 'Level 4',
    title: 'Level 4: Three Monads',
    subtitle: 'Compose three monads by moving the crossings into the same shape.'
  }
];

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asBoolean = (value: unknown): boolean => Boolean(value);
const asNumber = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0));
const asOptionalNumber = (value: unknown): number | undefined =>
  value === undefined || value === null || value === '' ? undefined : asNumber(value);
const parsePoint = (value: unknown) => {
  const p = (value ?? {}) as Record<string, unknown>;
  const x = asOptionalNumber(p.x);
  const y = asOptionalNumber(p.y);
  return x === undefined || y === undefined ? undefined : { x, y };
};

const parseGraph = (g: Record<string, unknown>): SceneGraph => ({
  id: asString(g.id),
  nodes: asArray<Record<string, unknown>>(g.nodes).map((n) => ({
    id: asString(n.id),
    kind: asString(n.kind),
    label: asString(n.label),
    x: asNumber(n.x),
    y: asNumber(n.y),
    x0: asNumber(n.x0),
    y0: asNumber(n.y0),
    x1: asNumber(n.x1),
    y1: asNumber(n.y1),
    nsources: asNumber(n.nsources),
    ntargets: asNumber(n.ntargets),
    sourceTypes: asArray<unknown>(n.sourceTypes).map(asString),
    targetTypes: asArray<unknown>(n.targetTypes).map(asString),
    visual: {
      shape: asString(((n.visual ?? {}) as Record<string, unknown>).shape) || undefined,
      radius: asOptionalNumber(((n.visual ?? {}) as Record<string, unknown>).radius),
      size: parsePoint(((n.visual ?? {}) as Record<string, unknown>).size)
    },
    ceiling: n.ceiling ? (n.ceiling as Record<string, unknown>) : undefined,
    color: asString(n.color),
    selectable: asBoolean(n.selectable)
  })),
  edges: asArray<Record<string, unknown>>(g.edges).map((e) => ({
    id: asString(e.id),
    from: (e.from ?? {}) as Record<string, unknown>,
    to: (e.to ?? {}) as Record<string, unknown>,
    curve: asArray<Record<string, unknown>>(e.curve).map((p) => ({
      x: asNumber(p.x),
      y: asNumber(p.y)
    })),
    color: asString(e.color || '#2f4f67')
  })),
  sources: asNumber(g.sources),
  targets: asNumber(g.targets)
});

const toSceneState = (raw: unknown): SceneState => {
  const state = (raw ?? {}) as Record<string, unknown>;
  return {
    puzzleId: asString(state.puzzleId) || DEFAULT_DEMO,
    level: asString(state.level),
    title: asString(state.title),
    subtitle: asString(state.subtitle),
    graphs: asArray<Record<string, unknown>>(state.graphs).map(parseGraph),
    rules: asArray<Record<string, unknown>>(state.rules).map((r) => ({
      name: asString(r.name),
      lhs: parseGraph((r.lhs ?? {}) as Record<string, unknown>),
      rhs: parseGraph((r.rhs ?? {}) as Record<string, unknown>)
    })),
    messages: asArray<unknown>(state.messages).map(asString),
    proofLines: asArray<unknown>(state.proofLines).map(asString)
  };
};

const toRuleAvailability = (raw: unknown): RuleAvailability[] => {
  const arr = asArray<Record<string, unknown>>(raw);
  return arr.map((r) => ({
    name: asString(r.name) as RuleAvailability['name'],
    enabled: asBoolean(r.enabled),
    reason: typeof r.reason === 'string' ? r.reason : undefined
  }));
};

const toApplyResult = (raw: unknown): ApplyResult => {
  const x = (raw ?? {}) as Record<string, unknown>;
  return {
    ok: asBoolean(x.ok),
    scene: x.scene ? toSceneState(x.scene) : undefined,
    proofDelta: asArray<unknown>(x.proofDelta).map(asString),
    error: typeof x.error === 'string' ? x.error : undefined
  };
};

const toSelectionDescriptor = (raw: unknown): SelectionDescriptor => {
  const x = (raw ?? {}) as Record<string, unknown>;
  return {
    graphId: asString(x.graphId) || 'lhs',
    selectedNodeIds: asArray<unknown>(x.selectedNodeIds).map(asString),
    polygon: asArray<Record<string, unknown>>(x.polygon).map((p) => ({ x: asNumber(p.x), y: asNumber(p.y) })),
    cuts: asArray<Record<string, unknown>>(x.cuts).map((cut) => ({
      edgeId: asString(cut.edgeId),
      side: asString(cut.side) === 'target' ? 'target' : 'source',
      t: asNumber(cut.t)
    })),
    cycleOrder: asArray<unknown>(x.cycleOrder).map(asString)
  };
};

const toTutorialDemo = (raw: unknown): TutorialDemo => {
  const x = (raw ?? {}) as Record<string, unknown>;
  return {
    ok: asBoolean(x.ok),
    initialScene: x.initialScene ? toSceneState(x.initialScene) : undefined,
    selection: x.selection ? toSelectionDescriptor(x.selection) : undefined,
    ruleName: typeof x.ruleName === 'string' ? x.ruleName : undefined,
    result: x.result ? toApplyResult(x.result) : undefined,
    error: typeof x.error === 'string' ? x.error : undefined
  };
};

const toPuzzleInfo = (raw: unknown): PuzzleInfo => {
  const p = (raw ?? {}) as Record<string, unknown>;
  return {
    id: asString(p.id),
    level: asString(p.level),
    title: asString(p.title),
    subtitle: asString(p.subtitle)
  };
};

export class OcamlAdapter {
  private bridge: BridgeApi;
  private scene: SceneState;

  constructor(demoName = DEFAULT_DEMO) {
    if (!window.StringDiagramsBridge) {
      throw new Error('Missing StringDiagramsBridge. Did you load bridge.bc.js?');
    }
    this.bridge = window.StringDiagramsBridge;
    this.scene = toSceneState(this.bridge.init_demo(demoName));
  }

  listDemos(): PuzzleInfo[] {
    if (!this.bridge.list_demos) return fallbackPuzzles;
    const demos = asArray<unknown>(this.bridge.list_demos()).map(toPuzzleInfo).filter((p) => p.id);
    return demos.length > 0 ? demos : fallbackPuzzles;
  }

  reset(demoName = DEFAULT_DEMO): SceneState {
    this.scene = toSceneState(this.bridge.init_demo(demoName));
    return this.scene;
  }

  getScene(): SceneState {
    this.scene = toSceneState(this.bridge.get_scene());
    return this.scene;
  }

  tutorialDemo(demoName = DEFAULT_DEMO): TutorialDemo {
    if (!this.bridge.tutorial_demo) {
      return { ok: false, error: 'Bridge does not expose tutorial_demo.' };
    }
    return toTutorialDemo(this.bridge.tutorial_demo(demoName));
  }

  evaluateSelection(selection: SelectionDescriptor): RuleAvailability[] {
    return toRuleAvailability(this.bridge.evaluate_selection(selection));
  }

  applyRule(ruleName: string, selection: SelectionDescriptor): ApplyResult {
    const result = toApplyResult(this.bridge.apply_rule(ruleName, selection));
    if (result.ok && result.scene) {
      this.scene = result.scene;
    }
    return result;
  }

  undo(): SceneState {
    this.scene = toSceneState(this.bridge.undo());
    return this.scene;
  }

  redo(): SceneState {
    this.scene = toSceneState(this.bridge.redo());
    return this.scene;
  }

  exportProof(): string {
    return asString(this.bridge.export_proof());
  }

  getMessages(): string[] {
    return asArray<unknown>(this.bridge.get_messages()).map(asString);
  }
}

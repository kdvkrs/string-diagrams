import type {
  ApplyResult,
  PuzzleInfo,
  RuleCandidate,
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
  rule_candidates?: (ruleName: string) => unknown;
  apply_rule: (ruleName: string, selection: unknown) => unknown;
  undo: () => unknown;
  redo: () => unknown;
  export_proof: () => string;
  get_messages: () => unknown;
  render_term?: (formula: string) => unknown;
  render_rule?: (formula: string) => unknown;
};

declare global {
  interface Window {
    StringDiagramsBridge?: BridgeApi;
  }
}

const DEFAULT_DEMO = 'clean-up-two-units';

const fallbackPuzzles: PuzzleInfo[] = [
  {
    id: 'clean-up-two-units',
    level: 'Level 1',
    title: 'Level 1: Clean Up Two Units',
    subtitle: 'A unit wire followed by multiplication disappears. I’ll do the first cleanup; you do the second.'
  },
  {
    id: 'composite-monad-left-unit',
    level: 'Level 2',
    title: 'Level 2: Composite Left Unit',
    subtitle: 'Create an M-wire and an N-wire, cross N past M, then clean up both units.'
  },
  {
    id: 'both-sides-meet',
    level: 'Level 3',
    title: 'Level 3: Make Both Sides Meet',
    subtitle: 'Rewrite both diagrams toward the same middle shape, rather than pushing only one side across.'
  },
  {
    id: 'composite-monad-associativity',
    level: 'Level 4',
    title: 'Level 4: Untangle the Double Fork',
    subtitle: 'Forks move through crossings and then reassociate: the same local moves on a larger diagram.'
  },
  {
    id: 'three-monad-composition',
    level: 'Level 5',
    title: 'Level 5: Three-Color Boss Level',
    subtitle: 'Same game, larger board: three colors of wires, more crossings, same local proof idea.'
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
    proofLines: asArray<unknown>(state.proofLines).map(asString),
    proofText: asString(state.proofText)
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

const toRuleCandidate = (raw: unknown): RuleCandidate => {
  const x = (raw ?? {}) as Record<string, unknown>;
  const graphId = asString(x.graphId) === 'rhs' ? 'rhs' : 'lhs';
  const direction = asString(x.direction) === 'backward' ? 'backward' : 'forward';
  return {
    ruleName: asString(x.ruleName),
    graphId,
    selectedNodeIds: asArray<unknown>(x.selectedNodeIds).map(asString).filter(Boolean),
    direction
  };
};

const toRuleCandidates = (raw: unknown): RuleCandidate[] =>
  asArray<unknown>(raw).map(toRuleCandidate).filter((c) => c.ruleName && c.selectedNodeIds.length > 0);

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
    cycleOrder: asArray<unknown>(x.cycleOrder).map(asString),
    debug: asBoolean(x.debug)
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

  ruleCandidates(ruleName: string): RuleCandidate[] {
    if (!this.bridge.rule_candidates) return [];
    return toRuleCandidates(this.bridge.rule_candidates(ruleName));
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

  renderTerm(formula: string): ReturnType<typeof parseGraph> {
    if (!this.bridge.render_term) throw new Error('render_term not available in this bridge build');
    const raw = this.bridge.render_term(formula) as Record<string, unknown>;
    if (!asBoolean(raw.ok)) throw new Error(asString(raw.error));
    return parseGraph((raw.graph ?? {}) as Record<string, unknown>);
  }

  renderRule(formula: string): { lhs: ReturnType<typeof parseGraph>; rhs: ReturnType<typeof parseGraph> } {
    if (!this.bridge.render_rule) throw new Error('render_rule not available in this bridge build');
    const raw = this.bridge.render_rule(formula) as Record<string, unknown>;
    if (!asBoolean(raw.ok)) throw new Error(asString(raw.error));
    return {
      lhs: parseGraph((raw.lhs ?? {}) as Record<string, unknown>),
      rhs: parseGraph((raw.rhs ?? {}) as Record<string, unknown>),
    };
  }

  getMessages(): string[] {
    return asArray<unknown>(this.bridge.get_messages()).map(asString);
  }
}

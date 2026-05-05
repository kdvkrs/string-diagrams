import type {
  ApplyResult,
  RuleAvailability,
  SceneGraph,
  SceneState,
  SelectionDescriptor
} from '../model/interop';

type BridgeApi = {
  init_demo: (name: string) => unknown;
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

const RULE_NAMES = ['mA', 'nA', 'mx', 'nx'] as const;

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asBoolean = (value: unknown): boolean => Boolean(value);
const asNumber = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0));

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
    title: asString(state.title),
    subtitle: asString(state.subtitle),
    graphs: asArray<Record<string, unknown>>(state.graphs).map(parseGraph),
    rules: asArray<Record<string, unknown>>(state.rules).map((r) => ({
      name: asString(r.name) as (typeof RULE_NAMES)[number],
      lhs: parseGraph((r.lhs ?? {}) as Record<string, unknown>),
      rhs: parseGraph((r.rhs ?? {}) as Record<string, unknown>)
    })),
    messages: asArray<unknown>(state.messages).map(asString),
    proofLines: asArray<unknown>(state.proofLines).map(asString)
  };
};

const toRuleAvailability = (raw: unknown): RuleAvailability[] => {
  const arr = asArray<Record<string, unknown>>(raw);
  if (arr.length === 0) {
    return RULE_NAMES.map((name) => ({ name, enabled: false, reason: 'No selection' }));
  }
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

export class OcamlAdapter {
  private bridge: BridgeApi;
  private scene: SceneState;

  constructor(demoName = 'double-fork') {
    if (!window.StringDiagramsBridge) {
      throw new Error('Missing StringDiagramsBridge. Did you load bridge.bc.js?');
    }
    this.bridge = window.StringDiagramsBridge;
    this.scene = toSceneState(this.bridge.init_demo(demoName));
  }

  reset(demoName = 'double-fork'): SceneState {
    this.scene = toSceneState(this.bridge.init_demo(demoName));
    return this.scene;
  }

  getScene(): SceneState {
    this.scene = toSceneState(this.bridge.get_scene());
    return this.scene;
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

export const RULE_ORDER = RULE_NAMES;

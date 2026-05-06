export type RuleName = string;

export type ScenePoint = {
  x: number;
  y: number;
};

export type SceneNode = {
  id: string;
  kind: 'var' | 'box' | string;
  label: string;
  x: number;
  y: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  nsources: number;
  ntargets: number;
  sourceTypes: string[];
  targetTypes: string[];
  visual: {
    shape?: string;
    radius?: number;
    size?: ScenePoint;
  };
  color: string;
  selectable: boolean;
};

export type PortRef =
  | { kind: 'source'; index: number }
  | { kind: 'target'; index: number }
  | { kind: 'nodeSource'; nodeId: string; port: number }
  | { kind: 'nodeTarget'; nodeId: string; port: number }
  | Record<string, unknown>;

export type SceneEdge = {
  id: string;
  from: PortRef;
  to: PortRef;
  curve?: ScenePoint[];
  color: string;
};

export type SceneGraph = {
  id: string;
  nodes: SceneNode[];
  edges: SceneEdge[];
  sources: number;
  targets: number;
};

export type SceneState = {
  puzzleId: string;
  level: string;
  title: string;
  subtitle: string;
  graphs: SceneGraph[];
  rules: SceneRule[];
  messages: string[];
  proofLines: string[];
};

export type SceneRule = {
  name: RuleName;
  lhs: SceneGraph;
  rhs: SceneGraph;
};

export type SelectionCut = {
  edgeId: string;
  side: 'source' | 'target';
  t: number;
};

export type SelectionDescriptor = {
  graphId: string;
  selectedNodeIds: string[];
  polygon: ScenePoint[];
  cuts: SelectionCut[];
  cycleOrder: string[];
};

export type RuleAvailability = {
  name: RuleName;
  enabled: boolean;
  reason?: string;
};

export type ApplyResult = {
  ok: boolean;
  scene?: SceneState;
  proofDelta?: string[];
  error?: string;
};

export type TutorialDemo = {
  ok: boolean;
  initialScene?: SceneState;
  selection?: SelectionDescriptor;
  ruleName?: string;
  result?: ApplyResult;
  error?: string;
};

export type PuzzleInfo = {
  id: string;
  level: string;
  title: string;
  subtitle: string;
};

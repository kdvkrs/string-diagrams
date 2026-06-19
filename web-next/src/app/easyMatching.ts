import type { LayoutGraph } from '../layout/layoutTypes';
import type { PortRef, RuleCandidate, SceneGraph, SceneRule, SelectionDescriptor } from '../model/interop';
import type { Point, Rect, View } from '../diagramSvg';
import type { EasyRuleSlot, PanelMap, RuleDisplayItem } from './config';

export type RuleFamilyLabels = {
  forkReassociation: string;
  pushForkThroughCrossing: string;
};

type CandidateHit = {
  candidate: RuleCandidate;
  rect: Rect;
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

const ruleFamilyLabel = (ruleNames: string[], labels: RuleFamilyLabels) => {
  if (ruleNames.length > 0 && ruleNames.every((name) => ['mA', 'nA', 'mm', 'nn', 'oo'].includes(name))) {
    return labels.forkReassociation;
  }
  if (
    ruleNames.length > 0 &&
    ruleNames.every((name) => ['mx', 'nx', 'ny', 'oy', 'mz', 'oz'].includes(name))
  ) {
    return labels.pushForkThroughCrossing;
  }
  return null;
};

const simpleRuleLabel = (ruleNames: string[], labels: RuleFamilyLabels) => {
  const familyLabel = ruleFamilyLabel(ruleNames, labels);
  if (familyLabel) return familyLabel;
  if (ruleNames.length <= 2) return ruleNames.join('/');
  return `${ruleNames[0]} +${ruleNames.length - 1}`;
};

const easySlotForRule = (slots: EasyRuleSlot[], ruleName: string) =>
  slots.find((slot) => slot.ruleNames.includes(ruleName));

export const ruleDisplayItems = ({
  expertMode,
  sceneRules,
  easyRuleSlots,
  puzzleIntroduced,
  labels
}: {
  expertMode: boolean;
  sceneRules: SceneRule[];
  easyRuleSlots: EasyRuleSlot[];
  puzzleIntroduced: (puzzleId: string) => boolean;
  labels: RuleFamilyLabels;
}): RuleDisplayItem[] => {
  if (expertMode) {
    return sceneRules.map((rule) => ({
      key: `rule:${rule.name}`,
      label: rule.name,
      representativeName: rule.name,
      ruleNames: [rule.name],
      rules: [rule]
    }));
  }

  const groups = new Map<string, SceneRule[]>();
  sceneRules.forEach((rule) => {
    const key = canonicalRuleKey(rule);
    const bucket = groups.get(key) ?? [];
    bucket.push(rule);
    groups.set(key, bucket);
  });

  const consumed = new Set<string>();
  const slots = easyRuleSlots.filter((slot) => puzzleIntroduced(slot.introducedAt)).map((slot) => {
    const rulesInSlot = sceneRules.filter((rule) => slot.ruleNames.includes(rule.name));
    rulesInSlot.forEach((rule) => consumed.add(canonicalRuleKey(rule)));
    const ruleNames = rulesInSlot.map((rule) => rule.name);
    return {
      key: `slot:${slot.key}`,
      label: slot.label(),
      representativeName: ruleNames[0] ?? slot.representativeName,
      ruleNames,
      rules: rulesInSlot,
      previewFormula: slot.previewFormula
    };
  });

  const extraGroups = Array.from(groups.entries()).filter(([key, group]) => {
    if (consumed.has(key)) return false;
    return !group.some((rule) => easySlotForRule(easyRuleSlots, rule.name));
  }).map(([key, group]) => {
    const ruleNames = group.map((rule) => rule.name);
    return {
      key: `group:${key}`,
      label: simpleRuleLabel(ruleNames, labels),
      representativeName: ruleNames[0],
      ruleNames,
      rules: group
    };
  });

  return [...slots, ...extraGroups];
};

export const candidateKey = (candidate: RuleCandidate) =>
  `${candidate.ruleName}|${candidate.graphId}|${candidate.direction}|${[...candidate.selectedNodeIds].sort().join(',')}`;

export const uniqueRuleCandidates = (ruleNames: string[], candidatesForRule: (ruleName: string) => RuleCandidate[]) => {
  const seen = new Set<string>();
  return ruleNames.flatMap((ruleName) =>
    candidatesForRule(ruleName).filter((candidate) => {
      const key = candidateKey(candidate);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  );
};

export const selectionFromCandidate = (candidate: RuleCandidate): SelectionDescriptor => ({
  graphId: candidate.graphId,
  selectedNodeIds: [...candidate.selectedNodeIds],
  polygon: [],
  cuts: [],
  cycleOrder: []
});

export const candidateRect = ({
  candidate,
  layouts,
  panels,
  viewForLayout,
  screenNodeRect
}: {
  candidate: RuleCandidate;
  layouts: Map<string, LayoutGraph>;
  panels: PanelMap;
  viewForLayout: (g: LayoutGraph, panel: Rect) => View;
  screenNodeRect: (node: LayoutGraph['nodes'][number], view: View) => Rect;
}): Rect | null => {
  const layout = layouts.get(candidate.graphId);
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

export const candidateHitsAt = ({
  point,
  panels,
  candidates,
  layouts,
  viewForLayout,
  screenNodeRect,
  inPanel
}: {
  point: Point;
  panels: PanelMap;
  candidates: RuleCandidate[];
  layouts: Map<string, LayoutGraph>;
  viewForLayout: (g: LayoutGraph, panel: Rect) => View;
  screenNodeRect: (node: LayoutGraph['nodes'][number], view: View) => Rect;
  inPanel: (p: Point, r: Rect) => boolean;
}): CandidateHit[] =>
  candidates
    .map((candidate) => ({
      candidate,
      rect: candidateRect({ candidate, layouts, panels, viewForLayout, screenNodeRect })
    }))
    .filter((entry): entry is CandidateHit => Boolean(entry.rect && inPanel(point, entry.rect)))
    .sort((a, b) => (a.rect.w * a.rect.h) - (b.rect.w * b.rect.h));

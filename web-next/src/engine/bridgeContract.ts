export type BridgeApi = BridgeSessionApi &
  BridgeRuleApi &
  BridgeHistoryApi &
  BridgeProofApi &
  BridgeRenderingApi &
  BridgeTutorialApi;

export type BridgeSessionApi = {
  init_demo: (name: string) => unknown;
  get_scene: () => unknown;
  list_demos?: () => unknown;
};

export type BridgeRuleApi = {
  evaluate_selection: (selection: unknown) => unknown;
  apply_rule: (ruleName: string, selection: unknown) => unknown;
  rule_candidates?: (ruleName: string) => unknown;
};

export type BridgeHistoryApi = {
  undo: () => unknown;
  redo: () => unknown;
};

export type BridgeProofApi = {
  export_proof: () => string;
  get_messages: () => unknown;
};

export type BridgeRenderingApi = {
  render_term?: (formula: string) => unknown;
  render_rule?: (formula: string) => unknown;
};

export type BridgeTutorialApi = {
  tutorial_demo?: (name: string) => unknown;
};

export type BridgeCapabilities = {
  listDemos: boolean;
  ruleCandidates: boolean;
  renderRule: boolean;
  renderTerm: boolean;
  tutorialDemo: boolean;
};

export const bridgeCapabilities = (bridge: BridgeApi): BridgeCapabilities => ({
  listDemos: typeof bridge.list_demos === 'function',
  ruleCandidates: typeof bridge.rule_candidates === 'function',
  renderRule: typeof bridge.render_rule === 'function',
  renderTerm: typeof bridge.render_term === 'function',
  tutorialDemo: typeof bridge.tutorial_demo === 'function'
});

declare global {
  interface Window {
    StringDiagramsBridge?: BridgeApi;
  }
}

type Metric = {
  count: number;
  total: number;
  max: number;
};

export type PerfRow = {
  name: string;
  count: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
};

const buildEnabled = import.meta.env.VITE_ENABLE_PERF === '1';
const params = new URLSearchParams(window.location.search);
const hasPerfParam = params.has('perf');

let enabled = buildEnabled && (
  hasPerfParam ||
  window.localStorage.getItem('sdPerf') === '1'
);
let debugCrossings = enabled && (
  params.has('debugCrossings') ||
  (!hasPerfParam && window.localStorage.getItem('sdDebugCrossings') === '1')
);
let debugSelection = enabled && (
  params.has('debugSelection') ||
  (!hasPerfParam && window.localStorage.getItem('sdDebugSelection') === '1')
);

const metrics = new Map<string, Metric>();

const metricFor = (name: string) => {
  const existing = metrics.get(name);
  if (existing) return existing;
  const created = { count: 0, total: 0, max: 0 };
  metrics.set(name, created);
  return created;
};

const record = (name: string, ms: number) => {
  if (!enabled) return;
  const m = metricFor(name);
  m.count += 1;
  m.total += ms;
  m.max = Math.max(m.max, ms);
};

const count = (name: string, amount = 1) => {
  if (!enabled) return;
  const m = metricFor(name);
  m.count += amount;
};

const begin = (name: string) => {
  if (!enabled) return () => {};
  const start = performance.now();
  return () => record(name, performance.now() - start);
};

const time = <T>(name: string, fn: () => T): T => {
  const end = begin(name);
  try {
    return fn();
  } finally {
    end();
  }
};

const reset = () => {
  metrics.clear();
};

const snapshot = (): PerfRow[] =>
  Array.from(metrics.entries())
    .map(([name, m]) => ({
      name,
      count: m.count,
      totalMs: Number(m.total.toFixed(2)),
      avgMs: Number((m.total / Math.max(1, m.count)).toFixed(3)),
      maxMs: Number(m.max.toFixed(3))
    }))
    .sort((a, b) => b.totalMs - a.totalMs);

const report = () => {
  const rows = snapshot();
  console.table(rows);
  return rows;
};

const setEnabled = (next: boolean) => {
  if (!buildEnabled) {
    console.info('PuzzlePerf was not included in this build. Rebuild with VITE_ENABLE_PERF=1.');
    return false;
  }
  enabled = next;
  if (!enabled) {
    debugCrossings = false;
    debugSelection = false;
  }
  window.localStorage.setItem('sdPerf', next ? '1' : '0');
  console.info(`PuzzlePerf ${next ? 'enabled' : 'disabled'}.`);
  return enabled;
};

const setDebugCrossings = (next: boolean) => {
  if (!setEnabled(enabled || next)) return false;
  debugCrossings = enabled && next;
  window.localStorage.setItem('sdDebugCrossings', debugCrossings ? '1' : '0');
  console.info(`PuzzlePerf crossing diagnostics ${debugCrossings ? 'enabled' : 'disabled'}.`);
  return debugCrossings;
};

const setDebugSelection = (next: boolean) => {
  if (!setEnabled(enabled || next)) return false;
  debugSelection = enabled && next;
  window.localStorage.setItem('sdDebugSelection', debugSelection ? '1' : '0');
  console.info(`PuzzlePerf selection fallback diagnostics ${debugSelection ? 'enabled' : 'disabled'}.`);
  return debugSelection;
};

export const perf = {
  get enabled() {
    return enabled;
  },
  get buildEnabled() {
    return buildEnabled;
  },
  get debugCrossings() {
    return debugCrossings;
  },
  get debugSelection() {
    return debugSelection;
  },
  begin,
  count,
  record,
  report,
  reset,
  setDebugCrossings,
  setDebugSelection,
  setEnabled,
  snapshot,
  time
};

declare global {
  interface Window {
    PuzzlePerf?: typeof perf;
  }
}

if (buildEnabled) {
  window.PuzzlePerf = perf;
  if (enabled) {
    console.info('PuzzlePerf enabled. Use PuzzlePerf.report(), PuzzlePerf.reset(), PuzzlePerf.setDebugCrossings(true), or PuzzlePerf.setDebugSelection(true).');
  } else {
    console.info('PuzzlePerf available. Use PuzzlePerf.setEnabled(true), localStorage.sdPerf=1, or ?perf=1.');
  }
}

import { perf } from '../perf';
import type { Translations } from '../i18n';
import type { CrossingDiagnostic } from './config';

export const createPerfPanel = ({
  panel,
  output,
  getCrossings,
  t
}: {
  panel: HTMLElement;
  output: HTMLPreElement;
  getCrossings: () => CrossingDiagnostic[];
  t: Translations;
}) => {
  let timer: number | undefined;

  const formatRows = () => {
    const rows = perf.snapshot();
    const debugCrossings = getCrossings();
    const crossingLine = perf.debugCrossings
      ? `unintended crossings: ${debugCrossings.length}`
      : 'unintended crossings: off';
    const selectionLine = `selection fallback debug: ${perf.debugSelection ? 'on' : 'off'}`;
    if (rows.length === 0) return `No samples yet. Lasso or apply a rewrite.\n${crossingLine}\n${selectionLine}`;
    const head = 'name                         count   total    avg    max';
    const body = rows.slice(0, 14).map((row) => [
      row.name.padEnd(28).slice(0, 28),
      String(row.count).padStart(5),
      `${row.totalMs.toFixed(1)}ms`.padStart(8),
      `${row.avgMs.toFixed(3)}ms`.padStart(8),
      `${row.maxMs.toFixed(1)}ms`.padStart(7)
    ].join(' '));
    const crossingDetails = debugCrossings.slice(0, 6).map((c) => `  ${c.graphId}: ${c.edgeA} × ${c.edgeB}`);
    return [crossingLine, selectionLine, ...crossingDetails, '', head, ...body].join('\n');
  };

  const update = () => {
    if (!perf.enabled || panel.hidden) return;
    output.textContent = formatRows();
  };

  const show = () => {
    if (!perf.enabled) return;
    panel.hidden = false;
    update();
    window.clearInterval(timer);
    timer = window.setInterval(update, 1000);
  };

  const hide = () => {
    panel.hidden = true;
    window.clearInterval(timer);
    timer = undefined;
  };

  const copyReport = () => {
    const text = JSON.stringify(perf.snapshot(), null, 2);
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    output.textContent = `${formatRows()}\n\n${t.copiedJson}`;
  };

  return { copyReport, hide, show, update };
};

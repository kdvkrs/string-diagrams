import { OcamlAdapter } from './engine/ocamlAdapter';
import { layoutSceneGraph } from './layout/physicsLayout';
import { termPreviewSvg, rulePreviewSvg, type SvgOpts } from './diagramSvg';
import { getInitialLocale, storeLocale, supportedLocales, switchLocale, translations, type Locale } from './i18n';

const locale: Locale = getInitialLocale();
const t = translations[locale];

storeLocale(locale);
document.documentElement.lang = locale;
document.title = t.rendererTitle;

const adapter = new OcamlAdapter();

const setText = (id: string, value: string) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

const formulaEl = document.querySelector<HTMLTextAreaElement>('#formula')!;
const widthInput = document.querySelector<HTMLInputElement>('#width-input')!;
const heightInput = document.querySelector<HTMLInputElement>('#height-input')!;
const renderBtn = document.querySelector<HTMLButtonElement>('#render-btn')!;
const outputInner = document.querySelector<HTMLDivElement>('#output-inner')!;
const errorEl = document.querySelector<HTMLDivElement>('#error')!;
const copySvgBtn = document.querySelector<HTMLButtonElement>('#copy-svg-btn')!;
const downloadBtn = document.querySelector<HTMLButtonElement>('#download-btn')!;
const showLabelsEl = document.querySelector<HTMLInputElement>('#show-labels')!;
const transparentBgEl = document.querySelector<HTMLInputElement>('#transparent-bg')!;
const localeActions = document.querySelector<HTMLSelectElement>('#locale-actions')!;
const modeInputs = document.querySelectorAll<HTMLInputElement>('input[name="mode"]');

setText('renderer-title', t.rendererTitle);
setText('language-label', t.languageLabel);
setText('mode-label', t.renderer.mode);
setText('single-diagram-label', t.renderer.singleDiagram);
setText('rewrite-rule-label', t.renderer.rewriteRule);
setText('show-labels-label', t.renderer.showLabels);
setText('transparent-bg-label', t.renderer.transparentBg);
setText('formula-label', t.renderer.formula);
setText('preview-label', t.renderer.preview);
setText('preview-placeholder', t.renderer.clickRender);
renderBtn.textContent = t.renderer.render;
copySvgBtn.textContent = t.renderer.copySvg;
downloadBtn.textContent = t.renderer.downloadSvg;
localeActions.replaceChildren(
  ...supportedLocales.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = translations[value].languageName;
    option.selected = value === locale;
    return option;
  })
);

const EXAMPLES = {
  term: `m: M⊗M -> M\ne: 1 -> M\n------\ne·M ; m`,
  rule: `m: M⊗M -> M\ne: 1 -> M\n------\ne·M ; m = M`,
};

let lastSvg = '';

const getMode = () => [...modeInputs].find((r) => r.checked)?.value ?? 'term';

const render = async () => {
  errorEl.textContent = '';
  renderBtn.disabled = true;
  renderBtn.textContent = t.renderer.rendering;
  try {
    const width = Math.max(80, parseInt(widthInput.value, 10) || 220);
    const height = Math.max(60, parseInt(heightInput.value, 10) || 140);
    const opts: SvgOpts = { showLabels: showLabelsEl.checked, transparent: transparentBgEl.checked };
    const mode = getMode();

    if (mode === 'rule') {
      const { lhs, rhs } = adapter.renderRule(formulaEl.value);
      const [lhsLayout, rhsLayout] = await Promise.all([layoutSceneGraph(lhs), layoutSceneGraph(rhs)]);
      lastSvg = rulePreviewSvg({ lhs: lhsLayout, rhs: rhsLayout }, width, height, false, opts);
    } else {
      const sceneGraph = adapter.renderTerm(formulaEl.value);
      const layoutGraph = await layoutSceneGraph(sceneGraph);
      lastSvg = termPreviewSvg(layoutGraph, width, height, opts);
    }

    outputInner.innerHTML = lastSvg;
    copySvgBtn.style.display = '';
    downloadBtn.style.display = '';
  } catch (e) {
    errorEl.textContent = e instanceof Error ? e.message : String(e);
    outputInner.innerHTML = `<span style="color:#8da0b3;font-size:0.85rem">${t.renderer.errorSeeMessage}</span>`;
    lastSvg = '';
    copySvgBtn.style.display = 'none';
    downloadBtn.style.display = 'none';
  } finally {
    renderBtn.disabled = false;
    renderBtn.textContent = t.renderer.render;
  }
};

modeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    const mode = getMode() as keyof typeof EXAMPLES;
    if (formulaEl.value.trim() === EXAMPLES[mode === 'rule' ? 'term' : 'rule'].trim()) {
      formulaEl.value = EXAMPLES[mode];
    }
  });
});

renderBtn.addEventListener('click', () => { void render(); });
localeActions.addEventListener('change', () => {
  const nextLocale = localeActions.value;
  if (nextLocale === 'en' || nextLocale === 'de') switchLocale(nextLocale);
});
formulaEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { void render(); }
});

copySvgBtn.addEventListener('click', () => {
  void navigator.clipboard.writeText(lastSvg);
});

downloadBtn.addEventListener('click', () => {
  const blob = new Blob([lastSvg], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'diagram.svg';
  a.click();
  URL.revokeObjectURL(a.href);
});

import type { PuzzleInfo } from '../model/interop';
import type { Translations } from '../i18n';

export const displayPuzzleTitle = (puzzle: PuzzleInfo) => puzzle.title.replace(new RegExp(`^${puzzle.level}:\\s*`), '');

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const highlightRocqLine = (line: string) => {
  if (/^\s*\(\*/.test(line)) return `<span class="rocq-comment">${escapeHtml(line)}</span>`;
  let out = escapeHtml(line);
  out = out.replace(/\b(Goal|Proof|Qed|transitivity|rewrite|reflexivity|mcat)\b/g, '<span class="rocq-keyword">$1</span>');
  out = out.replace(/\b(R\d+)\b/g, '<span class="rocq-rule">$1</span>');
  return out;
};

export const highlightRocq = (script: string) => script.split('\n').map(highlightRocqLine).join('\n');

export const proofFileName = (puzzle: PuzzleInfo | undefined, sceneTitle: string) => {
  const label = puzzle ? `${puzzle.level} ${displayPuzzleTitle(puzzle)}` : sceneTitle || 'string diagram proof';
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'string-diagram-proof';
  return `${slug}.v`;
};

export const shareProofText = async ({
  proofText,
  title,
  fileName,
  t
}: {
  proofText: string;
  title: string;
  fileName: string;
  t: Translations;
}): Promise<string> => {
  const file = new File([proofText], fileName, { type: 'text/plain' });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
  };

  try {
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ title, text: t.proofShareText, files: [file] });
      return t.shareSheetOpened;
    }
    if (nav.share) {
      await nav.share({ title, text: proofText });
      return t.shareSheetOpened;
    }
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'AbortError') return '';
  }

  try {
    await navigator.clipboard.writeText(proofText);
    return t.proofCopied;
  } catch {
    return t.shareUnavailable;
  }
};

import { MODE_STORAGE_KEY, type InteractionMode } from './config';

export const initialInteractionMode = (): InteractionMode =>
  window.localStorage.getItem(MODE_STORAGE_KEY) === 'expert' ? 'expert' : 'easy';

export const storeInteractionMode = (mode: InteractionMode) => {
  window.localStorage.setItem(MODE_STORAGE_KEY, mode);
};

export const syncModeControls = ({
  expertToggle,
  mode
}: {
  expertToggle: HTMLButtonElement;
  mode: InteractionMode;
}) => {
  const expertMode = mode === 'expert';
  expertToggle.setAttribute('aria-pressed', String(expertMode));
  expertToggle.dataset.active = String(expertMode);
  document.querySelectorAll<HTMLButtonElement>('[data-action="welcome-mode"]').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.dataset.active = String(active);
    button.setAttribute('aria-pressed', String(active));
  });
};

export type SelectionFeedbackController = {
  hide: () => void;
  show: (message: string) => void;
};

export const createSelectionFeedback = ({
  element,
  isSuppressed,
  timeoutMs = 2600
}: {
  element: HTMLElement;
  isSuppressed: () => boolean;
  timeoutMs?: number;
}): SelectionFeedbackController => {
  let timer = 0;

  const hide = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    element.removeAttribute('data-show');
  };

  const show = (message: string) => {
    if (isSuppressed()) return;
    if (timer) window.clearTimeout(timer);
    element.textContent = message;
    element.setAttribute('data-show', 'true');
    timer = window.setTimeout(hide, timeoutMs);
  };

  return { hide, show };
};

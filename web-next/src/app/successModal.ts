export const renderSuccessModal = ({
  successModal,
  successFinalBody,
  hasNext,
  nextLabel,
  finalBodyHtml,
  bonusBodyHtml,
  isBonus
}: {
  successModal: HTMLElement;
  successFinalBody: HTMLElement;
  hasNext: boolean;
  nextLabel: string;
  finalBodyHtml: string;
  bonusBodyHtml: string;
  isBonus: boolean;
}) => {
  const nextButton = successModal.querySelector<HTMLButtonElement>('[data-action="next-level"]');
  successModal.toggleAttribute('data-final', !hasNext);
  successFinalBody.innerHTML = isBonus ? bonusBodyHtml : finalBodyHtml;
  if (nextButton) {
    nextButton.hidden = !hasNext;
    nextButton.textContent = nextLabel;
  }
  successModal.setAttribute('data-open', 'true');
};

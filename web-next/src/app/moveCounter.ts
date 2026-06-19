export type MoveCounterController = {
  reset: () => void;
  bump: () => void;
};

export const createMoveCounter = ({
  count,
  counter
}: {
  count: HTMLElement | null;
  counter: HTMLElement | null;
}): MoveCounterController => {
  let moves = 0;

  const reset = () => {
    moves = 0;
    if (count) count.textContent = '0';
    counter?.removeAttribute('data-shown');
  };

  const bump = () => {
    moves += 1;
    if (count) count.textContent = String(moves);
    counter?.setAttribute('data-shown', 'true');
  };

  return { reset, bump };
};

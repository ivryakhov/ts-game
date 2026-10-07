/**
 * Кнопки под итогом матча: переиграть тот же Сид, повторить тот же матч
 * с теми же Выпусками, вернуться на Подготовку или начать с новым Сидом. Цикл «поправил — проверил» должен быть
 * коротким, иначе Правила никто не станет доводить.
 */
export interface OutcomeActions {
  /** `showcase` — Показательный матч: Выпусков игрока в нём нет, повторять нечего. */
  show(visible: boolean, showcase?: boolean): void;
}

export interface OutcomeHandlers {
  /** Тот же Сид, те же Правила. */
  replay(): void;
  /** Тот же Сид и те же Выпуски игрока: Юниты выходят сами. */
  repeat(): void;
  /** На Подготовку с тем же Сидом. */
  edit(): void;
  /** Тот же матч, но с новым Сидом. */
  newSeed(): void;
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`В разметке нет элемента #${id}`);
  return found;
}

export function bindOutcomeActions(handlers: OutcomeHandlers): OutcomeActions {
  const box = element('outcome-actions');
  const review = element('outcome-review');
  const repeat = element('outcome-repeat');

  const bind = (id: string, act: () => void): void => {
    const button = element(id);
    button.addEventListener('click', () => {
      // Нажатая кнопка не должна держать фокус: иначе пробел, которым
      // ставят паузу, нажимал бы её снова.
      button.blur();
      act();
    });
  };

  bind('outcome-replay', handlers.replay);
  bind('outcome-repeat', handlers.repeat);
  bind('outcome-edit', handlers.edit);
  bind('outcome-new-seed', handlers.newSeed);

  return {
    show(visible, showcase = false): void {
      box.hidden = !visible;
      repeat.hidden = showcase;
      review.hidden = !visible;
    },
  };
}

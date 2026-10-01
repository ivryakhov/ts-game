import type { Pacer } from './pacer.js';

/**
 * Клавиши управления временем. Работают только в матче.
 *
 * Цифры 1-4 намеренно не заняты: они уйдут под выбор типа Юнита
 * в тикете 08, и переучивать руки потом будет дороже.
 */
export function bindTimeControls(pacer: Pacer, active: () => boolean): void {
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    // На Подготовке времени нет: пробел там нажимает кнопки, а минус
    // и цифры набирают Сид.
    if (event.repeat || !active()) return;

    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      pacer.paused = !pacer.paused;
      return;
    }

    switch (event.key) {
      case '-':
      case '_':
        pacer.slower();
        return;
      case '=':
      case '+':
        pacer.faster();
        return;
      default:
        return;
    }
  });
}

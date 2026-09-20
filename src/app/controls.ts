import type { Pacer } from './pacer.js';

/**
 * Клавиши управления временем.
 *
 * Цифры 1-4 намеренно не заняты: они уйдут под выбор типа Юнита
 * в тикете 08, и переучивать руки потом будет дороже.
 */
export function bindTimeControls(pacer: Pacer): void {
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.repeat) return;

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

import { TICKS_PER_SECOND } from '@sim/index';
import type { SideId } from '@sim/index';
import type { Speed } from '../app/pacer.js';

/**
 * Надпись поверх поля: время матча, темп и Сид.
 *
 * Разметка лежит в index.html, здесь — только обновление текста: HUD
 * ничего не решает и ни на что не влияет, он лишь показывает состояние.
 */
export interface Hud {
  update(state: { tick: number; speed: Speed; paused: boolean; seed: number }): void;
  /** Объявить исход. Победитель null означает, что время вышло вничью. */
  announce(outcome: { winner: SideId | null; tick: number } | null): void;
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`В разметке нет элемента #${id}`);
  return found;
}

/** Время матча из номера Тика: реальные часы тут ни при чём (ADR-0001). */
export function formatMatchTime(tick: number): string {
  const totalSeconds = Math.floor(tick / TICKS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function createHud(): Hud {
  const clock = element('hud-clock');
  const speed = element('hud-speed');
  const seed = element('hud-seed');
  const outcome = element('hud-outcome');

  return {
    update(state): void {
      clock.textContent = formatMatchTime(state.tick);
      speed.textContent = state.paused ? `×${state.speed} пауза` : `×${state.speed}`;
      speed.classList.toggle('hud__paused', state.paused);
      seed.textContent = String(state.seed);
    },

    announce(result): void {
      outcome.classList.toggle('hud__outcome--shown', result !== null);
      if (!result) return;

      const headline = result.winner ? `Победа Стороны ${result.winner}` : 'Время вышло';
      outcome.innerHTML = '';
      outcome.append(headline);
      const detail = document.createElement('small');
      detail.textContent = `матч длился ${formatMatchTime(result.tick)}`;
      outcome.append(detail);
    },
  };
}

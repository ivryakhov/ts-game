import { TICKS_PER_SECOND } from '@sim/index';
import type { Speed } from '../app/pacer.js';

/**
 * Надпись поверх поля: время матча, темп и Сид.
 *
 * Разметка лежит в index.html, здесь — только обновление текста: HUD
 * ничего не решает и ни на что не влияет, он лишь показывает состояние.
 */
export interface Hud {
  update(state: { tick: number; speed: Speed; paused: boolean; seed: number }): void;
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

  return {
    update(state): void {
      clock.textContent = formatMatchTime(state.tick);
      speed.textContent = state.paused ? `×${state.speed} пауза` : `×${state.speed}`;
      speed.classList.toggle('hud__paused', state.paused);
      seed.textContent = String(state.seed);
    },
  };
}

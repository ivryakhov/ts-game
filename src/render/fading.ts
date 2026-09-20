import type { UnitId, UnitSnapshot } from '@sim/index';
import { UNIT_VISUAL } from './visual-contract.js';

/**
 * Погибшие Юниты, чьё схлопывание ещё доигрывается на экране.
 *
 * Мир убирает Юнита в тот же Тик, когда он погиб, поэтому показ обязан
 * помнить его сам. Помнит он только погибших: Юнит, дошедший до чужой
 * Цитадели, исчезает без прощальной анимации — иначе каждое прибытие
 * выглядело бы как смерть.
 */
export interface Fading {
  /** Запомнить погибших этого Тика. */
  remember(units: readonly UnitSnapshot[], deaths: ReadonlySet<UnitId>, atMs: number): void;
  /** Погибшие, которых ещё видно, с остатком их видимости от 1 до 0. */
  visible(nowMs: number): readonly { unit: UnitSnapshot; progress: number; fade: number }[];
}

export function createFading(): Fading {
  const gone = new Map<UnitId, { unit: UnitSnapshot; progress: number; sinceMs: number }>();

  return {
    remember(units, deaths, atMs): void {
      for (const unit of units) {
        if (!deaths.has(unit.id) || gone.has(unit.id)) continue;
        gone.set(unit.id, { unit, progress: unit.progress, sinceMs: atMs });
      }
    },

    visible(nowMs): readonly { unit: UnitSnapshot; progress: number; fade: number }[] {
      const alive: { unit: UnitSnapshot; progress: number; fade: number }[] = [];

      for (const [id, dead] of gone) {
        const age = nowMs - dead.sinceMs;
        if (age < 0 || age > UNIT_VISUAL.fadeMs) {
          gone.delete(id);
          continue;
        }
        alive.push({ unit: dead.unit, progress: dead.progress, fade: 1 - age / UNIT_VISUAL.fadeMs });
      }

      return alive;
    },
  };
}

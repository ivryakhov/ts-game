import type { Seed } from './types.js';

/**
 * Детерминированный источник случайности (ADR-0001).
 *
 * Симуляция не имеет права обращаться к Math.random: тогда матч перестаёт
 * воспроизводиться по Сиду, а баг, который нельзя воспроизвести, нельзя
 * и починить — именно на таком баге была заброшена январская попытка.
 */
export interface Rng {
  /** Следующее число в полуинтервале [0, 1). */
  next(): number;
  /** Следующее целое в полуинтервале [0, bound). */
  nextInt(bound: number): number;
  /** Сколько выборок сделано с момента создания. */
  readonly draws: number;
}

/**
 * mulberry32 — 32-битный генератор с периодом 2^32. Выбран за то, что он
 * умещается в несколько строк и не тянет зависимостей: качество
 * распределения здесь важно меньше, чем воспроизводимость.
 */
export function createRng(seed: Seed): Rng {
  let state = seed >>> 0;
  let draws = 0;

  const next = (): number => {
    draws += 1;
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextInt: (bound: number): number => Math.floor(next() * bound),
    get draws() {
      return draws;
    },
  };
}

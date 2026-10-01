import type { Seed } from '@sim/index';

/**
 * Сид глазами интерфейса: как он читается из текста и как выбирается
 * новый.
 *
 * Случайность здесь допустима: новый Сид выбирает интерфейс, а не
 * симуляция. Сам матч по-прежнему целиком определяется Сидом (ADR-0001),
 * и Сид виден игроку — матч можно повторить.
 */

/** Сид из текста: целое неотрицательное число, иначе null. */
export function parseSeed(text: string | null): Seed | null {
  if (text === null || text.trim() === '') return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Новый Сид, заведомо не равный прежнему. */
export function freshSeed(previous: Seed): Seed {
  const next = Math.floor(Math.random() * 1_000_000);
  return next === previous ? next + 1 : next;
}

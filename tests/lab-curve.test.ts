import { describe, it, expect } from 'vitest';
import { niceTicks } from '../src/lab/curve.js';

/** Деления оси кривой Оценки (тикет 30). */
describe('деления оси', () => {
  it.each([
    [-2697, 4542],
    [0, 13683],
    [-4767, 0],
    [1, 30],
    [1, 2],
    [-310, -310],
    [-0.2, 0],
    [0, 0],
    [-1127.5, 2430.25],
    [0.4, 0.6],
  ])('охватывают данные от %d до %d целиком, без повторов, целыми', (low, high) => {
    const ticks = niceTicks(low, high);

    expect(ticks[0]).toBeLessThanOrEqual(low);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(high);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.length).toBeLessThanOrEqual(7);
    expect(new Set(ticks).size).toBe(ticks.length);
    for (const tick of ticks) expect(Number.isInteger(tick)).toBe(true);
  });

  it('шаг круглый: 1, 2 или 5 на порядок', () => {
    const ticks = niceTicks(-2697, 4542);
    const step = (ticks[1] ?? 0) - (ticks[0] ?? 0);

    expect([1, 2, 5].map((factor) => factor * 10 ** Math.floor(Math.log10(step)))).toContain(step);
    expect(ticks).toContain(0);
  });
});

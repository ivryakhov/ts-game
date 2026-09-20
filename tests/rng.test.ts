import { describe, it, expect } from 'vitest';
import { createRng } from '../src/sim/rng.js';

/**
 * Единственное исключение из правила «один сейм — runMatch».
 *
 * Генератор не входит в публичную границу ядра и импортируется здесь
 * напрямую, как внутренность. Исключение сделано потому, что до появления
 * первой случайности (тикет 05) его корректность не наблюдаема через матч,
 * а ошибка в нём проявится как необъяснимое поведение Стычки — ровно тот
 * класс багов, на котором была заброшена январская попытка.
 * Обоснование записано в спеке 0001, раздел «Testing Decisions».
 */

describe('генератор случайных чисел', () => {
  it('выдаёт одинаковую последовательность для одного Сида', () => {
    const first = createRng(42);
    const second = createRng(42);

    const a = [first.next(), first.next(), first.next()];
    const b = [second.next(), second.next(), second.next()];

    expect(a).toEqual(b);
  });

  it('выдаёт разные последовательности для разных Сидов', () => {
    const a = createRng(1);
    const b = createRng(2);

    expect([a.next(), a.next()]).not.toEqual([b.next(), b.next()]);
  });

  it('держится в полуинтервале от нуля до единицы', () => {
    const rng = createRng(12345);

    for (let i = 0; i < 1000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('считает сделанные выборки', () => {
    const rng = createRng(7);

    rng.next();
    rng.next();
    rng.nextInt(10);

    expect(rng.draws).toBe(3);
  });

  it('выдаёт целое в заданном диапазоне, не выходя за границы', () => {
    const rng = createRng(99);
    const seen = new Set<number>();

    for (let i = 0; i < 500; i += 1) {
      const value = rng.nextInt(4);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(4);
      seen.add(value);
    }

    expect(seen.size).toBe(4);
  });

  it('не выдаёт подряд одно и то же значение тысячу раз', () => {
    const rng = createRng(3);
    const values = new Set<number>();

    for (let i = 0; i < 1000; i += 1) values.add(rng.next());

    expect(values.size).toBeGreaterThan(900);
  });
});

import { describe, it, expect } from 'vitest';
import type { Birth } from '../src/evolve/birth.js';
import { birthSummary, mutationsCount, shortName } from '../src/lab/birth-text.js';

/** Рождение одной строкой в таблице Поколения (тикет 32). */
describe('откуда Претендент', () => {
  const genes = { scout: 0, tank: 1, ranger: 0, waves: 1 };
  const mutation = { gene: 'scout', change: 'same' } as const;

  it.each([
    [{ kind: 'random' }, 'случайный'],
    [{ kind: 'ready', ready: 1 }, 'готовый «Черепаха»'],
    [{ kind: 'elite', parent: 4 }, 'элита · копия 2·5'],
    [{ kind: 'child', parents: [4], genes, mutations: [mutation, mutation] }, 'мутант 2·5 · 2 мутации'],
    [{ kind: 'child', parents: [4, 8], genes, mutations: [mutation] }, '2·5 × 2·9 · 1 мутация'],
    [{ kind: 'child', parents: [4, 4], genes, mutations: [mutation] }, '2·5 × 2·5 (сам с собой) · 1 мутация'],
    [{ kind: 'child', parents: [0], genes, mutations: [mutation], fromReady: true }, 'мутант «Раш» · 1 мутация'],
  ] as [Birth, string][])('%o → %s', (birth, text) => {
    expect(birthSummary(birth, 3, ['Раш', 'Черепаха'])).toBe(text);
  });

  it('имя в прогоне — Поколение и номер с единицы', () => {
    expect(shortName(3, 11)).toBe('3·12');
  });

  it.each([
    [1, '1 мутация'],
    [2, '2 мутации'],
    [3, '3 мутации'],
    [5, '5 мутаций'],
    [11, '11 мутаций'],
    [21, '21 мутация'],
  ])('%d → %s', (count, text) => {
    expect(mutationsCount(count)).toBe(text);
  });
});

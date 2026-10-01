import { describe, it, expect } from 'vitest';
import { describeRule } from '../src/ui/rule-text.js';

/** Панель выделенного Юнита читает «И» словами (ADR-0005). */
describe('Правило человеческим языком', () => {
  it('«И» читается через «и»', () => {
    const text = describeRule({
      when: [{ kind: 'at-home' }, { kind: 'hp-below', percent: 100 }],
      do: { kind: 'retreat' },
    });
    expect(text).toBe('если у своей Цитадели и здоровье ниже 100% — отступать');
  });

  it('одно Условие и «иначе» — как прежде', () => {
    expect(describeRule({ when: { kind: 'at-home' }, do: { kind: 'hold' } })).toBe('если у своей Цитадели — стоять');
    expect(describeRule({ when: { kind: 'always' }, do: { kind: 'advance' } })).toBe('иначе — идти вперёд');
  });
});

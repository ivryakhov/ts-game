import { describe, it, expect } from 'vitest';
import { ACTION_KINDS, CONDITION_KINDS, parseBehaviour, parseRules, type Condition } from '@sim/index';
import {
  addCondition,
  addRule,
  checkRules,
  draftFromBehaviour,
  freshAction,
  freshCondition,
  moveRule,
  rawBehaviour,
  rawRules,
  removeCondition,
  removeRule,
  setAction,
  setCondition,
  type DraftRules,
} from '../src/app/draft.js';
import playerFile from '../src/behaviours/player.json';

/**
 * Черновик редактора Правил. Сам экран проверяется глазами, но правки
 * черновика не должны ломать структуру, а то, что уходит в матч, — это
 * разбор файла Стороны, уже покрытый тестами.
 */

const { waves: _waves, ...playerRules } = playerFile as Record<string, unknown>;
const draft = draftFromBehaviour(parseBehaviour(playerRules));
const scout = draft.scout;
const kinds = CONDITION_KINDS.filter((kind): kind is Exclude<Condition['kind'], 'always'> => kind !== 'always');
const fallback = (rules: DraftRules) => rules[rules.length - 1];

describe('черновик Правил', () => {
  it('записывается обратно ровно в тот же файл', () => {
    expect(rawBehaviour(draft)).toEqual(playerRules);
  });

  it('новое Правило встаёт над «иначе»', () => {
    const next = addRule(scout);
    expect(next).toHaveLength(scout.length + 1);
    expect(fallback(next)).toEqual(fallback(scout));
  });

  it('«иначе» не удаляется и не двигается, и через него не перепрыгнуть', () => {
    const last = scout.length - 1;
    expect(removeRule(scout, last)).toBe(scout);
    expect(moveRule(scout, last, -1)).toBe(scout);
    expect(moveRule(scout, last - 1, 1)).toBe(scout);
    expect(moveRule(scout, 0, -1)).toBe(scout);
  });

  it('↑ ↓ меняют соседей местами', () => {
    const next = moveRule(scout, 1, -1);
    expect(next[0]).toBe(scout[1]);
    expect(next[1]).toBe(scout[0]);
  });

  it('«+ и» добавляет Условие до трёх, ✕ убирает до одного', () => {
    let rules = addCondition(scout, 0, kinds);
    rules = addCondition(rules, 0, kinds);
    expect(rules[0]?.when).toHaveLength(3);
    expect(addCondition(rules, 0, kinds)).toBe(rules);

    rules = removeCondition(removeCondition(rules, 0, 2), 0, 1);
    expect(rules[0]?.when).toHaveLength(1);
    expect(removeCondition(rules, 0, 0)).toBe(rules);
    expect(checkRules(rules)).toBeNull();
  });

  it('безусловное Правило выше «иначе» из файла остаётся годным, и «И» к нему не добавить', () => {
    const rules: DraftRules = [
      { when: [{ kind: 'always' }], do: { kind: 'hold' } },
      { when: [{ kind: 'always' }], do: { kind: 'advance' } },
    ];
    expect(checkRules(rules)).toBeNull();
    expect(addCondition(rules, 0, kinds)).toBe(rules);
  });

  it('число вне допустимого называется на месте текстом разбора', () => {
    const rules = setCondition(addCondition(scout, 0, kinds), 0, 1, { kind: 'allies-nearby', compare: 'fewer', count: -1 });
    expect(checkRules(rules)).toEqual({
      rule: 0,
      condition: 1,
      what: 'ожидалось целое неотрицательное число, а не -1',
    });
  });

  it('одиночное Условие называется нулевым', () => {
    const rules = setCondition(scout, 0, 0, { kind: 'hp-below', percent: 120 });
    expect(checkRules(rules)).toMatchObject({ rule: 0, condition: 0 });
  });
});

describe('Обелиск в редакторе (тикет 25)', () => {
  it('новые слова есть в списках: Условие — и для «+ и», Действие — и для «иначе»', () => {
    expect(kinds).toContain('obelisk-in-range');
    expect(ACTION_KINDS).toContain('siege-obelisk');
    // Числа у Условия нет: в черновик оно встаёт одним видом.
    expect(freshCondition('obelisk-in-range')).toEqual({ kind: 'obelisk-in-range' });
  });

  it('«чужой Обелиск в радиусе и своих рядом больше 1 → бить Обелиск» проходит разбор файла и уходит в матч как есть', () => {
    let rules = setCondition(scout, 0, 0, freshCondition('obelisk-in-range'));
    rules = setCondition(addCondition(rules, 0, kinds), 0, 1, freshCondition('allies-nearby', 'more'));
    rules = setCondition(rules, 0, 1, { kind: 'allies-nearby', compare: 'more', count: 1 });
    rules = setAction(rules, 0, freshAction('siege-obelisk'));
    rules = setAction(rules, rules.length - 1, freshAction('siege-obelisk'));

    expect(checkRules(rules)).toBeNull();
    const parsed = parseRules(rawRules(rules), 'scout');
    expect(parsed[0]).toEqual({
      when: [{ kind: 'obelisk-in-range' }, { kind: 'allies-nearby', compare: 'more', count: 1 }],
      do: { kind: 'siege-obelisk' },
    });
    expect(parsed.at(-1)).toEqual({ when: { kind: 'always' }, do: { kind: 'siege-obelisk' } });
  });
});

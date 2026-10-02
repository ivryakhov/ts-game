import { describe, it, expect } from 'vitest';
import { DEFAULT_BEHAVIOUR, opponentFromFile, runMatch, TICKS_PER_SECOND } from '@sim/index';
import type { MatchResult, SideId, SideSetup } from '@sim/index';
import { DEFAULT_OPPONENT, loadOpponents, pickOpponent, readOpponents, type Opponent } from '../src/app/opponents.js';
import balanced from '../src/behaviours/opponents/balanced.json';
import index from '../src/behaviours/opponents/index.json';
import { arena } from '../src/maps/arena.js';
import { describeWave } from '../src/ui/opponent-view.js';
import { matchSetup } from './match-setup.js';

/**
 * Набор противников (задача #40): разные характеры и уровни сложности —
 * только файлы Правил и Волн (ADR-0003). Игрок выбирает противника на
 * Подготовке.
 */

/** Двадцать минут — предел матча в игре. */
const GAME_LIMIT = 20 * 60 * TICKS_PER_SECOND;

const roster = loadOpponents(arena, 'B');
const byId = (id: string): Opponent => {
  const found = roster.opponents.find((opponent) => opponent.id === id);
  if (!found) throw new Error(`Нет противника ${id}`);
  return found;
};
/** Тот же противник за другую Сторону: файл один, Сторона — чья очередь. */
const as = (id: string, side: SideId): SideSetup => ({ ...byId(id).side, id: side });

const duel = (a: string, b: string): MatchResult =>
  runMatch(matchSetup({ map: arena, sides: [as(a, 'A'), as(b, 'B')], maxTicks: GAME_LIMIT }));

describe('противники из игры', () => {
  it('каждый файл противника читается без ошибок, в порядке индекса', () => {
    expect(roster.problems).toEqual([]);
    expect(roster.opponents.map((opponent) => opponent.id)).toEqual(index);
    expect(roster.opponents.length).toBeGreaterThanOrEqual(4);
  });

  it('у каждого есть имя и описание в одну строку, и все разные', () => {
    for (const opponent of roster.opponents) {
      expect(opponent.name.trim()).not.toBe('');
      expect(opponent.description).not.toContain('\n');
      expect(opponent.side.waves?.length).toBeGreaterThan(0);
    }
    expect(new Set(roster.opponents.map((opponent) => opponent.name)).size).toBe(roster.opponents.length);
  });

  it.each(index)('«%s» против Поведения по умолчанию доводит матч до победы в пределах лимита', (id) => {
    const result = runMatch(
      matchSetup({ map: arena, sides: [{ id: 'A', behaviour: DEFAULT_BEHAVIOUR }, as(id, 'B')], maxTicks: GAME_LIMIT }),
    );

    expect(result.endReason).toBe('citadel-destroyed');
    expect(result.winner).toBe('B');
  });
});

describe('уровни сложности', () => {
  const levels = ['rush-easy', 'rush-medium', 'rush-hard'] as const;

  it.each([
    [levels[2], levels[0]],
    [levels[2], levels[1]],
    [levels[1], levels[0]],
  ])('«%s» обыгрывает «%s» того же характера на любой Стороне', (strong, weak) => {
    expect(duel(strong, weak).winner).toBe('A');
    expect(duel(weak, strong).winner).toBe('B');
  });
});

describe('разбор набора противников', () => {
  const files = { balanced, broken: { ...balanced, name: '' } };

  it('испорченный файл отвергается с местом ошибки, остальные доступны', () => {
    const read = readOpponents(['balanced', 'broken', 'missing'], files, arena, 'B');

    expect(read.opponents.map((opponent) => opponent.id)).toEqual(['balanced']);
    expect(read.problems).toEqual([
      expect.stringContaining('opponents/broken.json отвергнут — Файл противника, name'),
      expect.stringContaining('«missing», но файла opponents/missing.json нет'),
    ]);
  });

  it('файл вне индекса не теряется молча', () => {
    expect(readOpponents(['balanced'], files, arena, 'B').problems).toEqual([
      expect.stringContaining('opponents/broken.json не указан'),
    ]);
  });

  it('описание в несколько строк и опечатка в Правилах названы по месту', () => {
    expect(() => opponentFromFile('B', { ...balanced, description: 'раз\nдва' }, arena)).toThrow(/description/);
    expect(() => opponentFromFile('B', { ...balanced, scuot: [] }, arena)).toThrow(/лишний ключ «scuot»/);
    expect(() => opponentFromFile('B', { ...balanced, name: undefined }, arena)).toThrow(/name/);
  });

  it('неизвестный противник в адресе — противник по умолчанию', () => {
    expect(pickOpponent(roster.opponents, 'rush-hard')?.id).toBe('rush-hard');
    expect(pickOpponent(roster.opponents, 'nobody')?.id).toBe(DEFAULT_OPPONENT);
    expect(pickOpponent(roster.opponents, null)?.id).toBe(DEFAULT_OPPONENT);
    expect(pickOpponent([], 'balanced')).toBeNull();
  });

  it('Волна на Подготовке — Дорога, состав и цена', () => {
    expect(describeWave({ road: 'short', units: ['tank', 'ranger', 'ranger'] })).toBe(
      'короткая Дорога: Танк, Стрелок, Стрелок — 130 Эфира',
    );
  });
});

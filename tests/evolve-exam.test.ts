import { describe, it, expect } from 'vitest';
import { conditionsOf, createRng, isFallback, opponentFromFile, UNIT_KINDS, type Condition } from '@sim/index';
import { candidateFile, LIMITS, randomCandidate, type Candidate } from '../src/evolve/candidate.js';
import { candidateSide, examBout, EXAM_TICKS, rotateWaves, scoreOf, totalOf } from '../src/evolve/exam.js';
import { loadOpponents } from '../src/app/opponents.js';
import { arena } from '../src/maps/arena.js';

/**
 * Лаборатория (тикет 27): случайные Претенденты из словаря Правил
 * и их Экзамен против Противников игры.
 */

const ROADS = arena.roads.map((road) => road.id);
const roster = loadOpponents(arena, 'B');
const examiner = (id: string) => {
  const found = roster.opponents.find((entry) => entry.id === id);
  if (!found) throw new Error(`Нет Противника ${id}`);
  return { id, side: found.side };
};

function numbersWithinLimits(condition: Condition): boolean {
  switch (condition.kind) {
    case 'hp-below':
      return condition.percent % LIMITS.percentStep === 0 && condition.percent >= 5 && condition.percent <= 100;
    case 'allies-nearby':
      return condition.count >= 0 && condition.count <= LIMITS.count;
    case 'enemies-in-skirmish':
      return condition.above >= 0 && condition.above <= LIMITS.count;
    default:
      return true;
  }
}

function withinLimits(candidate: Candidate): boolean {
  const rulesOk = UNIT_KINDS.every((kind) => {
    const rules = candidate.behaviour[kind];
    const last = rules[rules.length - 1];
    return (
      rules.length >= LIMITS.rules.min &&
      rules.length <= LIMITS.rules.max &&
      last !== undefined &&
      isFallback(last) &&
      rules.every((rule) => {
        const conditions = conditionsOf(rule);
        return conditions.length <= LIMITS.conditions.max && conditions.every(numbersWithinLimits);
      })
    );
  });
  const wavesOk =
    candidate.waves.length >= LIMITS.waves.min &&
    candidate.waves.length <= LIMITS.waves.max &&
    candidate.waves.every((wave) => wave.units.length >= LIMITS.waveUnits.min && wave.units.length <= LIMITS.waveUnits.max);
  return rulesOk && wavesOk;
}

describe('случайный Претендент', () => {
  const rng = createRng(2026);
  const hundred = Array.from({ length: 100 }, () => randomCandidate(rng, ROADS));

  it('сто случайных Претендентов проходят разбор файла Противника', () => {
    for (const candidate of hundred) {
      expect(() => opponentFromFile('A', candidateFile(candidate, 'Претендент', 'случайный'), arena)).not.toThrow();
    }
  });

  it('и держат пределы спеки: Правил, Условий, чисел, Волн', () => {
    for (const candidate of hundred) expect(withinLimits(candidate)).toBe(true);
  });

  it('тот же Сид даёт тех же Претендентов, другой — других', () => {
    const make = (seed: number) => randomCandidate(createRng(seed), ROADS);

    expect(make(7)).toEqual(make(7));
    expect(make(7)).not.toEqual(make(8));
  });
});

describe('Оценка', () => {
  const bout = (outcome: 'win' | 'loss' | 'draw', ticks: number, ownHp: number, foeHp: number) =>
    scoreOf({ outcome, ticks, ownHp, foeHp });

  it('победа выше любого поражения', () => {
    const slowestNarrowWin = bout('win', EXAM_TICKS, 0.01, 0);
    const bestLoss = bout('loss', 100, 0, 0.001);

    expect(slowestNarrowWin).toBeGreaterThan(bestLoss);
  });

  it('быстрая победа выше медленной', () => {
    expect(bout('win', 1000, 1, 0)).toBeGreaterThan(bout('win', 5000, 1, 0));
  });

  it('ничья по пределу ниже победы, даже почти разрушив чужую Цитадель', () => {
    expect(bout('draw', EXAM_TICKS, 1, 0.01)).toBeLessThan(bout('win', EXAM_TICKS, 0.01, 0));
  });

  it('проигравший, но поцарапавший Цитадель, выше не дошедшего', () => {
    expect(bout('loss', 2000, 0, 0.8)).toBeGreaterThan(bout('loss', 2000, 0, 1));
  });
});

describe('Экзамен', () => {
  it('Противник начинает Волны со сдвига по кругу', () => {
    const waves = ['a', 'b', 'c'].map((road) => ({ road, units: ['scout' as const] }));

    expect(rotateWaves(waves, 1).map((wave) => wave.road)).toEqual(['b', 'c', 'a']);
    expect(rotateWaves(waves, 3)).toEqual(waves);
    expect(rotateWaves([], 2)).toEqual([]);
  });

  it('Претендент с Правилами «Раша · Сложного» обыгрывает «Раш · Лёгкий» и получает за это больше тысячи', () => {
    const rush = examiner('rush-hard');
    const side = candidateSide({ behaviour: rush.side.behaviour!, waves: rush.side.waves! }, arena);
    const result = examBout(side, examiner('rush-easy'), 0, arena);

    expect(result.outcome).toBe('win');
    expect(result.foeHp).toBe(0);
    expect(result.score).toBeGreaterThan(1000);
    expect(result.ruleTicks.scout.length).toBe(rush.side.behaviour!.scout.length);
  });

  it('Экзамен случайного Претендента против всех Противников укладывается в предел и даёт сумму Оценок', () => {
    const side = candidateSide(randomCandidate(createRng(5), ROADS), arena);
    const bouts = roster.opponents.map((entry) => examBout(side, { id: entry.id, side: entry.side }, 0, arena));
    const total = totalOf(bouts);

    expect(bouts.map((entry) => entry.opponent)).toEqual(roster.opponents.map((entry) => entry.id));
    for (const entry of bouts) expect(entry.ticks).toBeLessThanOrEqual(EXAM_TICKS);
    expect(total.score).toBe(bouts.reduce((sum, entry) => sum + entry.score, 0));
  });
});

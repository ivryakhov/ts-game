import { describe, it, expect } from 'vitest';
import { createRng, opponentFromFile, UNIT_KINDS } from '@sim/index';
import { candidateFile, randomCandidate, type Candidate } from '../src/evolve/candidate.js';
import { candidateSide, examBout, type Bout } from '../src/evolve/exam.js';
import { crossover, ELITE, firstGeneration, nextGeneration, ranking, type Scored } from '../src/evolve/generation.js';
import { mutate } from '../src/evolve/mutate.js';
import { loadOpponents } from '../src/app/opponents.js';
import { arena } from '../src/maps/arena.js';
import { withinLimits } from './evolve-limits.js';

/**
 * Поколения (тикет 28): мутации, скрещивание, элита и сама эволюция.
 */

const ROADS = arena.roads.map((road) => road.id);
const roster = loadOpponents(arena, 'B');
const examiner = (id: string) => {
  const found = roster.opponents.find((entry) => entry.id === id);
  if (!found) throw new Error(`Нет Противника ${id}`);
  return { id, side: found.side };
};
const asCandidate = (id: string): Candidate => {
  const { side } = examiner(id);
  return { behaviour: side.behaviour!, waves: side.waves! };
};

/** Эволюция в том же процессе: Экзамен — по матчу против одного Противника. */
function evolve(seed: number, size: number, generations: number, opponent: string, stopOnWin = false) {
  const rng = createRng(seed);
  let generation = firstGeneration(rng, size, ROADS);
  const history: { candidates: Candidate[]; best: Bout }[] = [];
  for (let number = 0; number < generations; number += 1) {
    const bouts = generation.map((candidate) => examBout(candidateSide(candidate, arena), examiner(opponent), number, arena));
    const scored: Scored[] = generation.map((candidate, index) => ({ candidate, score: (bouts[index] as Bout).score }));
    const best = bouts[ranking(scored)[0] as number] as Bout;
    history.push({ candidates: generation, best });
    if (stopOnWin && best.outcome === 'win') break;
    generation = nextGeneration(rng, scored, ROADS);
  }
  return history;
}

describe('мутации', () => {
  it('десять тысяч мутаций подряд проходят разбор файла Противника и держат пределы', () => {
    const rng = createRng(11);
    let candidate = randomCandidate(rng, ROADS);
    for (let step = 0; step < 10_000; step += 1) {
      candidate = mutate(rng, candidate, ROADS);
      expect(withinLimits(candidate)).toBe(true);
      if (step % 50 === 0) {
        expect(() => opponentFromFile('A', candidateFile(candidate, 'Мутант', 'проверка'), arena)).not.toThrow();
      }
    }
  });

  it('мутанты готовых Противников тоже проходят разбор', () => {
    const rng = createRng(3);
    for (const opponent of roster.opponents) {
      let candidate = asCandidate(opponent.id);
      for (let step = 0; step < 200; step += 1) candidate = mutate(rng, candidate, ROADS);
      expect(() => opponentFromFile('A', candidateFile(candidate, 'Мутант', 'проверка'), arena)).not.toThrow();
    }
  });

  it('мутация меняет Претендента, но не родителя', () => {
    const rng = createRng(5);
    const parent = randomCandidate(rng, ROADS);
    const copy = structuredClone(parent);
    const child = mutate(rng, parent, ROADS);

    expect(child).not.toEqual(parent);
    expect(parent).toEqual(copy);
  });
});

describe('скрещивание', () => {
  it('ребёнок собран из целых блоков родителей: Поведение каждого типа и Волны', () => {
    const rng = createRng(9);
    const a = asCandidate('turtle');
    const b = asCandidate('rush-hard');
    for (let trial = 0; trial < 20; trial += 1) {
      const child = crossover(rng, a, b);
      for (const kind of UNIT_KINDS) expect([a.behaviour[kind], b.behaviour[kind]]).toContain(child.behaviour[kind]);
      expect([a.waves, b.waves]).toContain(child.waves);
    }
  });
});

describe('Поколение', () => {
  it('два лучших переходят в следующее Поколение без изменений, размер тот же', () => {
    const rng = createRng(1);
    const candidates = Array.from({ length: 10 }, () => randomCandidate(rng, ROADS));
    const scored = candidates.map((candidate, index) => ({ candidate, score: index * 10 }));
    const next = nextGeneration(rng, scored, ROADS);

    expect(next).toHaveLength(10);
    expect(next.slice(0, ELITE)).toEqual([candidates[9], candidates[8]]);
  });

  it('при равной Оценке выше тот, у кого меньше Правил', () => {
    const long = asCandidate('turtle');
    const short = asCandidate('rush-easy');

    expect(ranking([{ candidate: long, score: 5 }, { candidate: short, score: 5 }])).toEqual([1, 0]);
  });

  it('первое Поколение «от готовых» начинается с них самих, дальше — их мутанты', () => {
    const ready = roster.opponents.map((opponent) => asCandidate(opponent.id));
    const generation = firstGeneration(createRng(4), 12, ROADS, ready);

    expect(generation.slice(0, ready.length)).toEqual(ready);
    expect(generation).toHaveLength(12);
    for (const candidate of generation) expect(withinLimits(candidate)).toBe(true);
  });

  it('тот же Сид даёт те же три Поколения', () => {
    const first = evolve(21, 4, 3, 'rush-easy');
    const second = evolve(21, 4, 3, 'rush-easy');

    expect(second.map((entry) => entry.candidates)).toEqual(first.map((entry) => entry.candidates));
  });
});

describe('эволюция', () => {
  it('против «Раша · Среднего» первое Поколение не выигрывает, а за 10 Поколений по 8 находится победитель', () => {
    const history = evolve(2, 8, 10, 'rush-medium', true);

    expect(history[0]?.best.outcome).not.toBe('win');
    expect(history.at(-1)?.best.outcome).toBe('win');
  });
});

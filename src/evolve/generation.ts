import { UNIT_KINDS, type Rng, type Rule, type UnitKind } from '@sim/index';
import type { Birth, Gene } from './birth.js';
import { randomCandidate, ruleCount, type Candidate } from './candidate.js';
import { mutateNoted } from './mutate.js';

/**
 * Поколение за Поколением (спека 0004): лучшие переходят без изменений,
 * остальные — дети. Родители выбираются турниром, скрещиваются блоками
 * и мутируют. Вся случайность — из генератора по Сиду эволюции.
 */

/** Сколько лучших переходит в следующее Поколение без изменений. */
export const ELITE = 2;

/**
 * Элита Поколения этого размера: не больше ELITE и всегда на одного меньше
 * размера. Иначе Поколение из двух целиком занято элитой, детей нет,
 * и эволюция вечно переоценивает одних и тех же.
 */
export const eliteOf = (size: number): number => Math.max(0, Math.min(ELITE, size - 1));
/** Из скольких случайных выбирается родитель. */
export const TOURNAMENT = 3;
/** Доля детей от двух родителей; остальные — мутанты одного. */
export const CROSSOVER = 0.5;

/** Претендент с Оценкой Экзамена. Отвергнутый разбором — с −∞. */
export interface Scored {
  readonly candidate: Candidate;
  readonly score: number;
}

/** Выше Оценка — выше место; при равной — меньше Правил; при равных — раньше в Поколении. */
export function ranking(scored: readonly Scored[]): number[] {
  return scored
    .map((_, index) => index)
    .sort((a, b) => {
      const left = scored[a] as Scored;
      const right = scored[b] as Scored;
      return right.score - left.score || ruleCount(left.candidate) - ruleCount(right.candidate) || a - b;
    });
}

/** Родитель: лучший из нескольких случайных. */
export function tournament(rng: Rng, scored: readonly Scored[]): Candidate {
  return (scored[tournamentIndex(rng, scored)] as Scored).candidate;
}

/** То же — местом родителя в Поколении, для Рождения. */
function tournamentIndex(rng: Rng, scored: readonly Scored[]): number {
  const entrants = Array.from({ length: TOURNAMENT }, () => rng.nextInt(scored.length));
  const [first] = ranking(entrants.map((index) => scored[index] as Scored));
  return entrants[first ?? 0] ?? 0;
}

/**
 * Ребёнок двух родителей: Поведение каждого типа и список Волн целиком
 * от одного из них. Резать списки Правил посередине нельзя: хвост чужого
 * списка под чужими Правилами меняет смысл (исследование 0001, B1).
 */
export function crossover(rng: Rng, a: Candidate, b: Candidate): Candidate {
  return crossoverNoted(rng, a, b).child;
}

/** То же — с записью, какой Ген от какого родителя: 0 — от `a`, 1 — от `b`. */
function crossoverNoted(rng: Rng, a: Candidate, b: Candidate): { child: Candidate; genes: Record<Gene, number> } {
  const behaviour = {} as Record<UnitKind, readonly Rule[]>;
  const genes = {} as Record<Gene, number>;
  for (const kind of UNIT_KINDS) {
    genes[kind] = rng.nextInt(2);
    behaviour[kind] = (genes[kind] === 0 ? a : b).behaviour[kind];
  }
  genes.waves = rng.nextInt(2);
  return { child: { behaviour, waves: (genes.waves === 0 ? a : b).waves }, genes };
}

/** Претендент и его Рождение. */
export interface Born {
  readonly candidate: Candidate;
  readonly birth: Birth;
}

const fromOne = (): Record<Gene, number> => ({ scout: 0, tank: 0, ranger: 0, waves: 0 });

/** Следующее Поколение того же размера. */
export function nextGeneration(rng: Rng, scored: readonly Scored[], roads: readonly string[]): Candidate[] {
  return breed(rng, scored, roads).map((born) => born.candidate);
}

/**
 * Следующее Поколение с Рождением каждого (спека 0005). Генератор
 * тратится в том же порядке, что и без записи: те же Поколения.
 */
export function breed(rng: Rng, scored: readonly Scored[], roads: readonly string[]): Born[] {
  const elite: Born[] = ranking(scored)
    .slice(0, eliteOf(scored.length))
    .map((parent) => ({ candidate: (scored[parent] as Scored).candidate, birth: { kind: 'elite', parent } }));
  const children = Array.from({ length: Math.max(0, scored.length - elite.length) }, (): Born => {
    const first = tournamentIndex(rng, scored);
    const a = (scored[first] as Scored).candidate;
    let parents = [first];
    let genes = fromOne();
    let child = a;
    if (rng.next() < CROSSOVER) {
      const second = tournamentIndex(rng, scored);
      const crossed = crossoverNoted(rng, a, (scored[second] as Scored).candidate);
      parents = [first, second];
      genes = crossed.genes;
      child = crossed.child;
    }
    const { candidate, mutations } = mutateNoted(rng, child, roads);
    return { candidate, birth: { kind: 'child', parents, genes, mutations } };
  });
  return [...elite, ...children];
}

/**
 * Первое Поколение: случайные Претенденты или, если даны готовые
 * Противники, они сами и их мутанты — по кругу, пока Поколение не полно.
 */
export function firstGeneration(
  rng: Rng,
  size: number,
  roads: readonly string[],
  ready: readonly Candidate[] = [],
): Candidate[] {
  return firstBorn(rng, size, roads, ready).map((born) => born.candidate);
}

/** Первое Поколение с Рождением каждого: случайный, готовый или мутант готового. */
export function firstBorn(rng: Rng, size: number, roads: readonly string[], ready: readonly Candidate[] = []): Born[] {
  if (ready.length === 0) {
    return Array.from({ length: size }, () => ({ candidate: randomCandidate(rng, roads), birth: { kind: 'random' } }));
  }
  const originals: Born[] = ready.slice(0, size).map((candidate, index) => ({ candidate, birth: { kind: 'ready', ready: index } }));
  const mutants = Array.from({ length: size - originals.length }, (): Born => {
    const parent = rng.nextInt(ready.length);
    const { candidate, mutations } = mutateNoted(rng, ready[parent] as Candidate, roads);
    return { candidate, birth: { kind: 'child', parents: [parent], genes: fromOne(), mutations, fromReady: true } };
  });
  return [...originals, ...mutants];
}

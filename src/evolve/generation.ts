import { UNIT_KINDS, type Rng, type Rule, type UnitKind } from '@sim/index';
import { pick, randomCandidate, ruleCount, type Candidate } from './candidate.js';
import { mutateSome } from './mutate.js';

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
  const entrants = Array.from({ length: TOURNAMENT }, () => rng.nextInt(scored.length)).map((index) => ({
    index,
    entry: scored[index] as Scored,
  }));
  const [first] = ranking(entrants.map(({ entry }) => entry));
  return (entrants[first ?? 0] as { entry: Scored }).entry.candidate;
}

/**
 * Ребёнок двух родителей: Поведение каждого типа и список Волн целиком
 * от одного из них. Резать списки Правил посередине нельзя: хвост чужого
 * списка под чужими Правилами меняет смысл (исследование 0001, B1).
 */
export function crossover(rng: Rng, a: Candidate, b: Candidate): Candidate {
  const behaviour = {} as Record<UnitKind, readonly Rule[]>;
  for (const kind of UNIT_KINDS) behaviour[kind] = (rng.nextInt(2) === 0 ? a : b).behaviour[kind];
  return { behaviour, waves: (rng.nextInt(2) === 0 ? a : b).waves };
}

/** Следующее Поколение того же размера. */
export function nextGeneration(rng: Rng, scored: readonly Scored[], roads: readonly string[]): Candidate[] {
  const elite = ranking(scored)
    .slice(0, eliteOf(scored.length))
    .map((index) => (scored[index] as Scored).candidate);
  const children = Array.from({ length: Math.max(0, scored.length - elite.length) }, () => {
    const parent = tournament(rng, scored);
    const child = rng.next() < CROSSOVER ? crossover(rng, parent, tournament(rng, scored)) : parent;
    return mutateSome(rng, child, roads);
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
  if (ready.length === 0) return Array.from({ length: size }, () => randomCandidate(rng, roads));
  const originals = ready.slice(0, size);
  const mutants = Array.from({ length: size - originals.length }, () => mutateSome(rng, pick(rng, ready), roads));
  return [...originals, ...mutants];
}

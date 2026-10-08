import { fadeBirth, type FadedBirth } from '../evolve/birth.js';
import { ruleCount } from '../evolve/candidate.js';
import type { Bout } from '../evolve/exam.js';
import { scoreOfEntry, type Entry, type Origin } from './view.js';

/**
 * Поколения прогона в памяти страницы (спека 0005, «Память»): полные
 * снимки последних Поколений и выцветшие — более ранних.
 */

/**
 * Сколько Претендентов хранится полностью — с Правилами, Стороной,
 * матчами и мутациями «было и стало» (спека 0005, «Память»): 100
 * Поколений по 32. Более ранние Поколения выцветают.
 */
export const FULL_BUDGET = 3_200;

/**
 * Выцветший Претендент: то, что нужно таблице и Родословной, без
 * Правил, Стороны и матчей — десятки байт вместо килобайтов.
 */
export interface Faded {
  readonly number: number;
  readonly generation: number;
  readonly origin: Origin;
  readonly birth: FadedBirth | undefined;
  readonly score: number;
  readonly wins: number;
  readonly draws: number;
  readonly played: number;
  readonly rules: number;
}

/**
 * Поколение прогона, каким его видно в памяти страницы: Претенденты
 * с Рождениями и, когда следующее уже собрано, сколько детей у каждого.
 * У выцветшего Поколения `entries` пуст, а Претенденты — в `faded`.
 */
export interface Snapshot {
  /** С единицы. */
  readonly number: number;
  entries: readonly Entry[];
  faded: readonly Faded[] | null;
  children: readonly number[] | null;
}

function fadedOf(entry: Entry): Faded {
  const bouts = entry.bouts.filter((bout): bout is Bout => bout !== null);
  return {
    number: entry.number,
    generation: entry.generation ?? 0,
    origin: entry.origin,
    birth: entry.birth && fadeBirth(entry.birth),
    score: scoreOfEntry(entry),
    wins: bouts.filter((bout) => bout.outcome === 'win').length,
    draws: bouts.filter((bout) => bout.outcome === 'draw').length,
    played: bouts.length,
    rules: ruleCount(entry.candidate),
  };
}

/**
 * Выцветить старейшие полные Поколения, пока полных Претендентов больше
 * предела. Идущее Поколение не выцветает никогда.
 */
export function fadeBeyond(generations: readonly Snapshot[], budget: number): void {
  let full = generations.reduce((sum, snapshot) => sum + snapshot.entries.length, 0);
  for (const snapshot of generations.slice(0, -1)) {
    if (full <= budget) return;
    if (snapshot.faded) continue;
    full -= snapshot.entries.length;
    snapshot.faded = snapshot.entries.map(fadedOf);
    snapshot.entries = [];
  }
}

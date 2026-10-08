import { UNIT_KINDS, type Rule, type UnitKind, type Wave } from '@sim/index';
import type { Candidate } from './candidate.js';

/**
 * Рождение Претендента (спека 0005): элита он или ребёнок, от кого, какой
 * Ген от какого родителя и какие мутации легли сверху — данными: что было
 * и что стало. Текст из них строит Лаборатория.
 *
 * Мутация записывается сравнением Претендента до и после неё: каждая
 * мутация списка спеки 0004 меняет ровно одно место одного Гена —
 * изменяет, вставляет, удаляет или переставляет. Так запись не трогает
 * генератор случайности, и эволюция идёт как шла (ADR-0001).
 */

/** Ген — то, что ребёнок берёт целиком от одного родителя. */
export type Gene = UnitKind | 'waves';
export const GENES: readonly Gene[] = [...UNIT_KINDS, 'waves'];

type Item = Rule | Wave;

/** Одна мутация: где и что. `same` — мутация случилась, но ничего не поменяла (порог на краю сетки). */
export type Mutation =
  | { readonly gene: Gene; readonly change: 'changed'; readonly at: number; readonly before: Item; readonly after: Item }
  | { readonly gene: Gene; readonly change: 'inserted'; readonly at: number; readonly after: Item }
  | { readonly gene: Gene; readonly change: 'removed'; readonly at: number; readonly before: Item }
  | { readonly gene: Gene; readonly change: 'swapped'; readonly at: number; readonly other: number }
  | { readonly gene: Gene; readonly change: 'same' };

/**
 * Как Претендент появился в Поколении. Номера родителей — места
 * в прошлом Поколении (с нуля), а у первого Поколения «от готовых» —
 * места в списке готовых Противников.
 */
export type Birth =
  | { readonly kind: 'random' }
  | { readonly kind: 'ready'; readonly ready: number }
  | { readonly kind: 'elite'; readonly parent: number }
  | {
      readonly kind: 'child';
      /** Один родитель — мутант, два — скрещивание. */
      readonly parents: readonly number[];
      /** Какой Ген от какого родителя: место в `parents`. */
      readonly genes: Readonly<Record<Gene, number>>;
      readonly mutations: readonly Mutation[];
      /** Родители — готовые Противники, а не прошлое Поколение. */
      readonly fromReady?: true;
    };

export const geneOf = (candidate: Candidate, gene: Gene): readonly Item[] =>
  gene === 'waves' ? candidate.waves : candidate.behaviour[gene];

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Что одна мутация сделала с Претендентом. */
export function mutationBetween(before: Candidate, after: Candidate): Mutation {
  const gene = GENES.find((entry) => !same(geneOf(before, entry), geneOf(after, entry)));
  if (!gene) {
    // Ничего не поменялось: Ген — тот, чей список пересобран.
    return { gene: GENES.find((entry) => geneOf(before, entry) !== geneOf(after, entry)) ?? 'waves', change: 'same' };
  }
  const old = geneOf(before, gene);
  const now = geneOf(after, gene);
  const first = old.findIndex((item, index) => !same(item, now[index]));
  const at = first < 0 ? Math.min(old.length, now.length) : first;
  if (now.length === old.length + 1) return { gene, change: 'inserted', at, after: now[at] as Item };
  if (now.length === old.length - 1) return { gene, change: 'removed', at, before: old[at] as Item };
  const differ = old.flatMap((item, index) => (same(item, now[index]) ? [] : [index]));
  const [a, b] = differ;
  if (differ.length === 2 && a !== undefined && b !== undefined && same(old[a], now[b]) && same(old[b], now[a])) {
    return { gene, change: 'swapped', at: a, other: b };
  }
  return { gene, change: 'changed', at, before: old[at] as Item, after: now[at] as Item };
}

function withGene(candidate: Candidate, gene: Gene, items: readonly Item[]): Candidate {
  return gene === 'waves'
    ? { ...candidate, waves: items as readonly Wave[] }
    : { ...candidate, behaviour: { ...candidate.behaviour, [gene]: items as readonly Rule[] } };
}

/** Применить записанную мутацию — так из родительских Генов получается сам ребёнок. */
export function applyMutation(candidate: Candidate, mutation: Mutation): Candidate {
  const items = [...geneOf(candidate, mutation.gene)];
  switch (mutation.change) {
    case 'same':
      return candidate;
    case 'changed':
      items[mutation.at] = mutation.after;
      break;
    case 'inserted':
      items.splice(mutation.at, 0, mutation.after);
      break;
    case 'removed':
      items.splice(mutation.at, 1);
      break;
    case 'swapped': {
      const a = items[mutation.at] as Item;
      items[mutation.at] = items[mutation.other] as Item;
      items[mutation.other] = a;
      break;
    }
  }
  return withGene(candidate, mutation.gene, items);
}

/**
 * Сколько детей у каждого Претендента прошлого Поколения: сколько Рождений
 * на него ссылается — копией элиты или родителем. Ребёнок от двух
 * родителей засчитывается обоим, от одного и того же дважды — один раз.
 */
export function childrenOf(births: readonly Birth[], size: number): number[] {
  const counts = Array.from({ length: size }, () => 0);
  for (const birth of births) {
    const parents = birth.kind === 'elite' ? [birth.parent] : birth.kind === 'child' && !birth.fromReady ? birth.parents : [];
    for (const parent of new Set(parents)) if (parent < size) counts[parent] = (counts[parent] ?? 0) + 1;
  }
  return counts;
}

/**
 * Мутация выцветшего Поколения (спека 0005, «Память»): что и где
 * произошло, без Правил и Волн «было и стало» — их держать дорого,
 * а для Родословной хватает Гена, вида и номера.
 */
export interface MutationMark {
  readonly gene: Gene;
  readonly change: Mutation['change'];
  readonly at?: number;
  readonly other?: number;
}

/** Рождение выцветшего Претендента: то же, но мутации — отметками. */
export type FadedBirth =
  | Exclude<Birth, { kind: 'child' }>
  | (Omit<Extract<Birth, { kind: 'child' }>, 'mutations'> & { readonly mutations: readonly MutationMark[] });

export function markOf(mutation: Mutation): MutationMark {
  const { gene, change } = mutation;
  if (mutation.change === 'same') return { gene, change };
  if (mutation.change === 'swapped') return { gene, change, at: mutation.at, other: mutation.other };
  return { gene, change, at: mutation.at };
}

export function fadeBirth(birth: Birth): FadedBirth {
  return birth.kind === 'child' ? { ...birth, mutations: birth.mutations.map(markOf) } : birth;
}

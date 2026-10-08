import type { Birth, FadedBirth } from '../evolve/birth.js';
import type { Snapshot } from './snapshots.js';
import { scoreOfEntry, type Entry } from './view.js';

/**
 * Родословная Претендента (спека 0005): его предки Поколение за
 * Поколением, по Рождениям. Чистая функция над Поколениями прогона:
 * DOM ей не нужен, и её проверяет тест.
 */

/** Претендент в прогоне: Поколение и номер в нём, оба с единицы. */
export interface Ref {
  readonly generation: number;
  readonly number: number;
}

/** Претендент в Родословной: полный — с Правилами, выцветший — без. */
export interface Member {
  readonly ref: Ref;
  readonly birth: Birth | FadedBirth | undefined;
  readonly score: number;
  /** Полный Претендент, если его Поколение ещё не выцвело. */
  readonly entry: Entry | null;
}

/** Предки одного Поколения. */
export interface Level {
  readonly generation: number;
  readonly members: readonly Member[];
}

/** Претендент из Поколений прогона — полный или выцветший; null — такого нет. */
export function memberOf(generations: readonly Snapshot[], ref: Ref): Member | null {
  const snapshot = generations.find((entry) => entry.number === ref.generation);
  if (!snapshot) return null;
  const entry = snapshot.entries[ref.number - 1];
  if (entry) return { ref, birth: entry.birth, score: scoreOfEntry(entry), entry };
  const faded = snapshot.faded?.[ref.number - 1];
  return faded ? { ref, birth: faded.birth, score: faded.score, entry: null } : null;
}

/**
 * Родители по Рождению — места в прошлом Поколении. У случайного,
 * готового и мутанта готового родителей в прогоне нет: на них Родословная
 * кончается.
 */
export function parentsOf(birth: Birth | FadedBirth | undefined): readonly number[] {
  if (!birth) return [];
  if (birth.kind === 'elite') return [birth.parent];
  if (birth.kind === 'child' && !birth.fromReady) return [...new Set(birth.parents)];
  return [];
}

/**
 * Предки по Поколениям вглубь — от родителей до первого Поколения или
 * до Претендентов без родителей в прогоне. Претендент встречается
 * в Поколении один раз, даже если он предок по нескольким линиям.
 */
export function lineage(generations: readonly Snapshot[], ref: Ref): Level[] {
  const levels: Level[] = [];
  let current = [memberOf(generations, ref)].filter((member): member is Member => member !== null);
  for (let generation = ref.generation - 1; generation >= 1 && current.length > 0; generation -= 1) {
    const numbers = [...new Set(current.flatMap((member) => parentsOf(member.birth)))].sort((a, b) => a - b);
    const members = numbers
      .map((index) => memberOf(generations, { generation, number: index + 1 }))
      .filter((member): member is Member => member !== null);
    if (members.length === 0) break;
    levels.push({ generation, members });
    current = members;
  }
  return levels;
}

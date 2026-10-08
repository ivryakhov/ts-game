import type { Rule, Wave } from '@sim/index';
import { GENES, type Birth, type FadedBirth, type Gene, type Mutation, type MutationMark } from '../evolve/birth.js';
import { describeWave } from '../ui/opponent-view.js';
import { describeRule, UNIT_TITLES } from '../ui/rule-text.js';

/** Тип Юнита в родительном падеже — для «Правила Разведчика». */
const UNIT_GENITIVE = { scout: 'Разведчика', tank: 'Танка', ranger: 'Стрелка' } as const;

/**
 * Рождение словами — для таблицы Поколения (спека 0005). Претендент
 * в прогоне зовётся «Поколение·номер»: родители ребёнка Поколения N —
 * из Поколения N − 1.
 */

/** «Поколение·номер» по месту с нуля. */
export const shortName = (generation: number, index: number): string => `${generation}·${index + 1}`;

/** 1 мутация, 2 мутации, 5 мутаций. */
export function mutationsCount(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  const word = tens >= 11 && tens <= 14 ? 'мутаций' : ones === 1 ? 'мутация' : ones >= 2 && ones <= 4 ? 'мутации' : 'мутаций';
  return `${count} ${word}`;
}

/**
 * Откуда Претендент одной строкой: «случайный», «готовый «Черепаха»»,
 * «элита · копия 2·5», «мутант 2·5 · 2 мутации», «2·5 × 2·9 · 1 мутация»;
 * у ребёнка Поколения N родители — из Поколения N − 1.
 * `readyNames` — имена готовых Противников, с которых начат прогон.
 */
export function birthSummary(birth: Birth | FadedBirth | undefined, generation: number, readyNames: readonly string[] = []): string {
  if (!birth) return '';
  const parent = (index: number): string => shortName(generation - 1, index);
  const ready = (index: number): string => `«${readyNames[index] ?? `готовый №${index + 1}`}»`;
  switch (birth.kind) {
    case 'random':
      return 'случайный';
    case 'ready':
      return `готовый ${ready(birth.ready)}`;
    case 'elite':
      return `элита · копия ${parent(birth.parent)}`;
    case 'child': {
      const mutations = mutationsCount(birth.mutations.length);
      if (birth.fromReady) return `мутант ${ready(birth.parents[0] ?? 0)} · ${mutations}`;
      const [first, second] = birth.parents;
      // Турнир может дважды выбрать одного: скрещивание с собой — тот же мутант.
      const parents =
        second === undefined
          ? `мутант ${parent(first ?? 0)}`
          : second === first
            ? `${parent(first)} × ${parent(second)} (сам с собой)`
            : `${parent(first ?? 0)} × ${parent(second)}`;
      return `${parents} · ${mutations}`;
    }
  }
}

/** Ген словами: «Правила Разведчика», «Волны». */
const GENE_TITLES: Readonly<Record<Gene, string>> = {
  scout: `Правила ${UNIT_GENITIVE.scout}`,
  tank: `Правила ${UNIT_GENITIVE.tank}`,
  ranger: `Правила ${UNIT_GENITIVE.ranger}`,
  waves: 'Волны',
};

function itemText(gene: Gene, item: Rule | Wave): string {
  return gene === 'waves' ? describeWave(item as Wave) : describeRule(item as Rule);
}

/** «Правило 3» или «Волна 2» — с единицы. */
const itemName = (gene: Gene, at: number): string => `${gene === 'waves' ? 'Волна' : 'Правило'} ${at + 1}`;

/** «вставлено Правило», но «вставлена Волна». */
const done = (gene: Gene, verb: 'вставлен' | 'удалён' | 'изменён'): string =>
  gene === 'waves' ? `${verb.replace('ё', 'е')}а` : `${verb.replace('ё', 'е')}о`;

/**
 * Мутация словами (спека 0005): «Стрелок, Правило 3: «…» → «…»». У
 * выцветшего Поколения Правил «было и стало» уже нет — только что и где.
 */
export function mutationText(mutation: Mutation | MutationMark): string {
  const where = mutation.gene === 'waves' ? 'Волны' : UNIT_TITLES[mutation.gene];
  const full = 'before' in mutation || 'after' in mutation;
  switch (mutation.change) {
    case 'same':
      return `${where}: мутация ничего не изменила — число уже на краю сетки или Действие выпало то же`;
    case 'swapped':
      return `${where}: ${itemName(mutation.gene, mutation.at ?? 0)} и ${itemName(mutation.gene, mutation.other ?? 0).toLowerCase()} поменялись местами`;
    case 'inserted':
      return full && 'after' in mutation
        ? `${where}: ${done(mutation.gene, 'вставлен')} ${itemName(mutation.gene, mutation.at ?? 0)} — «${itemText(mutation.gene, mutation.after)}»`
        : `${where}: ${done(mutation.gene, 'вставлен')} ${itemName(mutation.gene, mutation.at ?? 0)}`;
    case 'removed':
      return full && 'before' in mutation
        ? `${where}: ${done(mutation.gene, 'удалён')} ${itemName(mutation.gene, mutation.at ?? 0)} — «${itemText(mutation.gene, mutation.before)}»`
        : `${where}: ${done(mutation.gene, 'удалён')} ${itemName(mutation.gene, mutation.at ?? 0)}`;
    case 'changed':
      return full && 'before' in mutation && 'after' in mutation
        ? `${where}, ${itemName(mutation.gene, mutation.at ?? 0)}: «${itemText(mutation.gene, mutation.before)}» → «${itemText(mutation.gene, mutation.after)}»`
        : `${where}: ${done(mutation.gene, 'изменён')} ${itemName(mutation.gene, mutation.at ?? 0)}`;
  }
}

/**
 * Какой Ген от какого родителя: «Правила Разведчика и Волны — от 2·5,
 * Правила Танка и Стрелка — от 2·9». У мутанта одного родителя — всё от него.
 */
export function genesText(birth: Extract<Birth | FadedBirth, { kind: 'child' }>, generation: number, readyNames: readonly string[] = []): string {
  const parentName = (index: number): string =>
    birth.fromReady ? `«${readyNames[index] ?? `готовый №${index + 1}`}»` : shortName(generation - 1, index);
  const [first, second] = birth.parents;
  if (second === undefined || second === first) return `Все Гены — от ${parentName(first ?? 0)}`;
  return [first, second]
    .map((parent, side) => {
      const genes = GENES.filter((gene) => birth.genes[gene] === side).map((gene) => GENE_TITLES[gene]);
      return genes.length === 0 ? null : `${genes.join(', ')} — от ${parentName(parent ?? 0)}`;
    })
    .filter((line): line is string => line !== null)
    .join('; ');
}

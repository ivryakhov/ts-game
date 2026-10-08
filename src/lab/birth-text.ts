import type { Birth, FadedBirth } from '../evolve/birth.js';

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

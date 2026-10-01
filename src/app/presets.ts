import { filePart, isRecord, parseRules, type Rule } from '@sim/index';

/**
 * Заготовки — готовые списки Правил, с которых игрок начинает, а не
 * собирает типичное Поведение с нуля. Лежат данными в
 * src/behaviours/presets.json рядом с файлами Сторон. Заготовка не
 * привязана к типу: её можно применить на любой вкладке игрока.
 */
export interface Preset {
  readonly name: string;
  readonly rules: readonly Rule[];
}

/** Ещё одна Заготовка, которой нет в файле: список типа из player.json. */
export const FROM_FILE = 'Из файла';

const { fail } = filePart('Заготовки');

/**
 * Каждая Заготовка проходит тот же разбор, что Правила одного типа в файле
 * Стороны; место ошибки начинается с её названия: `Осторожный[2].when`.
 */
export function parsePresets(raw: unknown): readonly Preset[] {
  if (!isRecord(raw)) throw fail('корень', 'ожидался объект «название: список Правил»');
  return Object.entries(raw).map(([name, rules]) => {
    if (name === FROM_FILE) throw fail(name, 'это название занято списком из player.json');
    return { name, rules: parseRules(rules, name) };
  });
}

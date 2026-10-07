import { UNIT_KINDS, type Rule, type UnitKind } from '@sim/index';
import type { Candidate } from './candidate.js';
import type { Bout } from './exam.js';

/**
 * Вычистка Претендента перед сохранением (спека 0004): Правила, которые
 * за весь Экзамен не исполнялись ни одного Юнито-Тика, удаляются,
 * последнее «всегда» остаётся. Игры это не меняет: Правило, ни разу
 * не оказавшееся первым истинным, без него не станет и решать иначе —
 * а читать Выведенного Противника становится проще.
 */
export function prune(candidate: Candidate, bouts: readonly (Bout | null)[]): Candidate {
  const played = bouts.filter((bout): bout is Bout => bout !== null);
  const behaviour = {} as Record<UnitKind, readonly Rule[]>;
  for (const kind of UNIT_KINDS) {
    const rules = candidate.behaviour[kind];
    const used = (index: number): boolean => played.some((bout) => (bout.ruleTicks[kind][index] ?? 0) > 0);
    behaviour[kind] = rules.filter((_, index) => index === rules.length - 1 || used(index));
  }
  return { behaviour, waves: candidate.waves };
}

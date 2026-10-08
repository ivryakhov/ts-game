/**
 * Выбор Претендента в таблице, когда прогон переходит к следующему
 * Поколению. Выбор в идущем Поколении сбрасывается — того Претендента
 * в новом нет. Выбор в просматриваемом прошлом Поколении остаётся:
 * оно не изменилось, и подробности не должны подменяться лучшим.
 */
export function selectionAfterAdvance(viewing: number | null, selected: number | null): number | null {
  return viewing === null ? null : selected;
}

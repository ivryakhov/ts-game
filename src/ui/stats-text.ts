import { TICKS_PER_SECOND, UNIT_STATS, type UnitKind } from '@sim/index';

/**
 * Характеристики типа Юнита человеческим языком — для карточки на
 * Подготовке. Правила пишутся вслепую, если не видно, сколько у Юнита
 * здоровья, как далеко он бьёт и видит.
 *
 * Скорость и урон в таблице баланса заданы за Тик, а игрок думает
 * секундами — пересчёт здесь.
 */

export interface StatLine {
  readonly label: string;
  readonly value: string;
}

/** Не больше одного знака после запятой: 22.6, а не 22.599999. */
const shortly = (value: number): string => String(Math.round(value * 10) / 10);

export function describeStats(kind: UnitKind): readonly StatLine[] {
  const stats = UNIT_STATS[kind];
  return [
    { label: 'здоровье', value: String(stats.maxHp) },
    { label: 'урон', value: `${shortly(stats.damagePerTick * TICKS_PER_SECOND)}/с` },
    { label: 'удар', value: stats.ranged ? 'дальний' : 'ближний' },
    { label: 'дальность', value: shortly(stats.range) },
    { label: 'Обзор', value: shortly(stats.sight) },
    { label: 'скорость', value: `${shortly(stats.speedPerTick * TICKS_PER_SECOND)}/с` },
    { label: 'цена', value: `${stats.cost} Эфира` },
  ];
}

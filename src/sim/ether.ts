import { ECONOMY, OBELISK_STATS, TICKS_PER_SECOND, UNIT_STATS, type UnitKind } from './balance.js';
import type { EtherSnapshot, SideId } from './types.js';

/**
 * Эфир — единственная валюта. Копится сам по себе и тратится на Юнитов.
 *
 * Доход задан в секунду, а начисляется по Тикам: так число в панели
 * означает ровно то, что видит игрок, а симуляция остаётся привязанной
 * к Тику, а не к часам (ADR-0001).
 */
export interface Purse {
  readonly side: SideId;
  amount: number;
}

export function createPurses(sides: readonly SideId[]): Map<SideId, Purse> {
  return new Map(sides.map((side) => [side, { side, amount: ECONOMY.startingEther }]));
}

/** Чем владеет Сторона из того, что приносит доход. */
type Holding = { readonly owner: SideId | null };

/** Полный доход Стороны в секунду: базовый и по прибавке за каждый свой Обелиск. */
export function incomePerSecond(side: SideId, obelisks: readonly Holding[]): number {
  const owned = obelisks.filter((obelisk) => obelisk.owner === side).length;
  return ECONOMY.incomePerSecond + owned * OBELISK_STATS.incomePerSecond;
}

export function collectIncome(purses: ReadonlyMap<SideId, Purse>, obelisks: readonly Holding[]): void {
  for (const purse of purses.values()) {
    purse.amount += incomePerSecond(purse.side, obelisks) / TICKS_PER_SECOND;
  }
}

/**
 * Пытается оплатить Юнита. Возвращает false, если Эфира не хватает, —
 * и тогда со счёта не снимается ничего.
 */
export function payForUnit(purse: Purse | undefined, kind: UnitKind): boolean {
  const cost = UNIT_STATS[kind].cost;
  if (!purse || purse.amount < cost) return false;
  purse.amount -= cost;
  return true;
}

export function etherSnapshots(
  purses: ReadonlyMap<SideId, Purse>,
  obelisks: readonly Holding[],
): readonly EtherSnapshot[] {
  return [...purses.values()].map((purse) => ({
    side: purse.side,
    amount: purse.amount,
    incomePerSecond: incomePerSecond(purse.side, obelisks),
  }));
}

import { ECONOMY, TICKS_PER_SECOND, UNIT_STATS } from './balance.js';
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

const INCOME_PER_TICK = ECONOMY.incomePerSecond / TICKS_PER_SECOND;

export function createPurses(sides: readonly SideId[]): Map<SideId, Purse> {
  return new Map(sides.map((side) => [side, { side, amount: ECONOMY.startingEther }]));
}

export function collectIncome(purses: ReadonlyMap<SideId, Purse>): void {
  for (const purse of purses.values()) purse.amount += INCOME_PER_TICK;
}

/**
 * Пытается оплатить Юнита. Возвращает false, если Эфира не хватает, —
 * и тогда со счёта не снимается ничего.
 */
export function payForUnit(purse: Purse | undefined): boolean {
  if (!purse || purse.amount < UNIT_STATS.cost) return false;
  purse.amount -= UNIT_STATS.cost;
  return true;
}

export function etherSnapshots(purses: ReadonlyMap<SideId, Purse>): readonly EtherSnapshot[] {
  return [...purses.values()].map((purse) => ({
    side: purse.side,
    amount: purse.amount,
    incomePerSecond: ECONOMY.incomePerSecond,
  }));
}

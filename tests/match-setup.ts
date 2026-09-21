import { ECONOMY, TICKS_PER_SECOND, UNIT_STATS } from '@sim/index';
import type { MatchSetup, ScheduledRelease, SideId, UnitKind } from '@sim/index';

/**
 * Настройка матча по умолчанию для тестов: пустая карта, две Стороны,
 * никаких действий игрока. Каждый тест меняет только то, что проверяет.
 */
export function matchSetup(overrides: Partial<MatchSetup> = {}): MatchSetup {
  return {
    seed: 1,
    map: { size: { width: 1200, height: 840 }, citadels: [], roads: [], resourcePoints: [] },
    sides: [{ id: 'A' }, { id: 'B' }],
    releases: [],
    maxTicks: 100,
    ...overrides,
  };
}

/**
 * Армия, выпущенная одной волной: копим Эфир на всех сразу и выпускаем
 * подряд в том порядке, в каком перечислены, — первыми идут те, кто
 * должен встать щитом. Выпуск по одному против отвечающей Цитадели
 * бессмыслен: одиночек стены выбивают, не успев потерять здоровья.
 */
export function wave(
  kinds: readonly UnitKind[],
  side: SideId = 'A',
  roadId = 'short',
): ScheduledRelease[] {
  const cost = kinds.reduce((sum, kind) => sum + UNIT_STATS[kind].cost, 0);
  const perTick = ECONOMY.incomePerSecond / TICKS_PER_SECOND;
  const start = Math.max(1, Math.ceil((cost - ECONOMY.startingEther) / perTick) + 1);
  return kinds.map((unit, index) => ({ tick: start + index, side, kind: 'deploy', roadId, unit }));
}

/** Состав, который при нынешнем балансе берёт Цитадель. */
export const STORMING_PARTY: readonly UnitKind[] = ['tank', 'tank', 'ranger', 'ranger'];

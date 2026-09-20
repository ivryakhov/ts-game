import type { MatchSetup } from '@sim/index';

/**
 * Настройка матча по умолчанию для тестов: пустая карта, две Стороны,
 * никаких действий игрока. Каждый тест меняет только то, что проверяет.
 */
export function matchSetup(overrides: Partial<MatchSetup> = {}): MatchSetup {
  return {
    seed: 1,
    map: { citadels: [], roads: [], resourcePoints: [] },
    sides: [{ id: 'A' }, { id: 'B' }],
    playerActions: [],
    maxTicks: 100,
    ...overrides,
  };
}

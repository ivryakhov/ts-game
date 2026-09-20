import { validateMap } from './map-validation.js';
import { createRng } from './rng.js';
import type { MatchEvent, MatchResult, MatchSetup, SideId } from './types.js';
import { advance, createWorld, snapshot, type World } from './world.js';

/**
 * Единственная точка входа в симуляцию и единственный сейм для тестов.
 *
 * Прогоняет матч целиком и возвращает исход. Ничего не знает о рендере,
 * реальном времени и браузере: одинаковый Сид и одинаковые действия дают
 * идентичный результат (ADR-0001).
 */
export function runMatch(setup: MatchSetup): MatchResult {
  validateMap(setup.map);

  const rng = createRng(setup.seed);
  const world: World = createWorld(setup);
  const events: MatchEvent[] = [{ kind: 'match-started', tick: 0, seed: setup.seed }];

  while (world.tick < setup.maxTicks) {
    advance(world, rng, events);
  }

  events.push({ kind: 'match-ended', tick: world.tick, reason: 'tick-limit' });

  return {
    winner: null,
    ticks: world.tick,
    endReason: 'tick-limit',
    events,
    finalState: snapshot(world),
    stats: { rngDraws: rng.draws },
  };
}

export type { SideId };

import { validateActions, validateMap } from './map-validation.js';
import { createRng } from './rng.js';
import type { MatchEvent, MatchResult, MatchSetup, WorldSnapshot } from './types.js';
import { advance, createWorld, snapshot, type World } from './world.js';

/**
 * Матч, идущий по одному Тику за раз. Интерактивная игра крутит его
 * кадрами, тесты и Автопрогон — циклом до конца. Обе дороги ведут через
 * один и тот же код, поэтому увиденное в браузере и проверенное тестом
 * не могут разойтись.
 */
export interface LiveMatch {
  /**
   * Выполнить один Тик и вернуть случившееся в нём. События нужны показу:
   * без них он не отличит погибшего Юнита от дошедшего, а на ускоренном
   * воспроизведении потеряет и те и другие между кадрами.
   */
  step(): readonly MatchEvent[];
  snapshot(): WorldSnapshot;
  readonly finished: boolean;
  /** Итог матча. До окончания показывает положение дел на текущий Тик. */
  result(): MatchResult;
}

export function createMatch(setup: MatchSetup): LiveMatch {
  validateMap(setup.map);
  validateActions(setup);

  const rng = createRng(setup.seed);
  const world: World = createWorld(setup);
  const events: MatchEvent[] = [{ kind: 'match-started', tick: 0, seed: setup.seed }];
  let ended = false;

  const finish = (): void => {
    if (ended) return;
    ended = true;
    events.push({ kind: 'match-ended', tick: world.tick, reason: 'tick-limit' });
  };

  if (setup.maxTicks <= 0) finish();

  return {
    step(): readonly MatchEvent[] {
      if (ended) return [];

      const before = events.length;
      advance(world, rng, events);
      if (world.tick >= setup.maxTicks) finish();

      return events.slice(before);
    },

    snapshot: () => snapshot(world),

    get finished(): boolean {
      return ended;
    },

    result(): MatchResult {
      return {
        winner: null,
        ticks: world.tick,
        endReason: 'tick-limit',
        events,
        finalState: snapshot(world),
        stats: { rngDraws: rng.draws },
      };
    },
  };
}

/**
 * Единственная точка входа для тестов и Автопрогона: прогоняет матч
 * целиком и возвращает исход. Ничего не знает о рендере, реальном времени
 * и браузере — одинаковый Сид и одинаковые действия дают идентичный
 * результат (ADR-0001).
 */
export function runMatch(setup: MatchSetup): MatchResult {
  const match = createMatch(setup);
  while (!match.finished) match.step();
  return match.result();
}

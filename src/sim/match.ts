import { validateRelease, validateReleases, validateMap } from './map-validation.js';
import { createRng } from './rng.js';
import { validateSide } from './side-file.js';
import type {
  EndReason,
  UnscheduledRelease,
  MatchEvent,
  MatchResult,
  MatchSetup,
  ScheduledRelease,
  SideId,
  WorldSnapshot,
} from './types.js';
import { advance, createWorld, schedule, snapshot, type World } from './world.js';

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
  /**
   * Выпустить Юнита по ходу матча. Действие исполнится на ближайшем ещё
   * не сыгранном Тике, поэтому выбор, сделанный на паузе, не теряется,
   * а ускорение не сдвигает его во времени.
   *
   * Негодное действие отвергается здесь же: бросок из середины Тика
   * навсегда остановил бы цикл кадров в браузере.
   *
   * Возвращает Выпуск с назначенным Тиком — его можно записать и подать
   * в другой матч расписанием; после конца матча — null.
   */
  deploy(action: UnscheduledRelease): ScheduledRelease | null;
  readonly finished: boolean;
  /** Победитель, когда матч окончен; иначе null. */
  readonly winner: SideId | null;
  /** Итог матча. До окончания показывает положение дел на текущий Тик. */
  result(): MatchResult;
}

export function createMatch(setup: MatchSetup): LiveMatch {
  validateMap(setup.map);
  validateReleases(setup);
  for (const side of setup.sides) validateSide(side, setup.map);

  const rng = createRng(setup.seed);
  const world: World = createWorld(setup);
  const events: MatchEvent[] = [{ kind: 'match-started', tick: 0, seed: setup.seed }];
  let ended = false;

  let endReason: EndReason = 'tick-limit';
  let winner: SideId | null = null;

  const finish = (reason: EndReason): void => {
    if (ended) return;
    ended = true;
    endReason = reason;
    events.push({ kind: 'match-ended', tick: world.tick, reason });
  };

  if (setup.maxTicks <= 0) finish('tick-limit');

  return {
    step(): readonly MatchEvent[] {
      if (ended) return [];

      const before = events.length;
      advance(world, rng, events);

      if (world.defeated) {
        winner = world.sides.find((side) => side !== world.defeated) ?? null;
        finish('citadel-destroyed');
      } else if (world.tick >= setup.maxTicks) {
        finish('tick-limit');
      }

      return events.slice(before);
    },

    snapshot: () => snapshot(world),

    deploy(action: UnscheduledRelease): ScheduledRelease | null {
      if (ended) return null;
      const scheduled = { ...action, tick: world.tick + 1 };
      validateRelease(scheduled, setup.map, setup.maxTicks);
      schedule(world, scheduled);
      return scheduled;
    },

    get finished(): boolean {
      return ended;
    },

    get winner(): SideId | null {
      return winner;
    },

    result(): MatchResult {
      return {
        winner,
        ticks: world.tick,
        endReason,
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

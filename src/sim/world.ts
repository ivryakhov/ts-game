import type { Rng } from './rng.js';
import type { MatchEvent, MatchSetup, SideId, WorldSnapshot } from './types.js';

/**
 * Изменяемое состояние мира. Живёт только внутри одного матча и наружу
 * отдаётся исключительно снимком: рендер читает снимок и не может тронуть
 * состояние (ADR-0001).
 */
export interface World {
  tick: number;
  /** Порядок Сторон фиксирован порядком в настройке матча и дальше не меняется. */
  readonly sides: readonly SideId[];
}

export function createWorld(setup: MatchSetup): World {
  return { tick: 0, sides: setup.sides.map((side) => side.id) };
}

/**
 * Один шаг симуляции. Пока в мире нет ни одной сущности, шагать нечем —
 * Юниты появятся в тикете 03, Стычка в тикете 05. Сигнатура задана сразу
 * целиком, потому что она и есть контракт Тика: шаг видит мир, источник
 * случайности и журнал, и больше ничего. В частности, он не видит реального
 * времени — ни в каком виде.
 */
export function advance(world: World, _rng: Rng, _events: MatchEvent[]): void {
  world.tick += 1;
}

export function snapshot(world: World): WorldSnapshot {
  return { tick: world.tick, sides: [...world.sides] };
}

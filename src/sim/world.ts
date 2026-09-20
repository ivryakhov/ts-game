import { measureRoad, type RoadMetrics } from './geometry.js';
import type { MatchEvent, MatchSetup, ScheduledAction, SideId, WorldSnapshot } from './types.js';
import type { Rng } from './rng.js';
import { createUnit, moveUnit, unitSnapshot, type Unit } from './unit.js';

/**
 * Изменяемое состояние мира. Живёт только внутри одного матча и наружу
 * отдаётся исключительно снимком: рендер читает снимок и не может тронуть
 * состояние (ADR-0001).
 */
export interface World {
  tick: number;
  /** Порядок Сторон фиксирован порядком в настройке матча и дальше не меняется. */
  readonly sides: readonly SideId[];
  /** Юниты в порядке появления: он выводится из расписания, а не из того,
   *  как коллекция устроена внутри, поэтому обход воспроизводим. */
  units: Unit[];
  readonly roads: ReadonlyMap<string, RoadRuntime>;
  /** Действия игрока, разложенные по Тикам, на которые они назначены. */
  readonly schedule: ReadonlyMap<number, readonly ScheduledAction[]>;
  nextUnitId: number;
}

/** Дорога, готовая к работе: промеры плюс то, чьи Цитадели она соединяет. */
export interface RoadRuntime {
  readonly from: SideId;
  readonly to: SideId;
  readonly metrics: RoadMetrics;
}

export function createWorld(setup: MatchSetup): World {
  const schedule = new Map<number, ScheduledAction[]>();
  for (const action of setup.playerActions) {
    const atTick = schedule.get(action.tick) ?? [];
    atTick.push(action);
    schedule.set(action.tick, atTick);
  }

  return {
    tick: 0,
    sides: setup.sides.map((side) => side.id),
    units: [],
    roads: new Map(
      setup.map.roads.map((road) => [
        road.id,
        { from: road.from, to: road.to, metrics: measureRoad(road) },
      ]),
    ),
    schedule,
    nextUnitId: 1,
  };
}

/**
 * Один шаг симуляции: сперва вступают в силу действия, назначенные на этот
 * Тик, затем двигаются Юниты. Порядок строго такой и не зависит ни от чего
 * внешнего — в этом весь смысл фиксированного Тика (ADR-0001).
 */
export function advance(world: World, _rng: Rng, events: MatchEvent[]): void {
  world.tick += 1;

  for (const action of world.schedule.get(world.tick) ?? []) applyAction(world, action, events);

  moveUnits(world, events);
}

/** Расписание и карта проверены при создании матча, поэтому Дорога обязана найтись. */
function roadOf(world: World, roadId: string): RoadRuntime {
  const road = world.roads.get(roadId);
  if (!road) throw new Error(`Дороги ${roadId} нет на карте`);
  return road;
}

function applyAction(world: World, action: ScheduledAction, events: MatchEvent[]): void {
  const road = roadOf(world, action.roadId);

  const unit = createUnit(world.nextUnitId, action.side, action.roadId, action.side === road.from);
  world.nextUnitId += 1;
  world.units.push(unit);

  events.push({
    kind: 'unit-deployed',
    tick: world.tick,
    unitId: unit.id,
    side: unit.side,
    roadId: unit.roadId,
  });
}

function moveUnits(world: World, events: MatchEvent[]): void {
  const surviving: Unit[] = [];

  for (const unit of world.units) {
    if (moveUnit(unit, roadOf(world, unit.roadId).metrics)) {
      events.push({
        kind: 'unit-arrived',
        tick: world.tick,
        unitId: unit.id,
        side: unit.side,
        roadId: unit.roadId,
      });
      continue;
    }

    surviving.push(unit);
  }

  world.units = surviving;
}

export function snapshot(world: World): WorldSnapshot {
  return {
    tick: world.tick,
    sides: [...world.sides],
    units: world.units.map((unit) => unitSnapshot(unit, roadOf(world, unit.roadId).metrics)),
  };
}

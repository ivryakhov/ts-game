import { measureRoad, type RoadMetrics } from './geometry.js';
import type {
  MatchEvent,
  MatchSetup,
  ScheduledRelease,
  SideId,
  UnitId,
  WorldSnapshot,
} from './types.js';
import type { Rng } from './rng.js';
import {
  bombard,
  citadelSnapshots,
  createCitadels,
  defend,
  type Citadel,
  type InReach,
} from './citadel.js';
import { choose, surroundingsOn } from './behave.js';
import { applyPlan } from './combat.js';
import { CITADEL_STATS } from './balance.js';
import { collectIncome, createPurses, etherSnapshots, payForUnit, type Purse } from './ether.js';
import { planSkirmish } from './skirmish.js';
import { DEFAULT_BEHAVIOUR, type Behaviour } from './rules.js';
import { moveUnits } from './movement.js';
import { createUnit, unitSnapshot, type Unit } from './unit.js';

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
  readonly citadels: ReadonlyMap<SideId, Citadel>;
  /** Поведение каждой Стороны: по нему её Юниты решают, что делать. */
  readonly behaviours: ReadonlyMap<SideId, Behaviour>;
  readonly purses: ReadonlyMap<SideId, Purse>;
  /** Сторона, чья Цитадель пала. Пока никто не пал — null. */
  defeated: SideId | null;
  /** Выпуски, разложенные по Тикам, на которые они назначены. */
  readonly schedule: Map<number, ScheduledRelease[]>;
  nextUnitId: number;
}

/** Дорога, готовая к работе: промеры плюс то, чьи Цитадели она соединяет. */
export interface RoadRuntime {
  readonly from: SideId;
  readonly to: SideId;
  readonly metrics: RoadMetrics;
}

/** Ставит Выпуск в очередь на указанный Тик. */
export function schedule(world: World, action: ScheduledRelease): void {
  const atTick = world.schedule.get(action.tick) ?? [];
  atTick.push(action);
  world.schedule.set(action.tick, atTick);
}

export function createWorld(setup: MatchSetup): World {
  const sides = setup.sides.map((side) => side.id);

  const world: World = {
    tick: 0,
    sides,
    units: [],
    citadels: createCitadels(sides),
    behaviours: new Map(
      setup.sides.map((side) => [side.id, side.behaviour ?? DEFAULT_BEHAVIOUR]),
    ),
    purses: createPurses(sides),
    defeated: null,
    roads: new Map(
      setup.map.roads.map((road) => [
        road.id,
        { from: road.from, to: road.to, metrics: measureRoad(road) },
      ]),
    ),
    schedule: new Map(),
    nextUnitId: 1,
  };

  for (const action of setup.releases) schedule(world, action);
  return world;
}

/**
 * Один шаг симуляции. Порядок строго такой и не зависит ни от чего
 * внешнего — в этом весь смысл фиксированного Тика (ADR-0001):
 *
 * 1. начисляется доход и вступают в силу действия этого Тика;
 * 2. по расстановке определяется, кто дерётся, кто ждёт, кто идёт,
 *    одновременно наносится урон и убираются погибшие;
 * 3. двигаются те, кому ничто не мешает, и Колонны выравниваются;
 * 4. осаждающие бьют чужие Цитадели;
 * 5. Цитадели отвечают ударом со стен.
 */
export function advance(world: World, _rng: Rng, events: MatchEvent[]): void {
  world.tick += 1;

  collectIncome(world.purses);
  for (const action of world.schedule.get(world.tick) ?? []) applyRelease(world, action, events);

  decide(world);
  fight(world, events);
  moveUnits(world, events);
  siege(world, events);
  holdTheWalls(world, events);
}

/** Каждый Юнит выбирает Действие по Правилам своей Стороны. */
function decide(world: World): void {
  for (const [roadId, onRoad] of unitsByRoad(world)) {
    const around = surroundingsOn(onRoad, roadOf(world, roadId).metrics.length);

    for (const unit of onRoad) {
      const behaviour = world.behaviours.get(unit.side) ?? DEFAULT_BEHAVIOUR;
      const surroundings = around.get(unit.id);
      if (surroundings) unit.intent = choose(behaviour, unit, surroundings);
    }
  }
}

function unitsByRoad(world: World): Map<string, Unit[]> {
  const byRoad = new Map<string, Unit[]>();
  for (const unit of world.units) {
    const onRoad = byRoad.get(unit.roadId);
    if (onRoad) onRoad.push(unit);
    else byRoad.set(unit.roadId, [unit]);
  }
  return byRoad;
}

/**
 * Цитадели отвечают ударом. Расстояние меряется вдоль Дороги от самой
 * Цитадели: для Юнита, идущего к ней, это остаток его пути.
 */
function holdTheWalls(world: World, events: MatchEvent[]): void {
  const reachOf = (side: SideId): readonly InReach[] =>
    world.units.flatMap((unit) => {
      const road = roadOf(world, unit.roadId);
      const target = unit.forward ? road.to : road.from;
      if (target !== side) return [];

      const distance = road.metrics.length - unit.travelled;
      return distance <= CITADEL_STATS.range ? [{ unit, distance }] : [];
    });

  const fallen = defend(world.citadels, reachOf, world.tick, events);
  if (fallen.size > 0) world.units = world.units.filter((unit) => !fallen.has(unit.id));
}

/** Дошедшие до чужой Цитадели бьют её, пока она стоит. */
function siege(world: World, events: MatchEvent[]): void {
  const besiegers = world.units
    .filter((unit) => unit.state === 'sieging')
    .map((unit) => {
      const road = roadOf(world, unit.roadId);
      return { unit, target: unit.forward ? road.to : road.from };
    });
  if (besiegers.length === 0) return;

  for (const side of bombard(besiegers, world.citadels, world.tick, events)) {
    world.defeated = side;
  }
}

function fight(world: World, events: MatchEvent[]): void {
  const fallen = new Set<UnitId>();

  for (const [roadId, onRoad] of unitsByRoad(world)) {
    const plan = planSkirmish(onRoad, roadOf(world, roadId).metrics.length);
    for (const id of applyPlan(onRoad, plan, world.tick, events)) fallen.add(id);
  }

  if (fallen.size > 0) world.units = world.units.filter((unit) => !fallen.has(unit.id));
}

/** Расписание и карта проверены при создании матча, поэтому Дорога обязана найтись. */
export function roadOf(world: World, roadId: string): RoadRuntime {
  const road = world.roads.get(roadId);
  if (!road) throw new Error(`Дороги ${roadId} нет на карте`);
  return road;
}

function applyRelease(world: World, action: ScheduledRelease, events: MatchEvent[]): void {
  const road = roadOf(world, action.roadId);

  if (!payForUnit(world.purses.get(action.side), action.unit)) {
    events.push({
      kind: 'deploy-refused',
      tick: world.tick,
      side: action.side,
      roadId: action.roadId,
      unit: action.unit,
      reason: 'not-enough-ether',
    });
    return;
  }

  const unit = createUnit(
    world.nextUnitId,
    action.side,
    action.unit,
    action.roadId,
    action.side === road.from,
  );
  world.nextUnitId += 1;
  world.units.push(unit);

  events.push({
    kind: 'unit-deployed',
    tick: world.tick,
    unitId: unit.id,
    side: unit.side,
    roadId: unit.roadId,
    unit: unit.kind,
  });
}

export function snapshot(world: World): WorldSnapshot {
  return {
    tick: world.tick,
    sides: [...world.sides],
    units: world.units.map((unit) => unitSnapshot(unit, roadOf(world, unit.roadId).metrics)),
    citadels: citadelSnapshots(world.citadels),
    ether: etherSnapshots(world.purses),
  };
}

import { measureRoad, type RoadMetrics } from './geometry.js';
import type {
  MatchEvent,
  MatchSetup,
  ScheduledAction,
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
import { applyPlan } from './combat.js';
import { CITADEL_STATS, SKIRMISH } from './balance.js';
import { collectIncome, createPurses, etherSnapshots, payForUnit, type Purse } from './ether.js';
import { planSkirmish } from './skirmish.js';
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
  readonly citadels: ReadonlyMap<SideId, Citadel>;
  readonly purses: ReadonlyMap<SideId, Purse>;
  /** Сторона, чья Цитадель пала. Пока никто не пал — null. */
  defeated: SideId | null;
  /** Действия игрока, разложенные по Тикам, на которые они назначены. */
  readonly schedule: Map<number, ScheduledAction[]>;
  nextUnitId: number;
}

/** Дорога, готовая к работе: промеры плюс то, чьи Цитадели она соединяет. */
export interface RoadRuntime {
  readonly from: SideId;
  readonly to: SideId;
  readonly metrics: RoadMetrics;
}

/** Ставит действие игрока в очередь на указанный Тик. */
export function schedule(world: World, action: ScheduledAction): void {
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

  for (const action of setup.playerActions) schedule(world, action);
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
  for (const action of world.schedule.get(world.tick) ?? []) applyAction(world, action, events);

  fight(world, events);
  moveUnits(world, events);
  siege(world, events);
  holdTheWalls(world, events);
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
  const byRoad = new Map<string, Unit[]>();

  for (const unit of world.units) {
    const onRoad = byRoad.get(unit.roadId);
    if (onRoad) onRoad.push(unit);
    else byRoad.set(unit.roadId, [unit]);
  }

  for (const [roadId, onRoad] of byRoad) {
    const plan = planSkirmish(onRoad, roadOf(world, roadId).metrics.length);
    for (const id of applyPlan(onRoad, plan, world.tick, events)) fallen.add(id);
  }

  if (fallen.size > 0) world.units = world.units.filter((unit) => !fallen.has(unit.id));
}

/** Расписание и карта проверены при создании матча, поэтому Дорога обязана найтись. */
function roadOf(world: World, roadId: string): RoadRuntime {
  const road = world.roads.get(roadId);
  if (!road) throw new Error(`Дороги ${roadId} нет на карте`);
  return road;
}

function applyAction(world: World, action: ScheduledAction, events: MatchEvent[]): void {
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

function moveUnits(world: World, events: MatchEvent[]): void {
  const surviving: Unit[] = [];

  for (const unit of world.units) {
    if (unit.state !== 'moving') {
      surviving.push(unit);
      continue;
    }

    // Дошедший не исчезает и никуда больше не идёт: он принимается
    // за чужую Цитадель и стоит у неё, пока его не убьют.
    if (unit.arrived) {
      unit.state = 'sieging';
      surviving.push(unit);
      continue;
    }

    if (moveUnit(unit, roadOf(world, unit.roadId).metrics)) {
      unit.arrived = true;
      unit.arrivedAt = world.tick;
      unit.state = 'sieging';
      events.push({
        kind: 'unit-arrived',
        tick: world.tick,
        unitId: unit.id,
        side: unit.side,
        roadId: unit.roadId,
      });
    }

    surviving.push(unit);
  }

  world.units = surviving;
  keepFormation(world);
}

/**
 * Юнит не обгоняет своих по Дороге: догнав вышедшего раньше, он держится
 * за его спиной.
 *
 * Порядок задаёт старшинство — кто раньше вышел, тот и впереди, — а не
 * пройденный путь. Упорядочивать по пути значит узаконить обгон: быстрый
 * Стрелок, успев за Тик пройти больше Танка, становился «передним»,
 * и зажимали уже Танка. Тогда стрелять из-за спин, ради чего Стрелок
 * и заведён, было бы негде, а к стенам первым приходил бы он.
 */
function keepFormation(world: World): void {
  const columns = new Map<string, Unit[]>();

  for (const unit of world.units) {
    if (unit.arrived) continue;
    const key = `${unit.roadId}:${unit.side}`;
    const column = columns.get(key);
    if (column) column.push(unit);
    else columns.set(key, [unit]);
  }

  for (const column of columns.values()) {
    column.sort((left, right) => left.id - right.id);

    for (let index = 1; index < column.length; index += 1) {
      const unit = column[index];
      const ahead = column[index - 1];
      if (!unit || !ahead) continue;
      // Ниже нуля не опускаем: иначе Юнит, зажатый Колонной у самой
      // Цитадели, уезжает за начало Дороги.
      unit.travelled = Math.max(0, Math.min(unit.travelled, ahead.travelled - SKIRMISH.spacing));
    }
  }
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
